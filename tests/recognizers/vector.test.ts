import { describe, it, expect } from 'vitest';
import { VectorRecognizer, type EmbeddingBackend } from '../../src/recognizers/vector.js';
import type { IntentDefinition } from '../../src/types.js';

const fakeBackend: EmbeddingBackend = {
  name: 'fake',
  dimension: 4,
  async embed(text: string): Promise<number[]> {
    // Toy bag-of-words style "embedding": each unique word -> 1.0 on its axis.
    const vocab = ['coffee', 'latte', 'order', 'hello', 'hi', 'goodbye', 'bye'];
    const lower = text.toLowerCase();
    return vocab.map((w) => (lower.includes(w) ? 1 : 0));
  },
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => fakeBackend.embed(t)));
  },
};

const intents: IntentDefinition[] = [
  {
    label: 'greet',
    description: 'say hi',
    examples: ['hello there', 'hi friend', 'hey'],
    patterns: [],
    keywords: [],
    slots: [],
    metadata: {},
  },
  {
    label: 'order_coffee',
    description: 'order coffee',
    examples: ['I want a latte', 'order coffee', 'please give me an espresso'],
    patterns: [],
    keywords: [],
    slots: [],
    metadata: {},
  },
];

describe('VectorRecognizer', () => {
  it('returns null when no intent has examples', async () => {
    const rec = new VectorRecognizer({ backend: fakeBackend });
    const out = await rec.recognize('hello', {}, []);
    expect(out).toBeNull();
  });

  it('picks the closest intent by cosine similarity', async () => {
    const rec = new VectorRecognizer({ backend: fakeBackend });
    const out = await rec.recognize('please order a latte', {}, intents);
    expect(out).not.toBeNull();
    expect(out?.intent).toBe('order_coffee');
  });

  it('returns null below minSimilarity', async () => {
    const rec = new VectorRecognizer({ backend: fakeBackend, minSimilarity: 0.99 });
    const out = await rec.recognize('completely unrelated input', {}, intents);
    expect(out).toBeNull();
  });
});
