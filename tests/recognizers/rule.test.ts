import { describe, it, expect } from 'vitest';
import { RuleRecognizer } from '../../src/recognizers/rule.js';
import type { IntentDefinition } from '../../src/types.js';

const intents: IntentDefinition[] = [
  {
    label: 'greet',
    examples: [],
    patterns: [],
    keywords: ['hello', 'hi'],
    slots: [],
    metadata: {},
  },
  {
    label: 'order_coffee',
    examples: [],
    patterns: [/order (a|an) (latte|mocha|cappuccino)/i],
    keywords: ['coffee'],
    slots: [],
    metadata: {},
  },
  {
    label: 'goodbye',
    examples: [],
    patterns: [],
    keywords: ['bye', 'cya', 'see you'],
    slots: [],
    metadata: {},
  },
];

describe('RuleRecognizer', () => {
  it('matches regex patterns with high confidence', async () => {
    const rec = new RuleRecognizer();
    const out = await rec.recognize('I want to order a latte please', {}, intents);
    expect(out).not.toBeNull();
    expect(out?.intent).toBe('order_coffee');
    expect(out?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches single keyword with lower confidence', async () => {
    const rec = new RuleRecognizer();
    const out = await rec.recognize('hello there', {}, intents);
    expect(out).not.toBeNull();
    expect(out?.intent).toBe('greet');
    expect(out?.confidence).toBeCloseTo(0.65);
  });

  it('boosts confidence with multiple keywords', async () => {
    const rec = new RuleRecognizer();
    const out = await rec.recognize('bye cya', {}, intents);
    expect(out?.intent).toBe('goodbye');
    expect(out?.confidence).toBeCloseTo(0.8);
  });

  it('returns null on no match', async () => {
    const rec = new RuleRecognizer();
    const out = await rec.recognize('what is the meaning of life', {}, intents);
    expect(out).toBeNull();
  });

  it('short-circuits on regex hits', async () => {
    const rec = new RuleRecognizer();
    const out = await rec.recognize('order a mocha', {}, intents);
    expect(out?.intent).toBe('order_coffee');
    expect(rec.shouldShortCircuit(out!)).toBe(true);
  });
});
