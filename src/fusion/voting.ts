/**
 * Voting fusion. Each recognizer gets one vote; the winning intent is
 * whichever receives the most votes, with confidence = `avg + 0.05 *
 * votes_beyond_first` (capped at 1).
 *
 * This strategy is useful when recognizers are roughly equally reliable
 * and you want resilience against a single bad predictor.
 */
import type { FusedIntent, RecognizerOutput } from '../types.js';
import type { FusionConfig, FusionStrategy } from './base.js';

export class VotingFusion implements FusionStrategy {
  public readonly name = 'voting';

  fuse(outputs: RecognizerOutput[], config: FusionConfig): FusedIntent | null {
    if (outputs.length === 0) return null;

    const byIntent = new Map<string, RecognizerOutput[]>();
    for (const out of outputs) {
      const list = byIntent.get(out.intent) ?? [];
      list.push(out);
      byIntent.set(out.intent, list);
    }

    type Scored = {
      intent: string;
      votes: number;
      avg: number;
      boost: number;
      confidence: number;
      list: RecognizerOutput[];
    };
    const scored: Scored[] = [];
    for (const [intent, list] of byIntent.entries()) {
      const votes = list.length;
      const avg = list.reduce((s, o) => s + o.confidence, 0) / votes;
      const boost = Math.max(0, votes - 1) * 0.05;
      const confidence = Math.min(1, avg + boost);
      scored.push({ intent, votes, avg, boost, confidence, list });
    }

    scored.sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return b.confidence - a.confidence;
    });

    const winner = scored[0];
    if (!winner || winner.confidence < config.minConfidence) return null;
    const rest = scored.slice(1, config.maxAlternatives + 1);

    return {
      intent: winner.intent,
      confidence: winner.confidence,
      slots: {},
      source: winner.list[0]?.source ?? 'voting',
      alternatives: rest.map((s) => ({ intent: s.intent, confidence: s.confidence })),
      contributions: winner.list.map((o) => ({
        source: o.source,
        intent: o.intent,
        confidence: o.confidence,
        weight: 1,
      })),
    };
  }
}
