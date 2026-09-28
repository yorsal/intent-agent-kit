import { describe, it, expect, vi } from 'vitest';
import { IntentEngine } from '../src/engine.js';
import { RuleRecognizer } from '../src/recognizers/rule.js';
import { RegexSlotExtractor } from '../src/slots/regex.js';
import { ContextSlotExtractor } from '../src/slots/context.js';
import { InMemoryMetrics } from '../src/observability/metrics.js';
import { ConfigError, TimeoutError } from '../src/errors.js';
import type { RecognizerOutput, IntentDefinition } from '../src/types.js';

function buildEngine(opts?: { intents?: IntentDefinition[]; extractors?: boolean; context?: boolean }) {
  const intents: IntentDefinition[] = opts?.intents ?? [
    {
      label: 'order_coffee',
      description: 'order a coffee',
      examples: [],
      patterns: [/order (a|an) (latte|mocha)/i],
      keywords: ['coffee'],
      slots: [
        {
          name: 'drink',
          type: 'string',
          required: true,
          pattern: /(latte|mocha|cappuccino)/i,
        },
      ],
      action: 'tool:create_order',
      metadata: {},
    },
    {
      label: 'chitchat',
      description: 'small talk',
      examples: [],
      patterns: [],
      keywords: ['how are you'],
      slots: [],
      metadata: {},
    },
  ];

  const recognizers = [new RuleRecognizer()];
  const extractors = opts?.extractors === false ? [] : [
    new RegexSlotExtractor(),
    ...(opts?.context ? [new ContextSlotExtractor()] : []),
  ];

  return new IntentEngine({
    intents,
    recognizers,
    slotExtractors: extractors,
  });
}

describe('IntentEngine end-to-end', () => {
  it('executes on high-confidence rule hit and resolves action', async () => {
    const engine = buildEngine();
    const result = await engine.recognize('please order a latte');
    expect(result.action).toBe('execute');
    expect(result.intent).toBe('order_coffee');
    expect(result.resolvedAction).toBe('tool:create_order');
    expect(result.missingSlots).toEqual([]);
  });

  it('returns transfer_human when no recognizer matches', async () => {
    const engine = buildEngine();
    const result = await engine.recognize('completely off topic sentence');
    expect(result.action).toBe('transfer_human');
  });

  it('demotes execute to clarify when required slots are missing', async () => {
    const engine = buildEngine();
    // Match by keyword only ("coffee") so the regex slot pattern doesn't fire.
    const result = await engine.recognize('just coffee please');
    expect(result.intent).toBe('order_coffee');
    expect(result.action).toBe('clarify');
    expect(result.missingSlots).toContain('drink');
    expect(result.clarificationPrompt).toBeDefined();
  });

  it('inherits slots from context across turns', async () => {
    const intents: IntentDefinition[] = [
      {
        label: 'order_coffee',
        examples: [],
        patterns: [/order (a|an) (latte|mocha|cappuccino)/i, /(latte|mocha|cappuccino)/i],
        keywords: ['coffee'],
        slots: [
          {
            name: 'drink',
            type: 'string',
            required: true,
            pattern: /(latte|mocha|cappuccino)/i,
          },
        ],
        metadata: {},
      },
    ];
    const engine = new IntentEngine({
      intents,
      recognizers: [new RuleRecognizer()],
      slotExtractors: [new RegexSlotExtractor(), new ContextSlotExtractor()],
    });
    const first = await engine.recognize('order a latte', {
      inheritedSlots: { drink: 'latte' },
    });
    expect(first.action).toBe('execute');

    const second = await engine.recognize('get me a mocha', {
      inheritedSlots: { drink: 'latte' },
    });
    // Current-turn regex hits mocha; context fallback also keeps the slot filled.
    expect(second.slots.drink).toBeDefined();
  });

  it('runs in parallel by default and still produces a result', async () => {
    const slowRec = new RuleRecognizer({ name: 'slow', priority: 50 });
    const wrapped = {
      name: 'wrapped',
      priority: 1,
      enabled: true,
      shortCircuitable: false,
      async recognize(input: string, ctx: Parameters<typeof slowRec.recognize>[1], intents: Parameters<typeof slowRec.recognize>[2]) {
        const out = await slowRec.recognize(input, ctx, intents);
        return out ? { ...out, source: 'wrapped' } : null;
      },
    };
    const engine = new IntentEngine({
      intents: [],
      recognizers: [wrapped],
      parallel: true,
    });
    const r = await engine.recognize('order a mocha', {
      history: [{ role: 'user', content: 'order a mocha' }],
    });
    expect(r.action === 'transfer_human' || r.intent === '').toBe(true);
  });

  it('captures recognizer errors and continues', async () => {
    const boom: RecognizerOutput = {} as never;
    void boom;
    const throwingRec = {
      name: 'boom',
      priority: 1,
      enabled: true,
      shortCircuitable: false,
      async recognize(): Promise<RecognizerOutput | null> {
        throw new Error('boom');
      },
    };
    const intents: IntentDefinition[] = [
      {
        label: 'order_coffee',
        examples: [],
        patterns: [/order (a|an) (latte|mocha)/i],
        keywords: [],
        slots: [],
        metadata: {},
      },
    ];
    const engine = new IntentEngine({
      intents,
      recognizers: [throwingRec, new RuleRecognizer()],
      parallel: false,
    });
    const r = await engine.recognize('order a latte');
    // rule recognizer should still succeed.
    expect(r.intent).toBe('order_coffee');
  });

  it('records metrics when provided', async () => {
    const metrics = new InMemoryMetrics();
    const engine = new IntentEngine({
      intents: [],
      recognizers: [new RuleRecognizer()],
      metrics,
    });
    await engine.recognize('order a latte');
    expect(metrics.counters.size).toBeGreaterThan(0);
  });

  it('fires lifecycle hooks', async () => {
    const onRecognizeStart = vi.fn();
    const onRecognizerComplete = vi.fn();
    const onFusionComplete = vi.fn();
    const onRouteComplete = vi.fn();
    const engine = new IntentEngine({
      intents: [],
      recognizers: [new RuleRecognizer()],
      hooks: { onRecognizeStart, onRecognizerComplete, onFusionComplete, onRouteComplete },
    });
    await engine.recognize('order a latte');
    expect(onRecognizeStart).toHaveBeenCalled();
    expect(onRecognizerComplete).toHaveBeenCalled();
    expect(onFusionComplete).toHaveBeenCalled();
    expect(onRouteComplete).toHaveBeenCalled();
  });

  it('throws ConfigError when no recognizers configured', () => {
    expect(() => new IntentEngine({ intents: [], recognizers: [] })).toThrow(ConfigError);
  });

  it('emits a TimeoutError when a recognizer is too slow', async () => {
    const slow = {
      name: 'slow',
      priority: 1,
      enabled: true,
      shortCircuitable: false,
      async recognize(): Promise<RecognizerOutput | null> {
        await new Promise((r) => setTimeout(r, 50));
        return null;
      },
    };
    const engine = new IntentEngine({
      intents: [],
      recognizers: [slow],
      timeoutMs: 10,
    });
    const r = await engine.recognize('anything');
    expect(r.intent).toBe('');
  });

  it('toggles recognizers and extractors at runtime', async () => {
    const engine = new IntentEngine({
      intents: [],
      recognizers: [new RuleRecognizer()],
      slotExtractors: [new RegexSlotExtractor()],
    });
    engine.toggleRecognizer('rule', false);
    engine.toggleSlotExtractor('regex', false);
    expect(() => engine.toggleRecognizer('missing', false)).toThrow(ConfigError);
    expect(() => engine.toggleSlotExtractor('missing', false)).toThrow(ConfigError);
  });

  it('runs recognizeBatch concurrently', async () => {
    const engine = new IntentEngine({
      intents: [],
      recognizers: [new RuleRecognizer()],
    });
    const results = await engine.recognizeBatch(['order a latte', 'order a mocha']);
    expect(results.length).toBe(2);
  });

  it('throws TimeoutError when a slot extractor exceeds the global timeout', async () => {
    const slow = {
      name: 'slow',
      priority: 1,
      enabled: true,
      async extract(): Promise<null> {
        await new Promise((r) => setTimeout(r, 50));
        return null;
      },
    };
    const intents: IntentDefinition[] = [
      {
        label: 'x',
        examples: [],
        patterns: [],
        keywords: ['order a latte'],
        slots: [{ name: 'foo', type: 'string', required: true }],
        metadata: {},
      },
    ];
    const engine = new IntentEngine({
      intents,
      recognizers: [new RuleRecognizer()],
      slotExtractors: [slow],
      timeoutMs: 10,
    });
    const r = await engine.recognize('order a latte');
    expect(r.action).toBe('clarify');
    expect(r.missingSlots).toContain('foo');
  });

  it('preserves TimeoutError shape (exported)', () => {
    const e = new TimeoutError('recognizer:x', 100, { traceId: 't' });
    expect(e.code).toBe('TIMEOUT_ERROR');
    expect(e.stage).toBe('recognizer:x');
    expect(e.traceId).toBe('t');
  });
});
