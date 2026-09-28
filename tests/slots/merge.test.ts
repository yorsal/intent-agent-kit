import { describe, it, expect } from 'vitest';
import {
  computeMissingSlots,
  computeSlotFillRate,
  mergeSlots,
  validateSlotValue,
} from '../../src/slots/merge.js';
import type { IntentDefinition, SlotDefinition } from '../../src/types.js';

const slotOrderId: SlotDefinition = {
  name: 'orderId',
  type: 'string',
  required: true,
  pattern: /order-\d+/,
};
const slotSize: SlotDefinition = {
  name: 'size',
  type: 'enum',
  required: true,
  enumValues: ['small', 'medium', 'large'],
};
const slotCount: SlotDefinition = {
  name: 'count',
  type: 'number',
  required: false,
  defaultValue: 1,
};
const slotDate: SlotDefinition = {
  name: 'date',
  type: 'date',
  required: false,
};
const slotTags: SlotDefinition = {
  name: 'tags',
  type: 'string[]',
  required: false,
};

const intent: IntentDefinition = {
  label: 'order',
  examples: [],
  patterns: [],
  keywords: [],
  slots: [slotOrderId, slotSize, slotCount, slotDate, slotTags],
  metadata: {},
};

describe('validateSlotValue', () => {
  it('accepts primitives matching their type', () => {
    expect(validateSlotValue('foo', { ...slotOrderId, required: false })).toBe(true);
    expect(validateSlotValue(42, { ...slotCount, required: false })).toBe(true);
    expect(validateSlotValue(true, { name: 'b', type: 'boolean', required: false })).toBe(true);
  });

  it('accepts only valid ISO-ish date strings', () => {
    expect(validateSlotValue('2026-01-01T00:00:00Z', slotDate)).toBe(true);
    expect(validateSlotValue('not a date', slotDate)).toBe(false);
  });

  it('validates enum membership', () => {
    expect(validateSlotValue('small', slotSize)).toBe(true);
    expect(validateSlotValue('XL', slotSize)).toBe(false);
  });

  it('validates string[]', () => {
    expect(validateSlotValue(['a', 'b'], slotTags)).toBe(true);
    expect(validateSlotValue(['a', 1], slotTags)).toBe(false);
  });
});

describe('mergeSlots', () => {
  it('applies defaults for missing slots', () => {
    const out = mergeSlots({}, { orderId: 'order-1', size: 'small' }, intent);
    expect(out.count).toBe(1);
  });

  it('coerces string numbers and booleans', () => {
    const out = mergeSlots({}, { count: '5', orderId: 'order-1', size: 'small' }, intent);
    expect(out.count).toBe(5);
  });

  it('drops values that fail validation', () => {
    const out = mergeSlots({}, { size: 'gigantic', orderId: 'order-1' }, intent);
    expect(out.size).toBeUndefined();
  });

  it('later source wins when override=true (default)', () => {
    const out = mergeSlots({ count: 2 }, { count: 9 }, intent);
    expect(out.count).toBe(9);
  });

  it('does not mutate the target object', () => {
    const target = { count: 1 };
    const out = mergeSlots(target, { count: 9 }, intent);
    expect(target.count).toBe(1);
    expect(out.count).toBe(9);
  });

  it('returns a brand-new object reference', () => {
    const target = {};
    const out = mergeSlots(target, null, intent);
    expect(out).not.toBe(target);
  });
});

describe('computeMissingSlots / computeSlotFillRate', () => {
  it('returns required slot names that are empty', () => {
    const missing = computeMissingSlots({ orderId: 'order-1' }, intent);
    expect(missing).toEqual(['size']);
  });

  it('treats required slots with empty string as missing', () => {
    const missing = computeMissingSlots({ orderId: 'order-1', size: '' }, intent);
    expect(missing).toEqual(['size']);
  });

  it('computes fill rate only over required slots', () => {
    const rate = computeSlotFillRate({ orderId: 'order-1', size: 'small' }, intent);
    expect(rate).toBe(1);
    const rate2 = computeSlotFillRate({ orderId: 'order-1' }, intent);
    expect(rate2).toBe(0.5);
  });

  it('returns 1 when the intent has no required slots', () => {
    const noReq: IntentDefinition = { ...intent, slots: [slotCount] };
    expect(computeSlotFillRate({}, noReq)).toBe(1);
  });
});
