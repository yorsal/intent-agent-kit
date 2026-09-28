/**
 * Default in-memory context provider. Used when no custom provider is
 * configured — just echoes the caller's context back.
 */
import type { IntentContext } from '../types.js';
import type { ContextProvider } from './base.js';

export class MemoryContextProvider implements ContextProvider {
  public readonly name = 'memory';

  async load(context: IntentContext): Promise<IntentContext> {
    return { ...context };
  }
}
