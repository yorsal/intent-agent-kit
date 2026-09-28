/**
 * Full LangChain integration example.
 *
 * Pattern: IntentEngine runs as a *pre-router* in front of a LangChain
 * AgentExecutor. Every user message is first classified into one of our
 * intents and its slots are filled; only then do we dispatch to the
 * matching LangChain tool. This combines the structured-tool guarantees
 * of LangChain with the multi-engine intent fusion of intent-agent-kit.
 *
 * Prerequisites:
 *   pnpm add langchain @langchain/core @langchain/openai
 *   export OPENAI_API_KEY=sk-...
 *
 * Run with:
 *   npx tsx examples/with-langchain.ts
 */
import OpenAI from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import {
  AgentExecutor,
  createToolCallingAgent,
} from 'langchain/agents';
import { DynamicTool } from '@langchain/core/tools';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import {
  IntentEngine,
  RuleRecognizer,
  LLMRecognizer,
  RegexSlotExtractor,
  LLMSlotExtractor,
  defineIntent,
  type IntentResult,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// 1. Domain intents
// ---------------------------------------------------------------------------

const orderCoffee = defineIntent('order_coffee')
  .description('Place a new coffee order.')
  .pattern(/order (a|an) (latte|mocha|cappuccino)/i)
  .example('I want a large latte please')
  .slot({
    name: 'drink',
    type: 'string',
    required: true,
    pattern: /(latte|mocha|cappuccino)/i,
    prompt: 'Which coffee would you like?',
  })
  .slot({
    name: 'size',
    type: 'enum',
    required: false,
    enumValues: ['small', 'medium', 'large'],
  })
  .action('tool:create_order')
  .build();

const checkOrder = defineIntent('check_order')
  .description('Check the status of an existing order.')
  .keyword('where')
  .keyword('status')
  .slot({
    name: 'orderId',
    type: 'string',
    required: true,
    pattern: /order[:#]?\s*([A-Za-z0-9-]+)/,
    group: 1,
    prompt: 'What is your order ID?',
  })
  .action('tool:check_order')
  .build();

const cancelOrder = defineIntent('cancel_order')
  .description('Cancel an existing order.')
  .keyword('cancel')
  .keyword('refund')
  .slot({
    name: 'orderId',
    type: 'string',
    required: true,
    pattern: /order[:#]?\s*([A-Za-z0-9-]+)/,
    group: 1,
    prompt: 'Please provide the order ID to cancel',
  })
  .action('tool:cancel_order')
  .build();

// ---------------------------------------------------------------------------
// 2. IntentEngine — the pre-router
// ---------------------------------------------------------------------------

function buildEngine(client: OpenAI): IntentEngine {
  return new IntentEngine({
    intents: [orderCoffee, checkOrder, cancelOrder],
    recognizers: [
      new RuleRecognizer(),
      new LLMRecognizer({ client, model: 'gpt-4o-mini' }),
    ],
    slotExtractors: [
      new RegexSlotExtractor(),
      new LLMSlotExtractor({ client, model: 'gpt-4o-mini' }),
    ],
    hooks: {
      onRouteComplete: (result) => {
        console.log(
          `[intent-agent-kit] intent=${result.intent} action=${result.action}` +
            ` confidence=${result.confidence.toFixed(2)}` +
            ` slots=${JSON.stringify(result.slots)}`
        );
      },
    },
  });
}

// ---------------------------------------------------------------------------
// 3. LangChain tools — one per intent
// ---------------------------------------------------------------------------

/**
 * In a real app these would call your backend. For the demo they print a
 * string and pretend the work happened.
 */
const orderStore = new Map<string, { drink: string; size: string }>();

const langchainTools = [
  new DynamicTool({
    name: 'create_order',
    description:
      'Create a new coffee order. Input must be JSON: {"drink": "latte", "size": "medium"}.',
    func: async (input: string): Promise<string> => {
      const { drink, size } = JSON.parse(input) as { drink: string; size?: string };
      const orderId = `ORD-${Math.floor(Math.random() * 9000 + 1000)}`;
      const resolvedSize = size ?? 'medium';
      orderStore.set(orderId, { drink, size: resolvedSize });
      return JSON.stringify({ orderId, drink, size: resolvedSize });
    },
  }),
  new DynamicTool({
    name: 'check_order',
    description:
      'Look up the status of an order. Input must be JSON: {"orderId": "ORD-1234"}.',
    func: async (input: string): Promise<string> => {
      const { orderId } = JSON.parse(input) as { orderId: string };
      const order = orderStore.get(orderId);
      if (!order) return JSON.stringify({ found: false, orderId });
      return JSON.stringify({ found: true, orderId, ...order });
    },
  }),
  new DynamicTool({
    name: 'cancel_order',
    description:
      'Cancel an existing order. Input must be JSON: {"orderId": "ORD-1234"}.',
    func: async (input: string): Promise<string> => {
      const { orderId } = JSON.parse(input) as { orderId: string };
      const removed = orderStore.delete(orderId);
      return JSON.stringify({ cancelled: removed, orderId });
    },
  }),
];

// ---------------------------------------------------------------------------
// 4. Bridge: IntentResult -> LangChain tool invocation
// ---------------------------------------------------------------------------

const toolByAction = new Map<string, DynamicTool>(
  langchainTools.map((t) => [t.name, t])
);

async function dispatchViaLangChain(result: IntentResult): Promise<string> {
  if (result.action !== 'execute' || !result.resolvedAction) {
    return `I need a bit more info: ${result.clarificationPrompt ?? 'could you clarify?'}`;
  }
  const tool = toolByAction.get(result.resolvedAction);
  if (!tool) {
    return `No tool registered for action "${result.resolvedAction}".`;
  }
  return tool.func(JSON.stringify(result.slots));
}

// ---------------------------------------------------------------------------
// 5. Optional LangChain AgentExecutor for free-form follow-up chat
//    (e.g. "thanks!", "what sizes do you have?"). The pre-router handles
//    the structured intents; the agent handles everything else.
// ---------------------------------------------------------------------------

function buildFollowupAgent(): AgentExecutor {
  const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0 });
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      'You are a friendly barista. Keep answers under 30 words. ' +
        'Never make up menu items; defer to the user.',
    ],
    ['placeholder', '{chat_history}'],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ]);
  const agent = createToolCallingAgent({
    llm: model,
    tools: langchainTools,
    prompt,
  });
  return new AgentExecutor({ agent, tools: langchainTools, verbose: false });
}

// ---------------------------------------------------------------------------
// 6. Demo loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });
  const engine = buildEngine(client);
  const agent = buildFollowupAgent();
  await engine.init();

  const messages: Array<[string, string]> = [
    ['Please order a large latte', 'order'],
    ['Where is order ORD-1001?', 'order'],
    ['Cancel order ORD-1001', 'order'],
    ['Thanks!', 'chitchat'],
    ['What sizes can I get?', 'chitchat'],
  ];

  for (const [input, expectedKind] of messages) {
    console.log(`\nUSER: ${input}`);
    const result = await engine.recognize(input);

    let reply: string;
    if (result.action === 'execute' && result.resolvedAction) {
      // Structured intent — dispatch to the matching LangChain tool.
      reply = await dispatchViaLangChain(result);
    } else if (expectedKind === 'chitchat') {
      // Free-form turn — let LangChain Agent handle the small talk.
      reply = (await agent.invoke({ input })).output;
    } else {
      // Clarify path — surface the engine's prompt back to the user.
      reply = `Clarify: ${result.clarificationPrompt ?? 'could you clarify?'}`;
    }
    console.log(`AGENT: ${reply}`);
  }

  await engine.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
