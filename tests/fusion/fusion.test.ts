import { describe, it, expect } from 'vitest';
import { WeightedFusion } from '../../src/fusion/weighted.js';
import { VotingFusion } from '../../src/fusion/voting.js';
import type { RecognizerOutput } from '../../src/types.js';

describe('WeightedFusion', () => {
  it('returns null on empty input', () => {
    const f = new WeightedFusion();
    expect(f.fuse([], { weights: {}, minConfidence: 0, maxAlternatives: 3 })).toBeNull();
  });

  it('weights outputs by source', () => {
    const f = new WeightedFusion();
    const outputs: RecognizerOutput[] = [
      { intent: 'a', confidence: 0.5, slots: {}, source: 'low', alternatives: [] },
      { intent: 'a', confidence: 0.9, slots: {}, source: 'high', alternatives: [] },
      { intent: 'b', confidence: 0.95, slots: {}, source: 'high', alternatives: [] },
    ];
    const fused = f.fuse(outputs, { weights: { low: 0.5, high: 2 }, minConfidence: 0, maxAlternatives: 3 });
    expect(fused?.intent).toBe('b');
    expect(fused?.confidence).toBeCloseTo(0.95);
    expect(fused?.alternatives.length).toBe(1);
  });

  it('drops intents below minConfidence', () => {
    const f = new WeightedFusion();
    const out = f.fuse(
      [{ intent: 'a', confidence: 0.2, slots: {}, source: 'x', alternatives: [] }],
      { weights: { x: 1 }, minConfidence: 0.5, maxAlternatives: 3 }
    );
    expect(out).toBeNull();
  });
});

describe('VotingFusion', () => {
  it('majority wins', () => {
    const f = new VotingFusion();
    const out = f.fuse(
      [
        { intent: 'a', confidence: 0.6, slots: {}, source: 'r1', alternatives: [] },
        { intent: 'a', confidence: 0.7, slots: {}, source: 'r2', alternatives: [] },
        { intent: 'b', confidence: 0.9, slots: {}, source: 'r3', alternatives: [] },
      ],
      { weights: {}, minConfidence: 0, maxAlternatives: 3 }
    );
    expect(out?.intent).toBe('a');
  });

  it('breaks ties by average confidence', () => {
    const f = new VotingFusion();
    const out = f.fuse(
      [
        { intent: 'a', confidence: 0.9, slots: {}, source: 'r1', alternatives: [] },
        { intent: 'b', confidence: 0.6, slots: {}, source: 'r2', alternatives: [] },
      ],
      { weights: {}, minConfidence: 0, maxAlternatives: 3 }
    );
    expect(out?.intent).toBe('a');
  });
});
