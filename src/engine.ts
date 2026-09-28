/**
 * IntentEngine — the main orchestrator. See README §"How it works" for
 * the full pipeline. The engine is intentionally small: it stitches
 * together recognizers, slot extractors, the fusion strategy and the
 * router, and it is responsible for:
 *
 *  - timeout enforcement (per-stage and global)
 *  - hook firing (with try/catch isolation)
 *  - slot merge / validate / default application
 *  - graceful degradation when `execute` is blocked by missing slots
 */
import { nanoid } from 'nanoid';
import { ConfigError, TimeoutError } from './errors.js';
import {
  computeMissingSlots,
  computeSlotFillRate,
  mergeSlots,
} from './slots/merge.js';
import { resolveEngineConfig, type IntentEngineConfig, type ResolvedEngineConfig } from './config.js';
import type { Recognizer } from './recognizers/base.js';
import type { SlotExtractor } from './slots/base.js';
import type {
  IntentContext,
  IntentDefinition,
  IntentResult,
  RecognizerOutput,
  Slots,
} from './types.js';
import { bindHooks, type IntentHooks } from './observability/hooks.js';
import { recordActionMetric } from './observability/metrics.js';
import type { Logger } from './utils/logger.js';

interface RecognizerTaskResult {
  name: string;
  output: RecognizerOutput | null;
  latencyMs: number;
}

interface ExtractorTaskResult {
  name: string;
  slots: Slots | null;
  latencyMs: number;
}

/** Promise that resolves with the value or rejects after `ms` ms. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string, traceId: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms, { traceId })), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Build a clarification prompt that asks for the missing required slots. */
function buildSlotClarification(intent: IntentDefinition, missing: string[]): string {
  const prompts = missing
    .map((name) => intent.slots.find((s) => s.name === name)?.prompt)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (prompts.length > 0) return prompts.join(' ');
  return `To complete "${intent.label}", please provide: ${missing.join(', ')}.`;
}

export class IntentEngine {
  private cfg: ResolvedEngineConfig;
  private logger: Logger;
  private hooks: Required<IntentHooks>;
  private disposed = false;

  constructor(config: IntentEngineConfig) {
    this.cfg = resolveEngineConfig(config);
    this.logger = this.cfg.logger;
    this.hooks = bindHooks(this.cfg.hooks, this.logger);
  }

  /** Run `init()` on every recognizer and slot extractor. Idempotent. */
  async init(): Promise<void> {
    for (const rec of this.cfg.recognizers) {
      if (rec.init) await rec.init();
    }
    for (const ex of this.cfg.slotExtractors) {
      if (ex.init) await ex.init();
    }
  }

  /** Dispose every plug-in. Safe to call multiple times. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const rec of this.cfg.recognizers) {
      try {
        if (rec.dispose) await rec.dispose();
      } catch (err) {
        this.logger.warn(`Recognizer ${rec.name} dispose failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    for (const ex of this.cfg.slotExtractors) {
      try {
        if (ex.dispose) await ex.dispose();
      } catch (err) {
        this.logger.warn(`SlotExtractor ${ex.name} dispose failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Dynamic registry helpers
  // -------------------------------------------------------------------------

  registerIntent(def: IntentDefinition): void {
    this.cfg.registry.register(def);
  }

  toggleRecognizer(name: string, enabled: boolean): void {
    const rec = this.cfg.recognizers.find((r) => r.name === name);
    if (!rec) throw new ConfigError(`Unknown recognizer: ${name}`);
    rec.enabled = enabled;
  }

  toggleSlotExtractor(name: string, enabled: boolean): void {
    const ex = this.cfg.slotExtractors.find((e) => e.name === name);
    if (!ex) throw new ConfigError(`Unknown slot extractor: ${name}`);
    ex.enabled = enabled;
  }

  // -------------------------------------------------------------------------
  // Main entry points
  // -------------------------------------------------------------------------

  async recognize(input: string, context?: IntentContext): Promise<IntentResult> {
    return this.run(input, context);
  }

  async recognizeBatch(inputs: string[], context?: IntentContext): Promise<IntentResult[]> {
    return Promise.all(inputs.map((input) => this.run(input, context)));
  }

  // -------------------------------------------------------------------------
  // Pipeline
  // -------------------------------------------------------------------------

  private async run(input: string, context: IntentContext | undefined): Promise<IntentResult> {
    const startedAt = Date.now();
    const traceId = nanoid();
    this.cfg.metrics?.increment('intent_agent_kit.recognize.start');

    let ctx: IntentContext = context ?? {};
    try {
      ctx = await this.cfg.contextProvider.load(ctx);
    } catch (err) {
      this.logger.warn('ContextProvider failed; using raw context', {
        error: err instanceof Error ? err.message : String(err),
        traceId,
      });
    }
    this.hooks.onRecognizeStart(input, ctx);

    // 1. Run recognizers.
    const outputs = await this.runRecognizers(input, ctx, traceId);

    // 2. Fuse.
    const fusionStart = Date.now();
    const fused = this.safeFuse(outputs, traceId);
    this.hooks.onFusionComplete(fused, Date.now() - fusionStart);

    // 3. Route.
    const routed = this.cfg.router.route(fused, ctx, this.cfg.routerConfig);

    // 4. Slot extraction (only when intent is actionable).
    const needsSlots = routed.action === 'execute' || routed.action === 'clarify';
    let slots: Slots = fused?.slots ?? {};
    let missingSlots: string[] = [];
    let slotFillRate = 0;

    if (needsSlots && fused) {
      const intent = this.cfg.registry.get(fused.intent);
      if (!intent) {
        this.logger.warn(`Unknown intent "${fused.intent}" in registry`, { traceId });
      } else {
        const result = await this.runSlotExtractors(input, ctx, intent, traceId);
        slots = mergeSlots(slots, result.slots, intent);
        missingSlots = computeMissingSlots(slots, intent);
        slotFillRate = computeSlotFillRate(slots, intent);
        this.hooks.onSlotExtractComplete(slots, missingSlots, slotFillRate);
      }
    }

    // 5. Demote `execute` to `clarify` when required slots are missing.
    let action = routed.action;
    let clarificationPrompt: string | undefined = routed.clarificationPrompt;
    if (action === 'execute' && missingSlots.length > 0) {
      action = 'clarify';
      const intent = fused ? this.cfg.registry.get(fused.intent) : undefined;
      clarificationPrompt = intent
        ? buildSlotClarification(intent, missingSlots)
        : `Please provide: ${missingSlots.join(', ')}.`;
    }

    // 6. Resolve Agent action identifier.
    let resolvedAction: string | undefined;
    if (action === 'execute' && fused) {
      const intent = this.cfg.registry.get(fused.intent);
      if (this.cfg.actionResolver) {
        resolvedAction = this.cfg.actionResolver(fused.intent);
      } else if (intent?.action) {
        resolvedAction = intent.action;
      } else if (routed.resolvedAction) {
        resolvedAction = routed.resolvedAction;
      }
    }

    const result: IntentResult = {
      intent: fused?.intent ?? '',
      confidence: fused?.confidence ?? 0,
      slots,
      source: fused?.source ?? 'none',
      alternatives: fused?.alternatives ?? [],
      contributions: fused?.contributions ?? [],
      action,
      ...(resolvedAction !== undefined ? { resolvedAction } : {}),
      missingSlots,
      slotFillRate,
      ...(clarificationPrompt !== undefined ? { clarificationPrompt } : {}),
      latencyMs: Date.now() - startedAt,
      traceId,
    };

    recordActionMetric(this.cfg.metrics, action);
    this.hooks.onRouteComplete(result);
    return result;
  }

  // -------------------------------------------------------------------------
  // Recognizer orchestration
  // -------------------------------------------------------------------------

  private async runRecognizers(
    input: string,
    ctx: IntentContext,
    traceId: string
  ): Promise<RecognizerOutput[]> {
    const active = this.cfg.recognizers.filter((r) => r.enabled);
    const tasks = active.map((rec) => this.runOneRecognizer(rec, input, ctx, traceId));

    if (!this.cfg.parallel) {
      const out: RecognizerOutput[] = [];
      for (const t of tasks) {
        const r = await t;
        if (r.output) out.push(r.output);
        if (
          r.output &&
          this.tryShortCircuit(r.name, r.output)
        ) {
          break;
        }
      }
      return out;
    }

    const settled = await Promise.all(tasks);
    const out: RecognizerOutput[] = [];
    let shortCircuit = false;
    for (const r of settled) {
      if (!r.output) continue;
      out.push(r.output);
      if (shortCircuit) continue;
      const rec = active.find((x) => x.name === r.name);
      if (rec && rec.shortCircuitable && rec.shouldShortCircuit?.(r.output)) {
        shortCircuit = true;
      }
    }
    return out;
  }

  private async runOneRecognizer(
    rec: Recognizer,
    input: string,
    ctx: IntentContext,
    traceId: string
  ): Promise<RecognizerTaskResult> {
    const startedAt = Date.now();
    try {
      const output = await withTimeout(
        Promise.resolve(rec.recognize(input, ctx, this.cfg.registry.getAll())),
        this.cfg.timeoutMs,
        `recognizer:${rec.name}`,
        traceId
      );
      const latency = Date.now() - startedAt;
      this.hooks.onRecognizerComplete(rec.name, output, latency);
      return { name: rec.name, output, latencyMs: latency };
    } catch (err) {
      const latency = Date.now() - startedAt;
      const error = err instanceof Error ? err : new Error(String(err));
      this.hooks.onRecognizerError(rec.name, error);
      this.hooks.onError(error, `recognizer:${rec.name}`);
      this.logger.warn(`Recognizer ${rec.name} threw`, {
        error: error.message,
        traceId,
      });
      return { name: rec.name, output: null, latencyMs: latency };
    }
  }

  private tryShortCircuit(name: string, output: RecognizerOutput): boolean {
    const rec = this.cfg.recognizers.find((r) => r.name === name);
    if (!rec || !rec.shortCircuitable) return false;
    return rec.shouldShortCircuit?.(output) ?? false;
  }

  // -------------------------------------------------------------------------
  // Slot extraction orchestration
  // -------------------------------------------------------------------------

  private async runSlotExtractors(
    input: string,
    ctx: IntentContext,
    intent: IntentDefinition,
    traceId: string
  ): Promise<{ slots: Slots | null }> {
    const active = this.cfg.slotExtractors.filter((e) => e.enabled);
    if (active.length === 0) return { slots: null };
    this.hooks.onSlotExtractStart(intent.label, active.map((e) => e.name));

    const tasks = active.map((ex) => this.runOneExtractor(ex, input, ctx, intent, traceId));
    const settled = await Promise.all(tasks);

    // Merge in priority order (lowest first; later overwrites earlier).
    const priorityMap = new Map(active.map((e) => [e.name, e.priority]));
    const ordered = [...settled].sort((a, b) => {
      const pa = priorityMap.get(a.name) ?? 0;
      const pb = priorityMap.get(b.name) ?? 0;
      return pa - pb;
    });

    let merged: Slots = {};
    let any = false;
    for (const t of ordered) {
      if (!t.slots) continue;
      any = true;
      merged = mergeSlots(merged, t.slots, intent);
    }
    return { slots: any ? merged : null };
  }

  private async runOneExtractor(
    ex: SlotExtractor,
    input: string,
    ctx: IntentContext,
    intent: IntentDefinition,
    traceId: string
  ): Promise<ExtractorTaskResult> {
    const startedAt = Date.now();
    try {
      const slots = await withTimeout(
        Promise.resolve(ex.extract(input, ctx, intent)),
        this.cfg.timeoutMs,
        `slot:${ex.name}`,
        traceId
      );
      const latency = Date.now() - startedAt;
      this.hooks.onSlotExtractorComplete(ex.name, slots, latency);
      return { name: ex.name, slots, latencyMs: latency };
    } catch (err) {
      const latency = Date.now() - startedAt;
      const error = err instanceof Error ? err : new Error(String(err));
      this.hooks.onSlotExtractorError(ex.name, error);
      this.hooks.onError(error, `slot:${ex.name}`);
      this.logger.warn(`SlotExtractor ${ex.name} threw`, {
        error: error.message,
        traceId,
      });
      return { name: ex.name, slots: null, latencyMs: latency };
    }
  }

  // -------------------------------------------------------------------------
  // Fusion with safe error handling
  // -------------------------------------------------------------------------

  private safeFuse(outputs: RecognizerOutput[], traceId: string): ReturnType<ResolvedEngineConfig['fusion']['fuse']> {
    try {
      return this.cfg.fusion.fuse(outputs, this.cfg.fusionConfig);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Fusion failed', {
        error: error.message,
        traceId,
      });
      this.hooks.onError(error, 'fusion');
      return null;
    }
  }
}
