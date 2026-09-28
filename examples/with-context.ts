/**
 * Multi-turn context example. The user starts an order, then revises the
 * drink. The second turn relies on `inheritedSlots` to keep the
 * otherwise-stateful `orderId` from the first turn.
 *
 * Run with:
 *   npx tsx examples/with-context.ts
 */
import {
  IntentEngine,
  RuleRecognizer,
  RegexSlotExtractor,
  ContextSlotExtractor,
  defineIntent,
} from '../src/index.js';

const orderCoffee = defineIntent('order_coffee')
  .description('User wants to order a coffee drink.')
  .pattern(/order (a|an) (latte|mocha|cappuccino)/i)
  .keyword('coffee')
  .slot({
    name: 'orderId',
    type: 'string',
    required: false,
    pattern: /order[:#]?\s*([A-Za-z0-9-]+)/,
    prompt: 'What is your order ID?',
  })
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
    pattern: /\b(small|medium|large)\b/i,
  })
  .action('tool:create_order')
  .build();

const engine = new IntentEngine({
  intents: [orderCoffee],
  recognizers: [new RuleRecognizer()],
  slotExtractors: [
    new RegexSlotExtractor(),
    // ContextSlotExtractor runs last so it can fill slots not present in
    // the current utterance but inherited from the previous turn.
    new ContextSlotExtractor({ strategy: 'clean' }),
  ],
});

async function main() {
  // Turn 1 — user provides an order ID and drink.
  const turn1 = await engine.recognize('Order a latte, my orderId is ORD-9001', {
    inheritedSlots: {},
  });
  console.log('TURN 1:', turn1.action, turn1.slots);

  // Turn 2 — user revises the drink but the orderId should persist via context.
  const turn2 = await engine.recognize('change it to mocha', {
    inheritedSlots: turn1.slots,
  });
  console.log('TURN 2:', turn2.action, turn2.slots);

  await engine.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
