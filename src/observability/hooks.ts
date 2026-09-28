/**
 * Lifecycle hooks. Every callback is wrapped in a try/catch so a buggy
 * observer cannot break the engine. Hooks fire in a stable order:
 *
 *   onRecognizeStart
 *     onRecognizerComplete (per recognizer, including nulls)
 *       onRecognizerError  (only when a recognizer throws)
 *   onFusionComplete
 *     onSlotExtractStart
 *       onSlotExtractorComplete / onSlotExtractorError
 *     onSlotExtractComplete
 *   onRouteComplete
 */
import type {
  FusedIntent,
  IntentContext,
  IntentResult,
  RecognizerOutput,
  Slots,
} from '../types.js';
import type { Logger } from '../utils/logger.js';

export interface IntentHooks {
  onRecognizeStart?: (input: string, context: IntentContext) => void;
  onRecognizerComplete?: (
    name: string,
    output: RecognizerOutput | null,
    latencyMs: number
  ) => void;
  onRecognizerError?: (name: string, error: Error) => void;
  onFusionComplete?: (fused: FusedIntent | null, latencyMs: number) => void;
  onSlotExtractStart?: (intent: string, extractorNames: string[]) => void;
  onSlotExtractorComplete?: (name: string, slots: Slots | null, latencyMs: number) => void;
  onSlotExtractorError?: (name: string, error: Error) => void;
  onSlotExtractComplete?: (slots: Slots, missingSlots: string[], fillRate: number) => void;
  onRouteComplete?: (result: IntentResult) => void;
  onError?: (error: Error, phase: string) => void;
}

/**
 * Wrap a hook so any thrown error is captured and logged but never
 * propagates. Returns a callable that mirrors the original signature.
 */
function safeHook<TArgs extends unknown[]>(
  hook: ((...args: TArgs) => void) | undefined,
  name: string,
  logger: Logger
): (...args: TArgs) => void {
  if (!hook) return () => undefined;
  return (...args: TArgs) => {
    try {
      hook(...args);
    } catch (err) {
      logger.warn(`Hook ${name} threw`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

export function bindHooks(hooks: IntentHooks | undefined, logger: Logger): Required<IntentHooks> {
  const empty: IntentHooks = hooks ?? {};
  return {
    onRecognizeStart: safeHook(empty.onRecognizeStart, 'onRecognizeStart', logger),
    onRecognizerComplete: safeHook(empty.onRecognizerComplete, 'onRecognizerComplete', logger),
    onRecognizerError: safeHook(empty.onRecognizerError, 'onRecognizerError', logger),
    onFusionComplete: safeHook(empty.onFusionComplete, 'onFusionComplete', logger),
    onSlotExtractStart: safeHook(empty.onSlotExtractStart, 'onSlotExtractStart', logger),
    onSlotExtractorComplete: safeHook(
      empty.onSlotExtractorComplete,
      'onSlotExtractorComplete',
      logger
    ),
    onSlotExtractorError: safeHook(empty.onSlotExtractorError, 'onSlotExtractorError', logger),
    onSlotExtractComplete: safeHook(empty.onSlotExtractComplete, 'onSlotExtractComplete', logger),
    onRouteComplete: safeHook(empty.onRouteComplete, 'onRouteComplete', logger),
    onError: safeHook(empty.onError, 'onError', logger),
  };
}
