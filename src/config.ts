/**
 * Resolved engine configuration. The constructor merges user-supplied
 * options with sensible defaults so the rest of the engine never has to
 * deal with `undefined`.
 */
import { ConfigError } from './errors.js';
import { type ContextProvider } from './context/base.js';
import { MemoryContextProvider } from './context/memory.js';
import { DEFAULT_FUSION_CONFIG, type FusionConfig, type FusionStrategy } from './fusion/base.js';
import { WeightedFusion } from './fusion/weighted.js';
import { DEFAULT_ROUTER_CONFIG, type Router, type RouterConfig } from './router/base.js';
import { ThresholdRouter } from './router/threshold.js';
import type { Recognizer } from './recognizers/base.js';
import { DEFAULT_RECOGNIZER_WEIGHTS } from './recognizers/base.js';
import type { SlotExtractor } from './slots/base.js';
import type { IntentHooks } from './observability/hooks.js';
import type { MetricsRecorder } from './observability/metrics.js';
import { IntentRegistry } from './intents/registry.js';
import type { IntentDefinition } from './types.js';
import type { Logger } from './utils/logger.js';
import { createDefaultLogger } from './utils/logger.js';

export interface IntentEngineConfig {
  intents: IntentDefinition[] | IntentRegistry;
  recognizers: Recognizer[];
  slotExtractors?: SlotExtractor[];
  fusion?: FusionStrategy;
  router?: Router;
  contextProvider?: ContextProvider;
  hooks?: IntentHooks;
  logger?: Logger;
  metrics?: MetricsRecorder;
  /** Global per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Run recognizers in parallel. Default true. */
  parallel?: boolean;
  /** On slot-extraction failure, fall back to empty slots. Default true. */
  slotExtractionFallback?: boolean;
  /** Override fusion config (weights / thresholds / alt limits). */
  fusionConfig?: Partial<FusionConfig>;
  /** Override router config (thresholds / force lists). */
  routerConfig?: Partial<RouterConfig>;
  /** Resolver from intent label to Agent action identifier. */
  actionResolver?: (intentLabel: string) => string | undefined;
}

export interface ResolvedEngineConfig {
  registry: IntentRegistry;
  recognizers: Recognizer[];
  slotExtractors: SlotExtractor[];
  fusion: FusionStrategy;
  router: Router;
  contextProvider: ContextProvider;
  hooks: IntentHooks;
  logger: Logger;
  metrics?: MetricsRecorder;
  timeoutMs: number;
  parallel: boolean;
  slotExtractionFallback: boolean;
  fusionConfig: FusionConfig;
  routerConfig: RouterConfig;
  actionResolver?: (intentLabel: string) => string | undefined;
}

export function resolveEngineConfig(config: IntentEngineConfig): ResolvedEngineConfig {
  if (!config) {
    throw new ConfigError('IntentEngineConfig is required');
  }
  if (!config.recognizers || config.recognizers.length === 0) {
    throw new ConfigError('At least one Recognizer is required');
  }

  let registry: IntentRegistry;
  if (Array.isArray(config.intents)) {
    registry = new IntentRegistry();
    registry.registerMany(config.intents);
  } else {
    registry = config.intents;
  }

  const fusionConfig: FusionConfig = {
    ...DEFAULT_FUSION_CONFIG,
    weights: { ...DEFAULT_RECOGNIZER_WEIGHTS, ...(config.fusionConfig?.weights ?? {}) },
    minConfidence: config.fusionConfig?.minConfidence ?? DEFAULT_FUSION_CONFIG.minConfidence,
    maxAlternatives:
      config.fusionConfig?.maxAlternatives ?? DEFAULT_FUSION_CONFIG.maxAlternatives,
  };

  const routerConfig: RouterConfig = {
    ...DEFAULT_ROUTER_CONFIG,
    thresholds: {
      ...DEFAULT_ROUTER_CONFIG.thresholds,
      ...(config.routerConfig?.thresholds ?? {}),
    },
    forceTransferIntents: config.routerConfig?.forceTransferIntents ?? [],
    forceFallbackIntents: config.routerConfig?.forceFallbackIntents ?? [],
    ...(config.routerConfig?.clarificationBuilder
      ? { clarificationBuilder: config.routerConfig.clarificationBuilder }
      : {}),
  };

  return {
    registry,
    recognizers: [...config.recognizers].sort((a, b) => a.priority - b.priority),
    slotExtractors: [...(config.slotExtractors ?? [])].sort((a, b) => a.priority - b.priority),
    fusion: config.fusion ?? new WeightedFusion(),
    router: config.router ?? new ThresholdRouter(),
    contextProvider: config.contextProvider ?? new MemoryContextProvider(),
    hooks: config.hooks ?? {},
    logger: config.logger ?? createDefaultLogger(),
    ...(config.metrics ? { metrics: config.metrics } : {}),
    timeoutMs: config.timeoutMs ?? 5000,
    parallel: config.parallel ?? true,
    slotExtractionFallback: config.slotExtractionFallback ?? true,
    fusionConfig,
    routerConfig,
    ...(config.actionResolver ? { actionResolver: config.actionResolver } : {}),
  };
}
