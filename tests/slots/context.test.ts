import { describe, it, expect } from 'vitest';
import { ContextSlotExtractor } from '../../src/slots/context.js';
import type { IntentDefinition } from '../../src/types.js';

const intent: IntentDefinition = {
  label: 'book_flight',
  examples: [],
  patterns: [],
  keywords: [],
  slots: [
    { name: 'from', type: 'string', required: true },
    { name: 'to', type: 'string', required: true },
    { name: 'time', type: 'date', required: false },
  ],
  metadata: {},
};

describe('ContextSlotExtractor', () => {
  it('inherits slots from previous turn (clean strategy)', async () => {
    const ex = new ContextSlotExtractor({ strategy: 'clean' });
    const out = await ex.extract(
      'change it to mocha',
      { inheritedSlots: { from: 'Beijing', to: 'Shanghai', stray: 'ignore-me' } },
      intent
    );
    expect(out?.from).toBe('Beijing');
    expect(out?.to).toBe('Shanghai');
    expect(out?.stray).toBeUndefined();
  });

  it('keeps all inherited slots when strategy=keep', async () => {
    const ex = new ContextSlotExtractor({ strategy: 'keep' });
    const out = await ex.extract(
      'hi',
      { inheritedSlots: { from: 'Beijing', custom: 'value' } },
      intent
    );
    expect(out?.custom).toBe('value');
  });

  it('returns null when nothing to inherit', async () => {
    const ex = new ContextSlotExtractor();
    expect(await ex.extract('hi', {}, intent)).toBeNull();
  });
});
