import { describe, it, expect } from 'vitest';
import { LLMSlotExtractor, type LLMSlotExtractorOptions } from '../../src/slots/llm.js';
import type { ChatClient } from '../../src/recognizers/llm.js';
import type { IntentDefinition } from '../../src/types.js';

function makeClient(payload: unknown): ChatClient {
  return {
    chat: {
      completions: {
        async create() {
          return { choices: [{ message: { content: JSON.stringify(payload) } }] };
        },
      },
    },
  };
}

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

describe('LLMSlotExtractor', () => {
  it('extracts declared slots', async () => {
    const opts: LLMSlotExtractorOptions = {
      client: makeClient({ from: 'Beijing', to: 'Shanghai', time: '2026-10-01' }),
      model: 'gpt-test',
    };
    const ex = new LLMSlotExtractor(opts);
    const out = await ex.extract('book Beijing to Shanghai on 2026-10-01', {}, intent);
    expect(out?.from).toBe('Beijing');
    expect(out?.to).toBe('Shanghai');
    expect(out?.time).toBe('2026-10-01');
  });

  it('drops slots not in the intent definition', async () => {
    const opts: LLMSlotExtractorOptions = {
      client: makeClient({ from: 'BJ', to: 'SH', unexpected: 'x' }),
      model: 'gpt-test',
    };
    const ex = new LLMSlotExtractor(opts);
    const out = await ex.extract('...', {}, intent);
    expect(out?.unexpected).toBeUndefined();
  });

  it('returns null when intent has no slots', async () => {
    const ex = new LLMSlotExtractor({
      client: makeClient({}),
      model: 'gpt-test',
    });
    const out = await ex.extract('...', {}, { ...intent, slots: [] });
    expect(out).toBeNull();
  });

  it('returns null on upstream failure', async () => {
    const ex = new LLMSlotExtractor({
      client: {
        chat: {
          completions: {
            async create() {
              throw new Error('boom');
            },
          },
        },
      },
      model: 'gpt-test',
    });
    const out = await ex.extract('...', {}, intent);
    expect(out).toBeNull();
  });
});
