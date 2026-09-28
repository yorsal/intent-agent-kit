/**
 * LLM example — combines rule + LLM recognizers and LLM slot extraction.
 *
 * Requires `OPENAI_API_KEY` and `openai` installed as a peer dependency:
 *
 *   pnpm add openai
 *   OPENAI_API_KEY=sk-... npx tsx examples/with-llm.ts
 */
import OpenAI from 'openai';
import {
  IntentEngine,
  RuleRecognizer,
  LLMRecognizer,
  RegexSlotExtractor,
  LLMSlotExtractor,
  defineIntent,
} from '../src/index.js';

const bookFlight = defineIntent('book_flight')
  .description('User wants to book a flight.')
  .example('I want to book a flight from Beijing to Shanghai')
  .example('Find me a ticket to Tokyo tomorrow')
  .example('Book a one-way ticket to Paris next week')
  .slot({
    name: 'from',
    type: 'string',
    required: true,
    description: 'Departure city',
    prompt: 'Which city are you flying from?',
  })
  .slot({
    name: 'to',
    type: 'string',
    required: true,
    description: 'Arrival city',
    prompt: 'What is your destination city?',
  })
  .slot({
    name: 'time',
    type: 'date',
    required: false,
    description: 'Departure date',
    prompt: 'When would you like to depart?',
  })
  .action('tool:search_flights')
  .build();

const orderCoffee = defineIntent('order_coffee')
  .description('Order a coffee drink.')
  .pattern(/order (a|an) (latte|mocha|cappuccino)/i)
  .keyword('coffee')
  .action('tool:create_order')
  .build();

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' });

  const engine = new IntentEngine({
    intents: [bookFlight, orderCoffee],
    recognizers: [
      new RuleRecognizer(),
      new LLMRecognizer({ client, model: 'gpt-4o-mini' }),
    ],
    slotExtractors: [
      new RegexSlotExtractor(),
      new LLMSlotExtractor({ client, model: 'gpt-4o-mini' }),
    ],
  });

  const result = await engine.recognize('I want to book a flight from Beijing to Tokyo next Friday', {
    history: [{ role: 'user', content: 'I want to book a flight from Beijing to Tokyo next Friday' }],
  });

  console.log(JSON.stringify(result, null, 2));
  await engine.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
