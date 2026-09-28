/**
 * Fusion strategy contract. Takes a (possibly empty) list of recognizer
 * outputs and returns a single `FusedIntent`, or `null` when nothing
 * useful survived.
 */
import type { FusedIntent, RecognizerOutput } from '../types.js';

export interface FusionConfig {
  /** Per-recognizer weights keyed by `source`. */
  weights: Record<string, number>;
  /** Drop fused intents below this confidence; default 0. */
  minConfidence: number;
  /** Maximum alternatives to keep. */
  maxAlternatives: number;
}

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  weights: {},
  minConfidence: 0,
  maxAlternatives: 3,
};

export interface FusionStrategy {
  readonly name: string;
  fuse(outputs: RecognizerOutput[], config: FusionConfig): FusedIntent | null;
}
