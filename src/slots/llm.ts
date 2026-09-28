/**
 * LLM-driven slot extractor. Issues a single structured-output call to
 * pull every declared slot for the predicted intent. Falls back to `null`
 * on any failure (engine treats it as "no slots extracted").
 */
import { z } from 'zod';
import type {
  IntentContext,
  IntentDefinition,
  Slots,
} from '../types.js';
import type { ChatClient } from '../recognizers/llm.js';
import type { SlotExtractor } from './base.js';

export interface LLMSlotExtractorOptions {
  client: ChatClient;
  model: string;
  name?: string;
  priority?: number;
  temperature?: number;
  systemPromptPrefix?: string;
}

function buildSystemPrompt(
  intent: IntentDefinition,
  prefix?: string
): string {
  const slotDocs = intent.slots
    .map((slot) => {
      const enumPart = slot.enumValues ? ` Allowed: ${slot.enumValues.join(' | ')}` : '';
      const req = slot.required ? ' (required)' : ' (optional)';
      return `- ${slot.name} (${slot.type})${req}: ${slot.description ?? ''}${enumPart}`;
    })
    .join('\n');
  const head =
    prefix ??
    'You extract structured parameters from the latest user utterance for a given agent intent. ' +
      'Only return slots you are confident about. Leave unknown slots out of the JSON entirely.';
  return `${head}\n\nIntent: ${intent.label}\n${intent.description ?? ''}\n\nSlots:\n${slotDocs}`;
}

function buildUserPrompt(input: string, context: IntentContext): string {
  const history = (context.history ?? [])
    .slice(-6)
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join('\n');
  return history.length > 0
    ? `Conversation:\n${history}\n\nLatest user utterance: ${input}\n\nExtract slots.`
    : `User utterance: ${input}\n\nExtract slots.`;
}

export class LLMSlotExtractor implements SlotExtractor {
  public readonly name: string;
  public readonly priority: number;
  public enabled = true;
  private readonly client: ChatClient;
  private readonly model: string;
  private readonly temperature: number;
  private readonly systemPromptPrefix: string | undefined;

  constructor(options: LLMSlotExtractorOptions) {
    this.name = options.name ?? 'llm';
    this.priority = options.priority ?? 50;
    this.client = options.client;
    this.model = options.model;
    this.temperature = options.temperature ?? 0;
    this.systemPromptPrefix = options.systemPromptPrefix;
  }

  async extract(
    input: string,
    context: IntentContext,
    intent: IntentDefinition
  ): Promise<Slots | null> {
    if (intent.slots.length === 0) return null;
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: this.temperature,
        messages: [
          { role: 'system', content: buildSystemPrompt(intent, this.systemPromptPrefix) },
          { role: 'user', content: buildUserPrompt(input, context) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'slot_extraction',
            schema: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
      });
      const content = response.choices[0]?.message.content;
      if (!content) return null;
      const parsed = z.record(z.unknown()).safeParse(JSON.parse(content));
      if (!parsed.success) return null;

      // Filter to only declared slot names so we don't leak random fields.
      const allowed = new Set(intent.slots.map((s) => s.name));
      const filtered: Slots = {};
      for (const [key, value] of Object.entries(parsed.data)) {
        if (!allowed.has(key)) continue;
        if (value === null || value === undefined) continue;
        filtered[key] = value as Slots[string];
      }
      return Object.keys(filtered).length > 0 ? filtered : null;
    } catch (err) {
      void err;
      return null;
    }
  }
}
