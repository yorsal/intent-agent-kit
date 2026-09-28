/**
 * intent-agent-kit — public entry point.
 *
 * Re-exports every type, schema, and class that downstream consumers
 * should reach for. Anything not re-exported here is considered an
 * implementation detail and may change without notice.
 */

// Engine + config
export { IntentEngine } from './engine.js';
export type { IntentEngineConfig } from './config.js';
export { resolveEngineConfig } from './config.js';

// Core types
export * from './types.js';

// Errors
export * from './errors.js';

// Recognizers
export * from './recognizers/index.js';

// Slot extractors + merge helpers
export * from './slots/index.js';

// Fusion
export * from './fusion/index.js';

// Router
export * from './router/index.js';

// Context providers
export * from './context/index.js';

// Observability
export * from './observability/index.js';

// Intents registry + DSL
export * from './intents/index.js';

// Utils (logger is intentionally re-exported for convenience)
export { ConsoleLogger, SilentLogger, createDefaultLogger } from './utils/logger.js';
export {
  normalizeText,
  normalizeMixed,
  containsKeyword,
  safeRegexTest,
  safeDateParse,
  applyTzOffset,
} from './utils/normalize.js';
