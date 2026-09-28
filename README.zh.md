# intent-agent-kit

> **一个面向 AI Agent 的、框架无关、可插拔、多引擎融合的意图识别库。**

> 🌏 [English](./README.md) | 中文（本文件）

`intent-agent-kit` 是 [`pii-agent-kit`](https://www.npmjs.com/package/pii-agent-kit) 的姊妹项目。两者共同构成 AI Agent 的基础设施工具集：
前者负责清洗与保护用户数据，后者负责**理解用户意图**并抽取执行动作所需的**参数**。

适用场景：

- AI Agent 工具调用 / 技能路由
- 对话机器人的意图分类与参数抽取
- 智能客服 / 语音助手的意图识别
- 任何需要"把自然语言映射到 Agent 可执行动作"的场景

---

## ✨ 核心特性

| | |
|---|---|
| 🧩 可插拔 | 识别器、槽位抽取器、融合策略、路由器均可替换 |
| 📜 契约优先 | 每个公开接口都是 Zod Schema，运行时 + 编译时双重校验 |
| 🛰 零强制依赖 | 核心包不依赖任何 LLM / 向量库，peerDependencies 按需安装 |
| 🎯 Agent 原生 | 结果包含 `action`、`resolvedAction`、`missingSlots`、`slotFillRate` |
| 🪂 优雅降级 | 任一识别器 / 抽取器失败都不影响整体链路 |
| 🔭 可观测 | 内置生命周期 hooks + 可插拔的指标收集器 |
| 🪶 体积小 | 核心包 gzip 后 < 60 KB，同时支持 Node 18+ 与浏览器 |

---

## 📦 安装

```bash
pnpm add intent-agent-kit
# 按需安装可选 peer 依赖
pnpm add openai                  # 用于 LLMRecognizer / LLMSlotExtractor
pnpm add @xenova/transformers    # 用于本地向量嵌入
```

---

## 🚀 30 秒快速上手

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

## 🧠 核心概念

| 概念 | 作用 |
|---|---|
| **`Recognizer`** | 判断输入属于**哪个**意图（rule / vector / llm / 自定义） |
| **`SlotExtractor`** | 从输入中抽取意图所需的**参数** |
| **`FusionStrategy`** | 把多个识别器的输出融合成一个 `FusedIntent` |
| **`Router`** | 把融合后的意图映射为 `execute` / `clarify` / `fallback` / `transfer_human` |
| **`IntentRegistry`** | `IntentDefinition` 的注册中心（label + slots + examples + action） |
| **`IntentContext`** | 每次调用的上下文（对话历史、继承槽位、用户元数据） |
| **`IntentEngine`** | 编排以上所有组件，统一处理超时、合并、hook 触发 |

引擎默认并行执行所有识别器，对输出做融合与路由，再在 `execute` / `clarify` 路径上按优先级运行槽位抽取器。

---

## 🪢 槽位设计

`intent-agent-kit` 明确划定**单轮**边界：它只从单条语句中抽取槽位、按照意图的槽位契约校验、计算 `missingSlots` 与 `slotFillRate`，
把多轮追问交给 Agent 框架处理。

### 槽位契约（`SlotDefinition`）

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 标识符 |
| `type` | ✅ | `string` / `number` / `boolean` / `date` / `enum` / `string[]` |
| `required` | ❌ | 若为 true 且缺失，`action` 会从 `execute` 降级为 `clarify` |
| `description` | ❌ | 会拼进 LLM 抽取器的 prompt |
| `enumValues` | ❌ | `type === 'enum'` 时必填 |
| `defaultValue` | ❌ | 抽取缺失时填充 |
| `pattern` | ❌ | `RegexSlotExtractor` 使用的正则 |
| `group` | ❌ | 正则捕获组下标，默认 `0` |
| `transform` | ❌ | `toDate` / `toNumber` / `trim` / `lowercase` / `uppercase` |
| `prompt` | ❌ | 该槽位缺失时的追问话术 |

### 三种内置抽取器

| 抽取器 | 适用场景 |
|---|---|
| `RegexSlotExtractor` | 结构化、可解析的输入（订单号、日期、金额）—— 最快、最确定 |
| `LLMSlotExtractor` | 非结构化自然语言（地名、人名、描述） |
| `ContextSlotExtractor` | 多轮对话 —— 携带上一轮的槽位值 |

槽位抽取器按**优先级顺序**执行：数字越小越先执行，后执行者的非空值会覆盖先执行者的。
`ContextSlotExtractor` 默认 priority 为 `1`（最先执行），让当前轮其他抽取器的结果能覆盖继承值。

### 合并与校验

`mergeSlots(target, source, intent)` 返回一个**新对象**，不会修改入参。它会：

1. 丢弃类型校验失败的值
2. 必要时把字符串强转为 number / boolean
3. 对仍缺失的槽位应用 `defaultValue`
4. 把结果写入 `IntentResult.slots`

引擎随后：

- 计算 `missingSlots`（required 且为空的槽位）
- 计算 `slotFillRate`（required 已填 / required 总数）
- 若 `missingSlots.length > 0` 且 `action === 'execute'` → 自动降级为 `clarify`，并基于 `SlotDefinition.prompt` 生成 `clarificationPrompt`（若缺失则使用默认模板）

---

## ⚙️ 配置项

| 选项 | 默认值 | 说明 |
|---|---|---|
| `intents` | — *必填* | `IntentDefinition[]` 或 `IntentRegistry` |
| `recognizers` | — *必填* | `Recognizer` 实例数组 |
| `slotExtractors` | `[]` | `SlotExtractor` 实例数组 |
| `fusion` | `WeightedFusion` | `FusionStrategy` 实例 |
| `router` | `ThresholdRouter` | `Router` 实例 |
| `contextProvider` | `MemoryContextProvider` | 加载每次调用的上下文 |
| `hooks` | `{}` | 生命周期 hooks（见下文） |
| `logger` | `ConsoleLogger` | 任何符合 `Logger` 接口的对象（pino / winston） |
| `metrics` | — | `MetricsRecorder`，用于计数与直方图 |
| `timeoutMs` | `5000` | 每个阶段的超时时间 |
| `parallel` | `true` | 是否并行执行识别器 |
| `slotExtractionFallback` | `true` | 所有抽取器失败时是否继续 |
| `fusionConfig.weights` | `{rule:1.3, vector:0.8, llm:1.0}` | 各来源权重 |
| `routerConfig.thresholds` | `{execute:0.85, clarify:0.6, fallback:0.4}` | 置信度分级阈值 |
| `actionResolver` | — | `(intentLabel) => resolvedAction` |

---

## 🔌 内置识别器

### `RuleRecognizer`

匹配 `IntentDefinition.patterns`（正则）与 `IntentDefinition.keywords`（子串）。
高置信度的正则命中会短路整条流水线。
置信度：正则 = `0.95`，2+ 关键词 = `0.80`，1 关键词 = `0.65`。

### `VectorRecognizer`

通过可插拔的 `EmbeddingBackend`（`@xenova/transformers`、OpenAI 或自定义实现）
对每个意图的 `examples` 做嵌入，选取余弦相似度最高的意图。

```ts
import { VectorRecognizer, type EmbeddingBackend } from 'intent-agent-kit';

const backend: EmbeddingBackend = {
  name: 'local',
  dimension: 384,
  async embed(text: string) { /* 你的模型调用 */ return []; },
};

new VectorRecognizer({ backend, topK: 5, minSimilarity: 0.3 });
```

### `LLMRecognizer`

使用兼容 OpenAI 的 chat completion 接口，借助结构化输出（structured outputs）对意图进行分类。

```ts
import OpenAI from 'openai';
import { LLMRecognizer } from 'intent-agent-kit';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
new LLMRecognizer({ client, model: 'gpt-4o-mini' });
```

system prompt 会从 `IntentDefinition.label` + `description` + `examples` 动态拼装。
若模型返回 `intent: "__none__"`，识别器返回 `null`。

---

## 🪛 内置槽位抽取器

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
// `strategy: 'keep'`  -> 携带所有继承槽位
// `strategy: 'clean'` -> 丢弃不属于新意图的槽位（默认）
```

---

## 🔀 内置融合策略

### `WeightedFusion`（默认）

`confidence = Σ (confidenceᵢ × weightᵢ) / Σ weightᵢ`，按意图分别计算。
最适合异构识别器组合。

### `VotingFusion`

每个识别器一票。得票最多的意图获胜，同票时按平均置信度排序。
适合识别器可靠性接近的场景。

---

## 🛣 内置路由器

### `ThresholdRouter`

| 置信度区间 | 动作 |
|---|---|
| ≥ `execute` (0.85) | `execute` |
| ≥ `clarify` (0.60) | `clarify` |
| ≥ `fallback` (0.40) | `clarify`（附带低置信提示） |
| 否则 | `transfer_human` |

`forceTransferIntents` / `forceFallbackIntents` 会无视阈值强制路由。

---

## 🛰 可观测性

### 生命周期 hooks

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

所有 hook 都被 `try/catch` 隔离 —— 观察者抛错绝不会拖垮引擎。

### 指标收集

```ts
import { InMemoryMetrics } from 'intent-agent-kit';

const metrics = new InMemoryMetrics();
new IntentEngine({ ..., metrics });
metrics.counters;       // Map<string, number>
metrics.observations;   // Array<{name,value,labels}>
```

实现 `MetricsRecorder` 接口即可对接 Prometheus / OpenTelemetry。

---

## 🤖 Agent 工具路由（端到端）

```ts
const result = await engine.recognize('please order a large latte');

if (result.action === 'execute' && result.resolvedAction) {
  // 分发到 Agent 工具注册中心
  agentTools.invoke(result.resolvedAction, result.slots);
}
```

完整示例见 [`examples/with-agent-tools.ts`](./examples/with-agent-tools.ts)。

---

## 🔁 多轮槽位填充

```ts
const turn1 = await engine.recognize('I want to book a flight to Paris');
// turn1.missingSlots -> ['from', 'date']
// turn1.clarificationPrompt -> 'Which city are you flying from? ...'

const turn2 = await engine.recognize('From Beijing on 2026-10-15', {
  inheritedSlots: turn1.slots, // 携带上一轮的部分槽位
});
// turn2.action -> 'execute'
// turn2.slots -> { to: 'Paris', from: 'Beijing', date: '2026-10-15' }
```

完整示例见 [`examples/with-slot-filling.ts`](./examples/with-slot-filling.ts)。

---

## 🧩 自定义扩展

所有接口都已导出，可以替换或扩展任意层：

```ts
import type { Recognizer } from 'intent-agent-kit';

class MyRecognizer implements Recognizer {
  readonly name = 'my';
  readonly priority = 5;
  enabled = true;
  readonly shortCircuitable = false;
  async recognize(input, context, intents) {
    // 你的逻辑
    return null;
  }
}
```

---

## 🧪 示例

| 文件 | 演示内容 |
|---|---|
| [`examples/basic.ts`](./examples/basic.ts) | 规则 + 正则，零外部依赖 |
| [`examples/with-llm.ts`](./examples/with-llm.ts) | 规则 + LLM 识别器 + LLM 槽位抽取 |
| [`examples/with-context.ts`](./examples/with-context.ts) | 多轮对话 + `inheritedSlots` |
| [`examples/with-agent-tools.ts`](./examples/with-agent-tools.ts) | `resolvedAction` → 工具分发 |
| [`examples/with-slot-filling.ts`](./examples/with-slot-filling.ts) | `missingSlots` 触发追问 |
| [`examples/with-langchain.ts`](./examples/with-langchain.ts) | **完整 LangChain AgentExecutor 集成**（见下文） |

运行任意示例：

```bash
npx tsx examples/basic.ts
```

### 🦜 LangChain 集成（完整 Demo）

`intent-agent-kit` 非常适合作为 LangChain `AgentExecutor` 的**前置路由器**。
完整流水线如下：

```
用户输入 → IntentEngine.recognize() → action + slots → LangChain tool
                              ↓ (追问 / fallback / 寒暄)
                  LangChain AgentExecutor 处理剩余对话
```

这样你可以同时获得 LangChain 的**结构化工具保证**和 `intent-agent-kit` 的**多引擎意图融合**——
既不用把所有意图硬塞进 LLM 的 prompt，也不用担心模型幻觉出根本不存在的工具调用。

```bash
pnpm add langchain @langchain/core @langchain/openai
export OPENAI_API_KEY=sk-...
npx tsx examples/with-langchain.ts
```

完整示例（[`examples/with-langchain.ts`](./examples/with-langchain.ts)）包含：

1. 三个意图（`order_coffee`、`check_order`、`cancel_order`），通过 `defineIntent(...)` 定义。
2. 一个 `IntentEngine`，同时启用规则 + LLM 识别器、正则 + LLM 槽位抽取器。
3. 每个意图对应一个 LangChain `DynamicTool`（`create_order`、`check_order`、`cancel_order`）。
4. `dispatchViaLangChain()` 桥接函数：把 `result.resolvedAction` 映射到工具，
   并把抽取到的 `slots` 直接传入工具的 `func(input)`。
5. 第二个 `AgentExecutor` 接管自由对话（`"Thanks!"`、`"What sizes do you have?"`）。
6. Demo 循环交替演示结构化与非结构化输入，并为每条打印 `onRouteComplete` 链路。

关键代码：

```ts
const result = await engine.recognize(userInput);

if (result.action === 'execute' && result.resolvedAction) {
  // 结构化意图 —— 分发到对应的 LangChain tool。
  const tool = toolByAction.get(result.resolvedAction);
  reply = await tool.func(JSON.stringify(result.slots));
} else {
  // 追问 / fallback / 寒暄 —— 让 LangChain Agent 处理。
  reply = (await agent.invoke({ input: userInput })).output;
}
```

这个模式可以扩展到几十个意图：让 LLM 只处理开放对话，把结构化意图全部交给 `IntentDefinition`，
从此再也不必担心模型幻觉出工具调用。

---

## ❓ FAQ

**Q：如何运行时禁用某个识别器？**
A：`engine.toggleRecognizer('rule', false)`。

**Q：如何提供自定义的嵌入后端？**
A：实现 `EmbeddingBackend`（`name`、`dimension`、`embed(text)`）。

**Q：可以有多个不同优先级的槽位抽取器吗？**
A：可以。`priority` 小的先执行，后执行者的非空槽位覆盖先执行者。

**Q：如果识别器抛错会怎样？**
A：错误被捕获并记录，识别器返回 `null`，流水线继续用其余输出。`onRecognizerError` 会被触发。

**Q：`execute` → `clarify` 是怎么工作的？**
A：完成槽位抽取后，若 `missingSlots.length > 0`，动作降级并基于 `SlotDefinition.prompt` 生成 `clarificationPrompt`（缺省时使用默认模板）。

**Q：可以让识别器串行执行吗？**
A：可以 —— 在引擎配置中设置 `parallel: false`。

---

## 📊 对比

| | `intent-agent-kit` | `intentmap` | `node-nlp` | `Rasa` | `intent-fusion` |
|---|---|---|---|---|---|
| 多引擎融合 | ✅ | ❌ | ❌ | ❌ | ✅ |
| 带类型的槽位契约 | ✅ | 部分 | ✅ | ✅ | ❌ |
| LLM 原生 | ✅ | ❌ | ❌ | ❌ | 部分 |
| Agent 动作路由 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hooks + 指标 | ✅ | ❌ | ❌ | ✅ | ❌ |
| 零强制依赖 | ✅ | ✅ | ❌ | ❌ | ✅ |
| 浏览器兼容 | ✅ | ✅ | ❌ | ❌ | ✅ |
| 核心包体积 | < 60KB | ~30KB | n/a | n/a | ~40KB |

---

## 📄 许可证

MIT
