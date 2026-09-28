/**
 * Slot-filling / clarification example. Demonstrates how `missingSlots`
 * and `clarificationPrompt` are surfaced so the Agent can ask the user
 * for the missing parameters. The next turn supplies them and the
 * action promotes from `clarify` to `execute`.
 *
 * Run with:
 *   npx tsx examples/with-slot-filling.ts
 */
import {
  IntentEngine,
  RuleRecognizer,
  RegexSlotExtractor,
  defineIntent,
} from '../src/index.js';

const bookFlight = defineIntent('book_flight')
  .description('User wants to book a flight.')
  .example('I want to book a flight to Paris')
  .keyword('flight')
  .keyword('book')
  .slot({
    name: 'from',
    type: 'string',
    required: true,
    prompt: 'Which city are you flying from?',
  })
  .slot({
    name: 'to',
    type: 'string',
    required: true,
    prompt: 'What is your destination?',
  })
  .slot({
    name: 'date',
    type: 'string',
    required: true,
    pattern: /\d{4}-\d{2}-\d{2}/,
    prompt: 'When do you want to depart? (YYYY-MM-DD)',
  })
  .action('tool:book_flight')
  .build();

const engine = new IntentEngine({
  intents: [bookFlight],
  recognizers: [new RuleRecognizer()],
  slotExtractors: [new RegexSlotExtractor()],
});

async function main() {
  // Turn 1 — only mentions destination.
  const turn1 = await engine.recognize('I want to book a flight to Paris');
  console.log(`TURN 1 action=${turn1.action} missing=${turn1.missingSlots.join(',')}`);
  console.log(`  agent says: "${turn1.clarificationPrompt}"`);

  // Turn 2 — user replies with origin and date; we re-run recognition and
  // pass the previous slots through `inheritedSlots` so partial
  // information from earlier turns is preserved.
  const turn2 = await engine.recognize('From Beijing on 2026-10-15', {
    inheritedSlots: turn1.slots,
  });
  console.log(`TURN 2 action=${turn2.action} slots=${JSON.stringify(turn2.slots)}`);
  await engine.dispose();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
