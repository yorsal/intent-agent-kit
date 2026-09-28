/**
 * Weighted fusion. For each intent, sums `confidence * weight` across all
 * recognizers that predicted it, then divides by total weight to get a
 * single confidence in [0, 1].
 *
 * This is the recommended strategy for heterogeneous recognizer
 * pipelines (rule + vector + llm), because each recognizer can be tuned
 * with a different weight to reflect its reliability on the dataset.
 */
import type { FusedIntent, RecognizerOutput, Slots } from '../types.js';
import type { FusionConfig, FusionStrategy } from './base.js';

interface Aggregation {
  weightedSum: number;
  weightSum: number;
  contributions: FusedIntent['contributions'];
  slots: Slots;
  sources: Set<string>;
}

export class WeightedFusion implements FusionStrategy {
  public readonly name = 'weighted';

  fuse(outputs: RecognizerOutput[], config: FusionConfig): FusedIntent | null {
    if (outputs.length === 0) return null;

    const perIntent = new Map<string, Aggregation>();
    for (const out of outputs) {
      const weight = config.weights[out.source] ?? 1;
      const bucket =
        perIntent.get(out.intent) ??
        ({
          weightedSum: 0,
          weightSum: 0,
          contributions: [],
          slots: {},
          sources: new Set<string>(),
        } satisfies Aggregation);
      bucket.weightedSum += out.confidence * weight;
      bucket.weightSum += weight;
      bucket.contributions.push({
        source: out.source,
        intent: out.intent,
        confidence: out.confidence,
        weight,
      });
      bucket.sources.add(out.source);
      // Later non-null slots overwrite earlier ones (engine responsibility
      // is to order recognizers sensibly).
      Object.assign(bucket.slots, out.slots);
      perIntent.set(out.intent, bucket);
    }

    const fused: FusedIntent[] = [];
    for (const [intent, agg] of perIntent.entries()) {
      const confidence = agg.weightSum === 0 ? 0 : agg.weightedSum / agg.weightSum;
      if (confidence < config.minConfidence) continue;
      const topSource = agg.contributions
        .slice()
        .sort((a, b) => b.confidence * b.weight - a.confidence * a.weight)[0];
      fused.push({
        intent,
        confidence,
        slots: agg.slots,
        source: topSource?.source ?? 'fused',
        alternatives: [],
        contributions: agg.contributions,
      });
    }

    fused.sort((a, b) => b.confidence - a.confidence);
    if (fused.length === 0) return null;
    const [top, ...rest] = fused;
    if (!top) return null;
    return {
      ...top,
      alternatives: rest.slice(0, config.maxAlternatives).map((f) => ({
        intent: f.intent,
        confidence: f.confidence,
      })),
    };
  }
}
