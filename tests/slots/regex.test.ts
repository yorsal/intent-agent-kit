import { describe, it, expect } from 'vitest';
import { RegexSlotExtractor } from '../../src/slots/regex.js';
import type { IntentDefinition } from '../../src/types.js';

const intent: IntentDefinition = {
  label: 'order_coffee',
  examples: [],
  patterns: [],
  keywords: [],
  slots: [
    {
      name: 'orderId',
      type: 'string',
      required: true,
      pattern: /order[:#]?\s*([A-Za-z0-9-]+)/,
      group: 1,
      prompt: 'Please provide your order ID',
    },
    {
      name: 'qty',
      type: 'number',
      required: false,
      pattern: /(\d+)\s+cup/,
      group: 1,
      transform: { kind: 'toNumber' },
    },
    {
      name: 'when',
      type: 'date',
      required: false,
      pattern: /(today|tomorrow|day after tomorrow)/,
      transform: { kind: 'toDate' },
    },
  ],
  metadata: {},
};

describe('RegexSlotExtractor', () => {
  it('extracts slots using named patterns', async () => {
    const ex = new RegexSlotExtractor();
    const out = await ex.extract('my order# ABC-123, get 2 cup, deliver tomorrow', {}, intent);
    expect(out).not.toBeNull();
    expect(out?.orderId).toBe('ABC-123');
    expect(out?.qty).toBe(2);
    expect(typeof out?.when).toBe('string');
    const date = new Date(out!.when as string);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  it('returns null when no slot pattern matches', async () => {
    const ex = new RegexSlotExtractor();
    const out = await ex.extract('just chatting', {}, intent);
    expect(out).toBeNull();
  });

  it('handles uppercase and lowercase transforms', async () => {
    const int2: IntentDefinition = {
      ...intent,
      slots: [{ name: 'word', type: 'string', required: false, pattern: /HELLO/, transform: { kind: 'lowercase' } }],
    };
    const ex = new RegexSlotExtractor();
    const out = await ex.extract('say HELLO there', {}, int2);
    expect(out?.word).toBe('hello');
  });

  it('parses relative date keywords in EN and CN', async () => {
    const dateIntent: IntentDefinition = {
      ...intent,
      slots: [
        { name: 'when', type: 'date', required: false, pattern: /(今天|明天|后天|昨天|today|tomorrow|day after tomorrow|yesterday)/, transform: { kind: 'toDate' } },
      ],
    };
    const ex = new RegexSlotExtractor();

    for (const keyword of ['today', 'tomorrow', 'day after tomorrow', 'yesterday']) {
      const out = await ex.extract(`deliver ${keyword}`, {}, dateIntent);
      const iso = out?.when as string;
      expect(new Date(iso).toString()).not.toBe('Invalid Date');
    }
    for (const keyword of ['今天', '明天', '后天', '昨天']) {
      const out = await ex.extract(`请${keyword}送到`, {}, dateIntent);
      const iso = out?.when as string;
      expect(new Date(iso).toString()).not.toBe('Invalid Date');
    }
  });

  it('falls back to the raw string for unknown relative dates', async () => {
    const dateIntent: IntentDefinition = {
      ...intent,
      slots: [
        { name: 'when', type: 'date', required: false, pattern: /(next week)/, transform: { kind: 'toDate' } },
      ],
    };
    const ex = new RegexSlotExtractor();
    const out = await ex.extract('see you next week', {}, dateIntent);
    expect(out?.when).toBe('next week');
  });
});
