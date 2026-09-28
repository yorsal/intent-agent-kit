/**
 * Stub type declarations for optional peer dependencies used by the
 * examples. Real consumers must install these packages; the stubs let
 * `tsc --noEmit` succeed without forcing every contributor to do so.
 */

declare module 'openai' {
  export interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }
  export interface OpenAIChatCompletionChoice {
    message: { content: string | null };
  }
  export interface OpenAIChatCompletionCreateArgs {
    model: string;
    messages: OpenAIChatMessage[];
    temperature?: number;
    response_format?: { type: string; json_schema?: unknown };
  }
  export interface OpenAIChatCompletions {
    create(args: OpenAIChatCompletionCreateArgs): Promise<{
      choices: OpenAIChatCompletionChoice[];
    }>;
  }
  export interface OpenAIChat {
    completions: OpenAIChatCompletions;
  }
  export default class OpenAI {
    chat: OpenAIChat;
    constructor(opts: { apiKey?: string; baseURL?: string });
  }
}

// ponytail: minimal surface area used by examples/with-langchain.ts.
// Replace with the real @langchain/* types when those are installed.
declare module '@langchain/openai' {
  export class ChatOpenAI {
    constructor(opts: { model: string; temperature?: number; apiKey?: string });
  }
}
declare module '@langchain/core/tools' {
  export class DynamicTool {
    name: string;
    description: string;
    constructor(opts: {
      name: string;
      description: string;
      func: (input: string) => Promise<string>;
    });
    func: (input: string) => Promise<string>;
  }
}
declare module '@langchain/core/prompts' {
  export const ChatPromptTemplate: {
    fromMessages(msgs: Array<[string, string]>): unknown;
  };
}
declare module 'langchain/agents' {
  export function createToolCallingAgent(opts: {
    llm: unknown;
    tools: unknown[];
    prompt: unknown;
  }): unknown;
  export class AgentExecutor {
    constructor(opts: {
      agent: unknown;
      tools: unknown[];
      verbose?: boolean;
    });
    invoke(args: { input: string; chat_history?: unknown[] }): Promise<{ output: string }>;
  }
}
