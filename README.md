# intent-agent-kit

> **A framework-agnostic, pluggable, multi-engine intent recognition library for AI Agents.**

> 🌏 [中文文档](./README.zh.md) | English (this file)

`intent-agent-kit` is the sister project of [`pii-agent-kit`](https://www.npmjs.com/package/pii-agent-kit). Together they form the
foundation layer for AI Agents: one cleans & protects user data, this one figures out **what the user wants** and **which
parameters** are needed to act on it.

It is designed for:

- AI Agent tool routing & skill dispatch
- Conversational intent classification
- Voice / IVR intent recognition
- Any "map natural language → Agent action" pipeline

---

## ✨ Highlights

| | |
|---|---|
| 🧩 Pluggable | Recognizers, slot extractors, fusion strategies, routers — all swappable |
| 📜 Contract-first | Every public surface is a Zod schema with runtime + compile-time validation |
| 🛰 Zero forced deps | Core package has no LLM/vector dependencies — peerDeps are opt-in |
| 🎯 Agent-native | Result includes `action`, `resolvedAction`, `missingSlots`, `slotFillRate` |
| 🪂 Graceful degradation | Any single recognizer/extractor failure does not break the chain |
| 🔭 Observable | Lifecycle hooks + pluggable metrics out of the box |
| 🪶 Small | < 60 KB gzipped core, runs on Node 18+ and the browser |

---

## 📦 Install

```bash
pnpm add intent-agent-kit
# Optional — pick what you need
pnpm add openai                  # for LLMRecognizer / LLMSlotExtractor
pnpm add @xenova/transformers    # for local vector embeddings
```

---

## 🚀 30-second quick start

```ts
import { IntentEngine, RuleRecognizer, RegexSlotExtractor, defineIntent } from 'intent-agent-kit';

const orderCoffee = defineIntent('order_coffee')
  .description('User wants to order a coffee.')
  .pattern(/order (a|an) (latte|mocha|cappuccino)/i)
  .keyword('coffee')
  .slot({
    name: 'drink',
    type: 'string',
    required: true,
    pattern: /(latte|mocha|cappuccino)/i,
    prompt: 'Which coffee would you like?',
  })
  .action('tool:create_order')
  .build();

const engine = new IntentEngine({
  intents: [orderCoffee],
  recognizers: [new RuleRecognizer()],
  slotExtractors: [new RegexSlotExtractor()],
});

const result = await engine.recognize('please order a latte for me');
// result.action          -> 'execute'
// result.intent          -> 'order_coffee'
// result.resolvedAction  -> 'tool:create_order'
// result.slots.drink     -> 'latte'
// result.missingSlots    -> []
// result.slotFillRate    -> 1
```

---

## 🧠 Core concepts

| Concept | What it does |
|---|---|
| **`Recognizer`** | Decides *which* intent matches the input (rule / vector / llm / custom) |
| **`SlotExtractor`** | Pulls *parameters* out of the input for the predicted intent |
| **`FusionStrategy`** | Combines multiple recognizer outputs into one `FusedIntent` |
| **`Router`** | Maps a fused intent to `execute` / `clarify` / `fallback` / `transfer_human` |
| **`IntentRegistry`** | Catalog of `IntentDefinition`s (label + slots + examples + action) |
| **`IntentContext`** | Per-call state (history, inherited slots, user metadata) |
| **`IntentEngine`** | Orchestrates the pipeline, fires hooks, handles timeouts/merges |

The engine runs recognizers in parallel by default, fuses their outputs, routes the result, then runs slot
extractors in priority order if the action is `execute` or `clarify`.

---

## 🪢 Slot design

`intent-agent-kit` deliberately draws a **single-turn** boundary: it extracts slots from one utterance, validates them
against the intent's slot contract, computes `missingSlots` + `slotFillRate`, and lets the Agent do the multi-turn
clarification dance.

### Slot contract (`SlotDefinition`)

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | Identifier |
| `type` | ✅ | `string` / `number` / `boolean` / `date` / `enum` / `string[]` |
| `required` | ❌ | If true and missing → `action` demotes from `execute` to `clarify` |
| `description` | ❌ | Sent to LLM extractors as part of the prompt |
| `enumValues` | ❌ | Required when `type === 'enum'` |
| `defaultValue` | ❌ | Applied when the slot is missing after extraction |
| `pattern` | ❌ | Used by `RegexSlotExtractor` |
| `group` | ❌ | Capture-group index for the pattern (default `0`) |
| `transform` | ❌ | `toDate` / `toNumber` / `trim` / `lowercase` / `uppercase` |
| `prompt` | ❌ | Question to ask the user when this slot is missing |

### Three built-in extractors

| Extractor | When to use |
|---|---|
| `RegexSlotExtractor` | Structured, parseable inputs (order IDs, dates, amounts) — fastest, deterministic |
| `LLMSlotExtractor` | Unstructured natural language (locations, names, descriptions) |
| `ContextSlotExtractor` | Multi-turn dialog — carry slots from previous turns |

Slot extractors run in **priority order**: lower numbers run first, later non-null values overwrite earlier ones.
`ContextSlotExtractor` ships with priority `1` (runs first) so that current-turn values from other extractors override
inherited slots.

### Merge & validation

`mergeSlots(target, source, intent)` returns a **new** object — never mutates input. It:

1. Drops values that fail type validation
2. Optionally coerces strings → numbers / booleans
3. Applies `defaultValue` to still-missing slots
4. Records the result on `IntentResult.slots`

The engine then:

- Computes `missingSlots` (required + empty)
- Computes `slotFillRate` (required + filled / required total)
- If `missingSlots.length > 0` **and** `action === 'execute'` → demote to `clarify` and build a
  `clarificationPrompt` from each slot's `prompt` field (or a generic fallback)

---

## ⚙️ Configuration

| Option | Default | Description |
|---|---|---|
| `intents` | — *required* | `IntentDefinition[]` or an `IntentRegistry` |
| `recognizers` | — *required* | Array of `Recognizer` instances |
| `slotExtractors` | `[]` | Array of `SlotExtractor` instances |
| `fusion` | `WeightedFusion` | `FusionStrategy` instance |
| `router` | `ThresholdRouter` | `Router` instance |
| `contextProvider` | `MemoryContextProvider` | Loads per-call context |
| `hooks` | `{}` | Lifecycle hooks (see below) |
| `logger` | `ConsoleLogger` | Any `Logger`-shaped object (pino / winston) |
| `metrics` | — | `MetricsRecorder` for counters / histograms |
| `timeoutMs` | `5000` | Per-stage timeout |
| `parallel` | `true` | Run recognizers in parallel |
| `slotExtractionFallback` | `true` | Continue if all extractors fail |
| `fusionConfig.weights` | `{rule:1.3, vector:0.8, llm:1.0}` | Per-source weights |
| `routerConfig.thresholds` | `{execute:0.85, clarify:0.6, fallback:0.4}` | Confidence bands |
| `actionResolver` | — | `(intentLabel) => resolvedAction` |

---

## 🔌 Built-in recognizers

### `RuleRecognizer`

Matches `IntentDefinition.patterns` (regex) and `IntentDefinition.keywords` (substring). High-confidence regex hits
short-circuit the pipeline. Confidence: regex = `0.95`, 2+ keywords = `0.80`, 1 keyword = `0.65`.

### `VectorRecognizer`

Embeds each intent's `examples` via a pluggable `EmbeddingBackend` (`@xenova/transformers`, OpenAI, or your own),
then picks the highest cosine-similarity intent.

```ts
import { VectorRecognizer, type EmbeddingBackend } from 'intent-agent-kit';

const backend: EmbeddingBackend = {
  name: 'local',
  dimension: 384,
  async embed(text: string) { /* your model call */ return []; },
};

new VectorRecognizer({ backend, topK: 5, minSimilarity: 0.3 });
```

### `LLMRecognizer`

Uses an OpenAI-compatible chat completion endpoint with structured outputs to classify intents.

```ts
import OpenAI from 'openai';
import { LLMRecognizer } from 'intent-agent-kit';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
new LLMRecognizer({ client, model: 'gpt-4o-mini' });
```

The system prompt is built dynamically from `IntentDefinition.label` + `description` + `examples`. If the model returns
`intent: "__none__"` the recognizer yields `null`.

---

## 🪛 Built-in slot extractors

### `RegexSlotExtractor`

```ts
new RegexSlotExtractor({ priority: 10 });
```

### `LLMSlotExtractor`

```ts
new LLMSlotExtractor({ client, model: 'gpt-4o-mini', priority: 50 });
```

### `ContextSlotExtractor`

```ts
new ContextSlotExtractor({ strategy: 'clean', priority: 1 });
// `strategy: 'keep'`  -> carry every inherited slot
// `strategy: 'clean'` -> drop slots not in the new intent's contract (default)
```

---

## 🔀 Built-in fusion strategies

### `WeightedFusion` (default)

`confidence = Σ (confidenceᵢ × weightᵢ) / Σ weightᵢ` per intent. Best for heterogeneous recognizers.

### `VotingFusion`

Each recognizer = one vote. Winner is the most-voted intent; tie-broken by average confidence. Good when recognizers
are roughly equally reliable.

---

## 🛣 Built-in router

### `ThresholdRouter`

| Confidence band | Action |
|---|---|
| ≥ `execute` (0.85) | `execute` |
| ≥ `clarify` (0.60) | `clarify` |
| ≥ `fallback` (0.40) | `clarify` (with low-confidence prompt) |
| else | `transfer_human` |

`forceTransferIntents` / `forceFallbackIntents` short-circuit the thresholds entirely.

---

## 🛰 Observability

### Lifecycle hooks

```ts
const engine = new IntentEngine({
  intents: [...],
  recognizers: [...],
  hooks: {
    onRecognizeStart: (input, ctx) => { /* ... */ },
    onRecognizerComplete: (name, output, latencyMs) => { /* ... */ },
    onRecognizerError: (name, err) => { /* ... */ },
    onFusionComplete: (fused, latencyMs) => { /* ... */ },
    onSlotExtractStart: (intent, extractorNames) => { /* ... */ },
    onSlotExtractorComplete: (name, slots, latencyMs) => { /* ... */ },
    onSlotExtractorError: (name, err) => { /* ... */ },
    onSlotExtractComplete: (slots, missing, fillRate) => { /* ... */ },
    onRouteComplete: (result) => { /* ... */ },
    onError: (err, phase) => { /* ... */ },
  },
});
```

All hooks are isolated in `try/catch` — a buggy observer will never crash the engine.

### Metrics

```ts
import { InMemoryMetrics } from 'intent-agent-kit';

const metrics = new InMemoryMetrics();
new IntentEngine({ ..., metrics });
metrics.counters;       // Map<string, number>
metrics.observations;   // Array<{name,value,labels}>
```

Implement `MetricsRecorder` to forward to Prometheus / OpenTelemetry.

---

## 🤖 Agent tool routing (end-to-end)

```ts
const result = await engine.recognize('please order a large latte');

if (result.action === 'execute' && result.resolvedAction) {
  // dispatch to your Agent tool registry
  agentTools.invoke(result.resolvedAction, result.slots);
}
```

See [`examples/with-agent-tools.ts`](./examples/with-agent-tools.ts) for the full dispatcher example.

---

## 🔁 Multi-turn slot filling

```ts
const turn1 = await engine.recognize('I want to book a flight to Paris');
// turn1.missingSlots -> ['from', 'date']
// turn1.clarificationPrompt -> 'Which city are you flying from? ...'

const turn2 = await engine.recognize('From Beijing on 2026-10-15', {
  inheritedSlots: turn1.slots, // carry partial slots forward
});
// turn2.action -> 'execute'
// turn2.slots -> { to: 'Paris', from: 'Beijing', date: '2026-10-15' }
```

See [`examples/with-slot-filling.ts`](./examples/with-slot-filling.ts).

---

## 🧩 Custom extensions

Every interface is exported. Swap or extend any layer:

```ts
import type { Recognizer } from 'intent-agent-kit';

class MyRecognizer implements Recognizer {
  readonly name = 'my';
  readonly priority = 5;
  enabled = true;
  readonly shortCircuitable = false;
  async recognize(input, context, intents) {
    // your logic
    return null;
  }
}
```

---

## 🧪 Examples

| File | What it shows |
|---|---|
| [`examples/basic.ts`](./examples/basic.ts) | Rule + regex, zero external deps |
| [`examples/with-llm.ts`](./examples/with-llm.ts) | Rule + LLM recognizers + LLM slots |
| [`examples/with-context.ts`](./examples/with-context.ts) | Multi-turn dialog with `inheritedSlots` |
| [`examples/with-agent-tools.ts`](./examples/with-agent-tools.ts) | `resolvedAction` → tool dispatcher |
| [`examples/with-slot-filling.ts`](./examples/with-slot-filling.ts) | `missingSlots` triggers clarification |
| [`examples/with-langchain.ts`](./examples/with-langchain.ts) | **Full LangChain AgentExecutor integration** (see below) |

Run any of them with:

```bash
npx tsx examples/basic.ts
```

### 🦜 LangChain integration (full demo)

`intent-agent-kit` plays well as a **pre-router** in front of a LangChain `AgentExecutor`.
The pipeline becomes:

```
user input → IntentEngine.recognize() → action + slots → LangChain tool
                                            ↓ (clarify / fallback / small-talk)
                                  LangChain AgentExecutor handles the rest
```

This way you get the **structured-tool guarantees** of LangChain plus the **multi-engine
intent fusion** of `intent-agent-kit` — no need to teach the LLM the whole intent catalog
or risk hallucinated tool calls.

```bash
pnpm add langchain @langchain/core @langchain/openai
export OPENAI_API_KEY=sk-...
npx tsx examples/with-langchain.ts
```

The full example ([`examples/with-langchain.ts`](./examples/with-langchain.ts)) wires up:

1. Three intents (`order_coffee`, `check_order`, `cancel_order`) defined via `defineIntent(...)`.
2. An `IntentEngine` with rule + LLM recognizers and regex + LLM slot extractors.
3. One LangChain `DynamicTool` per intent (`create_order`, `check_order`, `cancel_order`).
4. A `dispatchViaLangChain()` bridge that maps `result.resolvedAction` → tool invocation,
   feeding the extracted `slots` straight into the tool's `func(input)`.
5. A second `AgentExecutor` that takes over for free-form chat (`"Thanks!"`, `"What sizes do you have?"`).
6. A demo loop that interleaves structured and unstructured turns and prints the engine's
   `onRouteComplete` trace for each.

Key snippet:

```ts
const result = await engine.recognize(userInput);

if (result.action === 'execute' && result.resolvedAction) {
  // Structured intent — dispatch to the matching LangChain tool.
  const tool = toolByAction.get(result.resolvedAction);
  reply = await tool.func(JSON.stringify(result.slots));
} else {
  // Clarify / fallback / chitchat — let LangChain Agent handle it.
  reply = (await agent.invoke({ input: userInput })).output;
}
```

This pattern scales to dozens of intents: keep the structured ones in `IntentDefinition`s,
let the LLM focus on open-ended conversation, and never again worry about the model
inventing tool calls that don't exist.

---

## ❓ FAQ

**Q: How do I disable a recognizer at runtime?**
A: `engine.toggleRecognizer('rule', false)`.

**Q: How do I provide a custom embedding backend?**
A: Implement `EmbeddingBackend` (`name`, `dimension`, `embed(text)`).

**Q: Can I have multiple slot extractors with different priorities?**
A: Yes. Lower `priority` runs first; later non-null slots overwrite earlier ones.

**Q: What happens if a recognizer throws?**
A: The error is caught, logged, and the recognizer returns `null`. The pipeline continues with the remaining outputs.
`onRecognizerError` is fired.

**Q: How does `execute` → `clarify` work?**
A: After slot extraction, if `missingSlots.length > 0`, the action is demoted and a `clarificationPrompt` is built
from `SlotDefinition.prompt` (or a default template).

**Q: Can I run recognizers serially?**
A: Yes — set `parallel: false` in the engine config.

---

## 📊 Comparison

| | `intent-agent-kit` | `intentmap` | `node-nlp` | `Rasa` | `intent-fusion` |
|---|---|---|---|---|---|
| Multi-engine fusion | ✅ | ❌ | ❌ | ❌ | ✅ |
| Slot contracts w/ types | ✅ | partial | ✅ | ✅ | ❌ |
| LLM-native | ✅ | ❌ | ❌ | ❌ | partial |
| Agent action routing | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hooks + metrics | ✅ | ❌ | ❌ | ✅ | ❌ |
| Zero forced deps | ✅ | ✅ | ❌ | ❌ | ✅ |
| Browser-compatible | ✅ | ✅ | ❌ | ❌ | ✅ |
| Bundle size (core) | < 60KB | ~30KB | n/a | n/a | ~40KB |

---

## 📄 License

MIT
