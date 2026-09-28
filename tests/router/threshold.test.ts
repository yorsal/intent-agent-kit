import { describe, it, expect } from 'vitest';
import { ThresholdRouter } from '../../src/router/threshold.js';
import { DEFAULT_ROUTER_CONFIG } from '../../src/router/base.js';
import type { FusedIntent } from '../../src/types.js';

function fused(intent: string, confidence: number): FusedIntent {
  return {
    intent,
    confidence,
    slots: {},
    source: 'fused',
    alternatives: [],
    contributions: [],
  };
}

describe('ThresholdRouter', () => {
  const router = new ThresholdRouter();

  it('routes null to transfer_human', () => {
    const r = router.route(null, {}, DEFAULT_ROUTER_CONFIG);
    expect(r.action).toBe('transfer_human');
  });

  it('routes execute on high confidence', () => {
    const r = router.route(fused('order', 0.9), {}, DEFAULT_ROUTER_CONFIG);
    expect(r.action).toBe('execute');
  });

  it('routes clarify on mid confidence', () => {
    const r = router.route(fused('order', 0.7), {}, DEFAULT_ROUTER_CONFIG);
    expect(r.action).toBe('clarify');
    expect(r.clarificationPrompt).toBeDefined();
  });

  it('routes transfer_human on low confidence', () => {
    const r = router.route(fused('order', 0.2), {}, DEFAULT_ROUTER_CONFIG);
    expect(r.action).toBe('transfer_human');
  });

  it('respects forceTransferIntents', () => {
    const r = router.route(
      fused('delete_account', 0.99),
      {},
      { ...DEFAULT_ROUTER_CONFIG, forceTransferIntents: ['delete_account'] }
    );
    expect(r.action).toBe('transfer_human');
  });

  it('respects forceFallbackIntents', () => {
    const r = router.route(
      fused('smalltalk', 0.99),
      {},
      { ...DEFAULT_ROUTER_CONFIG, forceFallbackIntents: ['smalltalk'] }
    );
    expect(r.action).toBe('fallback');
  });
});
