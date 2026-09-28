import { describe, it, expect } from 'vitest';
import { IntentRegistry } from '../../src/intents/registry.js';
import { RegistryError } from '../../src/errors.js';
import { defineIntent } from '../../src/intents/definition.js';

describe('IntentRegistry', () => {
  it('registers and retrieves intents', () => {
    const reg = new IntentRegistry();
    reg.register({ label: 'a', examples: [], patterns: [], keywords: [], slots: [], metadata: {} });
    expect(reg.has('a')).toBe(true);
    expect(reg.get('a')?.label).toBe('a');
    expect(reg.size()).toBe(1);
  });

  it('throws on duplicate labels', () => {
    const reg = new IntentRegistry();
    reg.register({ label: 'a', examples: [], patterns: [], keywords: [], slots: [], metadata: {} });
    expect(() => reg.register({ label: 'a', examples: [], patterns: [], keywords: [], slots: [], metadata: {} })).toThrow(RegistryError);
  });

  it('serializes to/from JSON', () => {
    const reg = new IntentRegistry();
    reg.register(defineIntent('a').keyword('foo').example('hi there').build());
    const json = reg.toJSON();
    expect(Array.isArray(json)).toBe(true);
    const reg2 = new IntentRegistry();
    reg2.loadFromJSON(json);
    expect(reg2.has('a')).toBe(true);
    expect(reg2.get('a')?.keywords).toContain('foo');
  });
});
