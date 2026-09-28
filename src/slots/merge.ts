/**
 * Slot merge / validate / compute-missing helpers. Pure functions; safe
 * to call from anywhere in the pipeline.
 */
import type {
  IntentDefinition,
  SlotDefinition,
  Slots,
} from '../types.js';
import { safeDateParse } from '../utils/normalize.js';

export interface MergeOptions {
  /** Whether later non-null values overwrite earlier ones. Default true. */
  override?: boolean;
  /** Whether to drop values that don't match the slot's type. Default true. */
  validateType?: boolean;
  /** Whether to fill missing slots from `defaultValue`. Default true. */
  applyDefaults?: boolean;
}

const DEFAULTS: Required<MergeOptions> = {
  override: true,
  validateType: true,
  applyDefaults: true,
};

/** Validate a single value against its slot definition. */
export function validateSlotValue(value: unknown, def: SlotDefinition): boolean {
  if (value === null || value === undefined) return false;
  switch (def.type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date': {
      if (typeof value !== 'string') return false;
      return safeDateParse(value) !== null;
    }
    case 'enum':
      return (
        typeof value === 'string' &&
        Array.isArray(def.enumValues) &&
        def.enumValues.includes(value)
      );
    case 'string[]':
      return (
        Array.isArray(value) && value.every((v): v is string => typeof v === 'string')
      );
    default:
      return false;
  }
}

/** Coerce a string into a slot's declared type when possible. */
function coerce(value: unknown, def: SlotDefinition): unknown {
  if (def.type === 'number' && typeof value === 'string') {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (def.type === 'boolean' && typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  return value;
}

/**
 * Merge `source` into `target`. Returns a NEW object — neither input is
 * mutated. Validation + default application are optional.
 */
export function mergeSlots(
  target: Slots,
  source: Slots | null,
  intent: IntentDefinition,
  options: MergeOptions = {}
): Slots {
  const opts = { ...DEFAULTS, ...options };
  const result: Slots = { ...target };

  if (source) {
    for (const def of intent.slots) {
      const incoming = source[def.name];
      if (incoming === undefined) continue;
      const coerced = coerce(incoming, def);
      const valid = opts.validateType ? validateSlotValue(coerced, def) : true;
      if (!valid) continue;
      const existing = result[def.name];
      if (existing === undefined || opts.override) {
        result[def.name] = coerced as Slots[string];
      }
    }
  }

  if (opts.applyDefaults) {
    for (const def of intent.slots) {
      if (result[def.name] === undefined && def.defaultValue !== undefined) {
        result[def.name] = def.defaultValue;
      }
    }
  }

  return result;
}

/** Return names of required slots that are not (yet) populated. */
export function computeMissingSlots(slots: Slots, intent: IntentDefinition): string[] {
  const missing: string[] = [];
  for (const def of intent.slots) {
    if (!def.required) continue;
    const value = slots[def.name];
    if (value === undefined || value === null || value === '') {
      missing.push(def.name);
    }
  }
  return missing;
}

/**
 * Slot fill rate in [0, 1] across required slots. If an intent has no
 * required slots, returns 1 (fully filled by definition).
 */
export function computeSlotFillRate(slots: Slots, intent: IntentDefinition): number {
  const required = intent.slots.filter((s) => s.required);
  if (required.length === 0) return 1;
  let filled = 0;
  for (const def of required) {
    const value = slots[def.name];
    if (value !== undefined && value !== null && value !== '') filled += 1;
  }
  return filled / required.length;
}
