/**
 * Recognizer contract — every recognizer (rule / vector / llm / custom)
 * implements this interface. The engine treats them as opaque units that
 * either yield a `RecognizerOutput` or `null` (no match).
 */
import type { IntentContext, IntentDefinition, RecognizerOutput } from '../types.js';

/** Default weight used by the fusion strategy when no per-source weight is configured. */
export const DEFAULT_RECOGNIZER_WEIGHTS: Record<string, number> = {
  rule: 1.3,
  vector: 0.8,
  llm: 1.0,
};

export interface Recognizer<TInput = string> {
  /** Stable identifier — referenced in weights, metrics, errors. */
  readonly name: string;
  /** Lower numbers run first when `parallel=false`. Ties broken by name. */
  readonly priority: number;
  /** Set to false to temporarily disable without removing from the engine. */
  enabled: boolean;
  /** Whether this recognizer can request an early exit. */
  readonly shortCircuitable: boolean;
  /** Async initialization hook (load models, warm caches). */
  init?(): Promise<void>;
  /** Cleanup hook. */
  dispose?(): Promise<void>;
  /**
   * Run the recognizer. Must NEVER throw — return `null` on failure or
   * no-match, and log internally. The engine assumes `null` means "skip".
   */
  recognize(
    input: TInput,
    context: IntentContext,
    intents: IntentDefinition[]
  ): Promise<RecognizerOutput | null>;
  /**
   * If the recognizer is confident enough that no other recognizer could
   * meaningfully improve the result, it can short-circuit the pipeline.
   * Default: never short-circuit.
   */
  shouldShortCircuit?(output: RecognizerOutput): boolean;
}
