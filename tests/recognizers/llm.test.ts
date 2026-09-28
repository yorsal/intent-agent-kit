import { describe, it, expect } from 'vitest';
import { LLMRecognizer, type ChatClient } from '../../src/recognizers/llm.js';
import type { IntentDefinition } from '../../src/types.js';

function makeMockClient(response: { intent: string; confidence: number; alternatives?: { intent: string; confidence: number }[] }): ChatClient {
  return {
    chat: {
      completions: {
        async create() {
          return {
            choices: [{ message: { content: JSON.stringify(response) } }],
          };
        },
      },
    },
  };
}

function makeThrowingClient(): ChatClient {
  return {
    chat: {
      completions: {
        async create() {
          throw new Error('upstream down');
        },
      },
    },
  };
}

const intents: IntentDefinition[] = [
  {
    label: 'greet',
    description: 'greeting',
    examples: [],
    patterns: [],
    keywords: [],
    slots: [],
    metadata: {},
  },
  {
    label: 'order',
    description: 'place an order',
    examples: [],
    patterns: [],
    keywords: [],
    slots: [],
    metadata: {},
  },
];

describe('LLMRecognizer', () => {
  it('parses a valid response', async () => {
    const client = makeMockClient({ intent: 'greet', confidence: 0.92, alternatives: [] });
    const rec = new LLMRecognizer({ client, model: 'gpt-test' });
    const out = await rec.recognize('hi', {}, intents);
    expect(out?.intent).toBe('greet');
    expect(out?.confidence).toBeCloseTo(0.92);
  });

  it('returns null for the sentinel __none__ response', async () => {
    const client = makeMockClient({ intent: '__none__', confidence: 0 });
    const rec = new LLMRecognizer({ client, model: 'gpt-test' });
    expect(await rec.recognize('...', {}, intents)).toBeNull();
  });

  it('swallows upstream errors and returns null', async () => {
    const rec = new LLMRecognizer({ client: makeThrowingClient(), model: 'gpt-test' });
    expect(await rec.recognize('hi', {}, intents)).toBeNull();
  });
});
