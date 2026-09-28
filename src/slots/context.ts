/**
 * Context inheritance extractor. Carries slots from the previous turn
 * (passed via `IntentContext.inheritedSlots`) into the current one.
 *
 * Strategies:
 *  - keep    -> carry every inherited slot unchanged
 *  - clean   -> drop slots that aren't part of the new intent's contract
 *  - prefer  -> current-turn slots win over inherited values (engine merges)
 *
 * Default is `prefer` + `clean`, which mirrors how real multi-turn
 * dialog systems work: each new utterance is interpreted against the
 * latest intent, but remembered facts (user IDs, preferences) flow in.
 */
import type {
  IntentContext,
  IntentDefinition,
  Slots,
} from '../types.js';
import type { SlotExtractor } from './base.js';

export type ContextStrategy = 'keep' | 'clean';

export interface ContextSlotExtractorOptions {
  name?: string;
  /** Default 100 — runs last so it can overwrite earlier extractors. */
  priority?: number;
  strategy?: ContextStrategy;
}

export class ContextSlotExtractor implements SlotExtractor {
  public readonly name: string;
  public readonly priority: number;
  public enabled = true;
  private readonly strategy: ContextStrategy;

  constructor(options: ContextSlotExtractorOptions = {}) {
    this.name = options.name ?? 'context';
    // ponytail: context runs BEFORE other extractors on purpose — current-turn
    // values (regex, llm) must override inherited slots. Set higher if you
    // need reverse priority.
    this.priority = options.priority ?? 1;
    this.strategy = options.strategy ?? 'clean';
  }

  async extract(
    _input: string,
    context: IntentContext,
    intent: IntentDefinition
  ): Promise<Slots | null> {
    const inherited = context.inheritedSlots;
    if (!inherited || Object.keys(inherited).length === 0) return null;

    if (this.strategy === 'clean') {
      const allowed = new Set(intent.slots.map((s) => s.name));
      const filtered: Slots = {};
      for (const [key, value] of Object.entries(inherited)) {
        if (allowed.has(key)) filtered[key] = value;
      }
      return Object.keys(filtered).length > 0 ? filtered : null;
    }

    return { ...inherited };
  }
}
