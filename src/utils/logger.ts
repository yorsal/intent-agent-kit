/**
 * Tiny logger abstraction. Consumers inject their own logger (pino, winston,
 * or any object that satisfies `Logger`). When none is provided we fall
 * back to a level-aware console logger that respects `LOG_LEVEL`.
 */

/** Log severity ordered from most to least verbose. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child?(bindings: Record<string, unknown>): Logger;
}

function envLevel(): LogLevel {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.LOG_LEVEL;
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' || raw === 'silent') {
    return raw;
  }
  return 'info';
}

/** Console-backed logger with level filtering. */
export class ConsoleLogger implements Logger {
  private readonly threshold: number;

  constructor(level: LogLevel = envLevel()) {
    this.threshold = LEVELS[level];
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.threshold <= LEVELS.debug) {
      // eslint-disable-next-line no-console
      console.debug(this.format('debug', message, meta));
    }
  }
  info(message: string, meta?: Record<string, unknown>): void {
    if (this.threshold <= LEVELS.info) {
      // eslint-disable-next-line no-console
      console.info(this.format('info', message, meta));
    }
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.threshold <= LEVELS.warn) {
      // eslint-disable-next-line no-console
      console.warn(this.format('warn', message, meta));
    }
  }
  error(message: string, meta?: Record<string, unknown>): void {
    if (this.threshold <= LEVELS.error) {
      // eslint-disable-next-line no-console
      console.error(this.format('error', message, meta));
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    return new PrefixedLogger(this, bindings);
  }

  private format(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const stamp = new Date().toISOString();
    const tail = meta && Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${stamp}] [${level}] ${message}${tail}`;
  }
}

/** Wraps a parent logger and prefixes messages with fixed bindings. */
class PrefixedLogger implements Logger {
  constructor(
    private readonly parent: Logger,
    private readonly bindings: Record<string, unknown>
  ) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    this.parent.debug(message, { ...this.bindings, ...meta });
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.parent.info(message, { ...this.bindings, ...meta });
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.parent.warn(message, { ...this.bindings, ...meta });
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.parent.error(message, { ...this.bindings, ...meta });
  }
  child(bindings: Record<string, unknown>): Logger {
    return new PrefixedLogger(this, { ...this.bindings, ...bindings });
  }
}

/** A no-op logger that discards everything. Useful for benchmarks/tests. */
export class SilentLogger implements Logger {
  debug(): void {
    /* no-op */
  }
  info(): void {
    /* no-op */
  }
  warn(): void {
    /* no-op */
  }
  error(): void {
    /* no-op */
  }
  child(): Logger {
    return this;
  }
}

/** Convenience default — used by the engine when no logger is injected. */
export function createDefaultLogger(): Logger {
  return new ConsoleLogger();
}
