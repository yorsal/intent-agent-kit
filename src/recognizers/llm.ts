/**
 * LLM recognizer — asks a chat model to classify the user input into one
 * of the registered intents. Uses Structured Outputs (Zod schema) to
 * guarantee well-formed responses. Compatible with any OpenAI-style
 * chat completion endpoint by allowing `baseURL` override.
 *
 * NOTE: this module imports `openai` lazily so the package can be used
 * without it installed. Consumers must `npm i openai` to enable this
 * recognizer.
 */
import { z } from 'zod';
import type {
  IntentContext,
  IntentDefinition,
  RecognizerOutput,
} from '../types.js';
import type { Recognizer } from './base.js';

/** Minimal chat-completion interface we need from any provider. */
export interface ChatClient {
  chat: {
    completions: {
      create(args: {
        model: string;
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
        response_format?: { type: 'json_schema'; json_schema: unknown };
        temperature?: number;
      }): Promise<{
        choices: Array<{ message: { content: string | null } }>;
      }>;
    };
  };
}

export interface LLMRecognizerOptions {
  client: ChatClient;
  model: string;
  /** Override the recognizer name. */
  name?: string;
  priority?: number;
  /** Sampling temperature; default 0 for deterministic classification. */
  temperature?: number;
  /** Optional system prompt preface. */
  systemPromptPrefix?: string;
}

const ResponseSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  alternatives: z
    .array(
      z.object({
        intent: z.string(),
        confidence: z.number().min(0).max(1),
      })
    )
    .default([]),
});

function buildSystemPrompt(intents: IntentDefinition[], prefix?: string): string {
  const lines = intents.map((intent) => {
    const desc = intent.description ? ` — ${intent.description}` : '';
    return `- ${intent.label}${desc}`;
  });
  const head =
    prefix ??
    'You are an intent classifier for an AI agent. Choose the single best matching intent from the list. If none fit, return intent="__none__" with confidence 0. Respond as JSON.';
  return `${head}\n\nIntents:\n${lines.join('\n')}`;
}

function buildUserPrompt(
  input: string,
  context: IntentContext
): string {
  const history = (context.history ?? [])
    .slice(-6)
    .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
    .join('\n');
  return history.length > 0
    ? `Conversation so far:\n${history}\n\nLatest user input:\n${input}\n\nClassify the latest user input.`
    : `User input:\n${input}\n\nClassify the user input.`;
}

export class LLMRecognizer implements Recognizer {
  public readonly name: string;
  public readonly priority: number;
  public enabled = true;
  public readonly shortCircuitable = false;
  private readonly client: ChatClient;
  private readonly model: string;
  private readonly temperature: number;
  private readonly systemPromptPrefix: string | undefined;

  constructor(options: LLMRecognizerOptions) {
    this.name = options.name ?? 'llm';
    this.priority = options.priority ?? 30;
    this.client = options.client;
    this.model = options.model;
    this.temperature = options.temperature ?? 0;
    this.systemPromptPrefix = options.systemPromptPrefix;
  }

  async recognize(
    input: string,
    context: IntentContext,
    intents: IntentDefinition[]
  ): Promise<RecognizerOutput | null> {
    if (intents.length === 0) return null;
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: this.temperature,
        messages: [
          { role: 'system', content: buildSystemPrompt(intents, this.systemPromptPrefix) },
          { role: 'user', content: buildUserPrompt(input, context) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'intent_classification',
            schema: {
              type: 'object',
              properties: {
                intent: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                alternatives: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      intent: { type: 'string' },
                      confidence: { type: 'number', minimum: 0, maximum: 1 },
                    },
                    required: ['intent', 'confidence'],
                  },
                },
              },
              required: ['intent', 'confidence'],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0]?.message.content;
      if (!content) return null;
      const parsed = ResponseSchema.safeParse(JSON.parse(content));
      if (!parsed.success) return null;
      if (parsed.data.intent === '__none__') return null;

      return {
        intent: parsed.data.intent,
        confidence: parsed.data.confidence,
        slots: {},
        source: this.name,
        alternatives: parsed.data.alternatives,
        raw: parsed.data,
      };
    } catch (err) {
      // ponytail: swallow + return null per spec; the engine records the
      // failure via `onRecognizerError`. Don't log here to avoid double
      // emission — the engine owns lifecycle logging.
      void err;
      return null;
    }
  }
}
