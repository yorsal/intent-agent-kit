import { describe, it, expect } from 'vitest';
import { normalizeMixed, normalizeText, containsKeyword } from '../../src/utils/normalize.js';

describe('normalizeMixed', () => {
  it('collapses full-width space', () => {
    expect(normalizeMixed('foo　bar')).toBe('foo bar');
  });

  it('converts full-width ASCII punctuation to half-width', () => {
    expect(normalizeMixed('what？')).toBe('what?');
    expect(normalizeMixed('hi：there')).toBe('hi:there');
    expect(normalizeMixed('really！')).toBe('really!');
  });

  it('replaces CJK sentence punctuation with spaces', () => {
    expect(normalizeMixed('我想点一杯latte，请帮我')).toBe('我想点一杯latte 请帮我');
  });

  it('converts CJK brackets to straight ASCII quotes', () => {
    expect(normalizeMixed('《hi》')).toBe('"hi"');
    expect(normalizeMixed('「hi」')).toBe('"hi"');
    expect(normalizeMixed('『hi』')).toBe("'hi'");
    expect(normalizeMixed('【hi】')).toBe('"hi"');
  });

  it('converts horizontal ellipsis', () => {
    expect(normalizeMixed('wait…')).toBe('wait...');
  });

  it('collapses repeated whitespace and trims', () => {
    expect(normalizeMixed('  foo   bar  ')).toBe('foo bar');
  });

  it('returns empty string for non-string input', () => {
    expect(normalizeMixed('')).toBe('');
    expect(normalizeMixed(undefined as unknown as string)).toBe('');
  });

  it('handles mixed CN/EN input end-to-end', () => {
    expect(normalizeMixed('「帮我点一杯latte，谢谢！」')).toBe('"帮我点一杯latte 谢谢!"');
  });
});

describe('normalizeText', () => {
  it('lowercases on demand', () => {
    expect(normalizeText('  Hello  WORLD  ')).toBe('Hello WORLD');
    expect(normalizeText('  Hello  WORLD  ', { lowercase: true })).toBe('hello world');
  });
});

describe('containsKeyword', () => {
  it('matches Chinese substrings case-insensitively', () => {
    expect(containsKeyword('我想点一杯latte', '点一杯')).toBe(true);
    expect(containsKeyword('I want a latte', 'want')).toBe(true);
  });
  it('does not match when absent', () => {
    expect(containsKeyword('hello world', 'latte')).toBe(false);
  });
});
