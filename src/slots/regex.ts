/**
 * Regex-based slot extractor. For each `SlotDefinition` with a `pattern`,
 * runs the regex on the (normalized) input, applies any declared
 * `transform`, and emits the captured value.
 *
 * Only slots that have a `pattern` are considered — anything else is left
 * to other extractors (LLM, context, ...).
 */
import type {
  IntentContext,
  IntentDefinition,
  SlotDefinition,
  SlotValue,
  Slots,
} from '../types.js';
import { normalizeMixed, normalizeText, safeDateParse } from '../utils/normalize.js';
import type { SlotExtractor } from './base.js';

export interface RegexSlotExtractorOptions {
  name?: string;
  /** Lower number = runs first. Default 10 (first). */
  priority?: number;
}

function applyTransform(raw: string, def: SlotDefinition): SlotValue {
  const transform = def.transform;
  if (!transform) return raw;
  switch (transform.kind) {
    case 'trim':
      return normalizeText(raw);
    case 'lowercase':
      return raw.toLowerCase();
    case 'uppercase':
      return raw.toUpperCase();
    case 'toNumber': {
      const n = Number(raw);
      return Number.isNaN(n) ? raw : n;
    }
    case 'toDate': {
      // ponytail: very small natural-language date parser. For full date
      // understanding across languages, route through LLMSlotExtractor or
      // a real NLP library (e.g. chrono-node); upgrade when needed.
      const d = safeDateParse(raw);
      if (d) return d.toISOString();
      // Friendly heuristics for relative dates in EN + CN.
      const lower = raw.trim().toLowerCase();
      const now = new Date();
      const shift = (days: number): string => {
        const out = new Date(now);
        out.setUTCDate(out.getUTCDate() + days);
        return out.toISOString();
      };
      switch (lower) {
        case 'today':
        case '今天':
        case '今日':
          return shift(0);
        case 'tomorrow':
        case '明天':
        case '明日':
          return shift(1);
        case 'day after tomorrow':
        case 'overmorrow':
        case '后天':
        case '後天':
          return shift(2);
        case 'yesterday':
        case '昨天':
        case '昨日':
          return shift(-1);
        case 'now':
        case '现在':
        case '現在':
          return now.toISOString();
        default:
          return raw;
      }
    }
    default:
      return raw;
  }
}

export class RegexSlotExtractor implements SlotExtractor {
  public readonly name: string;
  public readonly priority: number;
  public enabled = true;

  constructor(options: RegexSlotExtractorOptions = {}) {
    this.name = options.name ?? 'regex';
    this.priority = options.priority ?? 10;
  }

  async extract(
    input: string,
    _context: IntentContext,
    intent: IntentDefinition
  ): Promise<Slots | null> {
    if (intent.slots.length === 0) return null;
    const normalized = normalizeMixed(input);
    const slots: Record<string, SlotValue> = {};

    for (const def of intent.slots) {
      if (!def.pattern) continue;
      def.pattern.lastIndex = 0;
      const match = def.pattern.exec(normalized);
      if (!match) continue;

      const groupIndex = def.group ?? 0;
      const captured = match[groupIndex];
      if (typeof captured !== 'string') continue;
      slots[def.name] = applyTransform(captured, def);
    }

    return Object.keys(slots).length > 0 ? slots : null;
  }
}
