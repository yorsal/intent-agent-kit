/**
 * Threshold router. Maps confidence to one of four actions:
 *   >= execute  -> execute
 *   >= clarify  -> clarify
 *   >= fallback -> clarify (with low-confidence prompt)
 *   else        -> transfer_human
 *
 * `forceTransferIntents` / `forceFallbackIntents` short-circuit the
 * thresholds entirely — useful for intents like "delete account" that
 * must always go to a human.
 */
import type { FusedIntent, IntentContext } from '../types.js';
import type { Router, RouterConfig, RoutedResult } from './base.js';

function defaultClarifyPrompt(fused: FusedIntent): string {
  const top = [fused.intent, ...fused.alternatives.map((a) => a.intent)].slice(0, 3);
  if (top.length === 1) {
    return `Did you mean to run "${top[0]}"?`;
  }
  return `Did you mean "${top.join('" or "')}"?`;
}

export class ThresholdRouter implements Router {
  public readonly name = 'threshold';

  route(
    fused: FusedIntent | null,
    _context: IntentContext,
    config: RouterConfig
  ): RoutedResult {
    if (!fused) {
      return { action: 'transfer_human' };
    }

    if (config.forceTransferIntents?.includes(fused.intent)) {
      return { action: 'transfer_human' };
    }
    if (config.forceFallbackIntents?.includes(fused.intent)) {
      return { action: 'fallback' };
    }

    const t = config.thresholds;
    const prompt = config.clarificationBuilder ?? defaultClarifyPrompt;

    if (fused.confidence >= t.execute) {
      return { action: 'execute' };
    }
    if (fused.confidence >= t.clarify) {
      return { action: 'clarify', clarificationPrompt: prompt(fused) };
    }
    if (fused.confidence >= t.fallback) {
      return { action: 'clarify', clarificationPrompt: prompt(fused) };
    }
    return { action: 'transfer_human' };
  }
}
