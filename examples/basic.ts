/**
 * Basic example — pure rule-based recognition + regex slot extraction.
 * Zero external dependencies. Run with:
 *
 *   npx tsx examples/basic.ts
 *
 * Expected output:
 *   {
 *     intent: 'order_coffee',
 *     action: 'execute',
 *     resolvedAction: 'tool:create_order',
 *     slots: { drink: 'latte' },
 *     missingSlots: [],
 *     slotFillRate: 1,
 *     ...
 *   }
 */
import { IntentEngine, RuleRecognizer, RegexSlotExtractor, defineIntent } from '../src/index.js';

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

const chitchat = defineIntent('chitchat')
  .description('Casual small talk.')
  .keyword('how are you')
  .build();

const engine = new IntentEngine({
  intents: [orderCoffee, chitchat],
  recognizers: [new RuleRecognizer()],
  slotExtractors: [new RegexSlotExtractor()],
});

async function main() {
  const result = await engine.recognize('Please order a latte for me');
  console.log(JSON.stringify(result, null, 2));
  await engine.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
