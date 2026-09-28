/**
 * Router contract — converts a fused intent (or null) into a routing
 * decision (`execute` / `clarify` / `fallback` / `transfer_human`).
 */
import type {
  FusedIntent,
  IntentContext,
  RoutedAction,
} from '../types.js';

export interface RouterConfig {
  thresholds: {
    /** >= this -> execute. Default 0.85. */
    execute: number;
    /** >= this -> clarify. Default 0.60. */
    clarify: number;
    /** >= this -> clarify (lower band). Default 0.40. */
    fallback: number;
  };
  /** Optional custom builder for the clarification prompt. */
  clarificationBuilder?: (fused: FusedIntent) => string;
  /** Force `transfer_human` for these intents regardless of confidence. */
  forceTransferIntents?: string[];
  /** Force `fallback` for these intents regardless of confidence. */
  forceFallbackIntents?: string[];
}

export interface RoutedResult {
  action: RoutedAction;
  clarificationPrompt?: string;
  resolvedAction?: string;
}

export interface Router {
  readonly name: string;
  route(
    fused: FusedIntent | null,
    context: IntentContext,
    config: RouterConfig
  ): RoutedResult;
}

/** Default router config — used when the engine is constructed without one. */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  thresholds: {
    execute: 0.85,
    clarify: 0.6,
    fallback: 0.4,
  },
};

/** Helper that produces a final `IntentResult.action` shape from a `RoutedResult`. */
export function applyResolvedAction(
  routed: RoutedResult,
  intentLabel: string | undefined,
  resolver?: (label: string) => string | undefined
): { resolvedAction?: string } {
  if (!intentLabel) return {};
  if (resolver) {
    const resolved = resolver(intentLabel);
    return resolved ? { resolvedAction: resolved } : {};
  }
  return routed.resolvedAction ? { resolvedAction: routed.resolvedAction } : {};
}
