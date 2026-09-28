/**
 * Context provider contract. Implementations fetch per-user state
 * (preferences, history, etc.) before the recognizers run. The default
 * in-memory implementation just returns the caller's context untouched.
 */
import type { IntentContext } from '../types.js';

export interface ContextProvider {
  readonly name: string;
  load(context: IntentContext): Promise<IntentContext>;
}
