/**
 * Rule-based recognizer — matches against `IntentDefinition.patterns`
 * (RegExp) and `IntentDefinition.keywords` (case-insensitive substrings).
 *
 * Confidence is derived from the match type:
 *  - regex pattern hit    -> 0.95
 *  - keyword hit (>= 2)   -> 0.80
 *  - keyword hit (1)      -> 0.65
 *
 * Rule recognizers short-circuit on a regex hit because regex is the
 * strongest deterministic signal.
 */
import type {
  IntentContext,
  IntentDefinition,
  RecognizerOutput,
} from '../types.js';
import {
  containsKeyword,
  normalizeMixed,
  normalizeText,
  safeRegexTest,
} from '../utils/normalize.js';
import type { Recognizer } from './base.js';

export interface RuleRecognizerOptions {
  /** Override the recognizer name (default `rule`). */
  name?: string;
  /** Override the recognizer priority. */
  priority?: number;
  /** Minimum confidence required for a keyword-only match to short-circuit. */
  shortCircuitConfidence?: number;
  /** Whether to extract slot values from pattern capture groups. */
  extractSlotsFromPatterns?: boolean;
}

export class RuleRecognizer implements Recognizer {
  public readonly name: string;
  public readonly priority: number;
  public enabled = true;
  public readonly shortCircuitable = true;

  private readonly shortCircuitConfidence: number;
  private readonly extractSlotsFromPatterns: boolean;

  constructor(options: RuleRecognizerOptions = {}) {
    this.name = options.name ?? 'rule';
    this.priority = options.priority ?? 10;
    this.shortCircuitConfidence = options.shortCircuitConfidence ?? 0.95;
    this.extractSlotsFromPatterns = options.extractSlotsFromPatterns ?? true;
  }

  async recognize(
    input: string,
    _context: IntentContext,
    intents: IntentDefinition[]
  ): Promise<RecognizerOutput | null> {
    const normalized = normalizeMixed(input);

    let bestIntent: IntentDefinition | null = null;
    let bestConfidence = 0;
    const slots: Record<string, string | number | boolean | string[]> = {};

    for (const intent of intents) {
      // 1. Regex patterns take priority.
      for (const pattern of intent.patterns) {
        if (!safeRegexTest(pattern, normalized)) continue;
        const conf = 0.95;
        if (conf > bestConfidence) {
          bestIntent = intent;
          bestConfidence = conf;
          if (this.extractSlotsFromPatterns) {
            this.collectSlotsFromPattern(intent, normalized, pattern, slots);
          }
        }
      }

      // 2. Keyword matching.
      let keywordHits = 0;
      for (const keyword of intent.keywords) {
        if (containsKeyword(normalized, keyword)) keywordHits += 1;
      }
      if (keywordHits > 0) {
        const conf = keywordHits >= 2 ? 0.8 : 0.65;
        if (conf > bestConfidence) {
          bestIntent = intent;
          bestConfidence = conf;
        }
      }
    }

    if (!bestIntent) return null;

    return {
      intent: bestIntent.label,
      confidence: bestConfidence,
      slots,
      source: this.name,
      alternatives: [],
    };
  }

  shouldShortCircuit(output: RecognizerOutput): boolean {
    return output.confidence >= this.shortCircuitConfidence;
  }

  private collectSlotsFromPattern(
    intent: IntentDefinition,
    input: string,
    pattern: RegExp,
    out: Record<string, string | number | boolean | string[]>
  ): void {
    // ponytail: re-running match for capture groups instead of threading
    // them through; acceptable here because regex hit is rare per intent.
    pattern.lastIndex = 0;
    const match = pattern.exec(input);
    if (!match) return;
    const named = match.groups ?? {};
    for (const def of intent.slots) {
      const namedKey = def.name;
      if (named[namedKey] !== undefined) {
        out[namedKey] = named[namedKey] ?? '';
      } else if (def.pattern && def.pattern.source === pattern.source) {
        // ponytail: only writes back if the slot uses the same regex; we
        // capture group 0 by default, matching the simple DSL we expose.
        const value = match[def.group ?? 0];
        if (typeof value === 'string') out[namedKey] = normalizeText(value);
      }
    }
  }
}
