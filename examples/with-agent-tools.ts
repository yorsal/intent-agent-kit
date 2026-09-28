/**
 * Agent tool routing example. Maps the recognized intent to a concrete
 * Agent tool invocation, demonstrating how `resolvedAction` flows out
 * of the engine into a downstream dispatcher.
 *
 * Run with:
 *   npx tsx examples/with-agent-tools.ts
 */
import {
  IntentEngine,
  RuleRecognizer,
  RegexSlotExtractor,
  defineIntent,
  type IntentResult,
} from '../src/index.js';

const orderCoffee = defineIntent('order_coffee')
  .description('Place a coffee order.')
  .pattern(/order (a|an) (latte|mocha|cappuccino)/i)
  .keyword('coffee')
  .slot({
    name: 'drink',
    type: 'string',
    required: true,
    pattern: /(latte|mocha|cappuccino)/i,
  })
  .slot({
    name: 'size',
    type: 'enum',
    required: false,
    enumValues: ['small', 'medium', 'large'],
  })
  .action('tool:create_order')
  .build();

const cancelOrder = defineIntent('cancel_order')
  .description('Cancel a previously placed order.')
  .keyword('cancel')
  .keyword('refund')
  .slot({
    name: 'orderId',
    type: 'string',
    required: true,
    pattern: /order[:#]?\s*([A-Za-z0-9-]+)/,
    prompt: 'Please provide the order ID to cancel',
  })
  .action('tool:cancel_order')
  .build();

/** Toy dispatcher — wire up to your real Agent tool registry here. */
const toolHandlers: Record<string, (slots: IntentResult['slots']) => string> = {
  'tool:create_order': (slots) =>
    `[tool:create_order] drink=${String(slots.drink)}, size=${String(slots.size ?? 'medium')}`,
  'tool:cancel_order': (slots) =>
    `[tool:cancel_order] cancelled ${String(slots.orderId)}`,
};

async function dispatch(result: IntentResult): Promise<string> {
  if (result.action !== 'execute') {
    return `[dispatcher] action=${result.action} prompt=${result.clarificationPrompt ?? ''}`;
  }
  const handler = result.resolvedAction ? toolHandlers[result.resolvedAction] : undefined;
  return handler ? handler(result.slots) : `[dispatcher] no handler for ${result.resolvedAction}`;
}

async function main() {
  const engine = new IntentEngine({
    intents: [orderCoffee, cancelOrder],
    recognizers: [new RuleRecognizer()],
    slotExtractors: [new RegexSlotExtractor()],
  });

  const inputs = [
    'please order a large latte',
    'cancel my order ORD-7777',
    'I have no idea what to do',
  ];

  for (const input of inputs) {
    const result = await engine.recognize(input);
    const sideEffect = await dispatch(result);
    console.log(`USER: ${input}`);
    console.log(sideEffect);
    console.log('---');
  }
  await engine.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
