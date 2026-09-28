/**
 * Error hierarchy for intent-agent-kit. Every error carries a stable
 * `code`, a developer-facing `message`, an optional `cause`, and the
 * engine `traceId` when available so logs can be correlated.
 */

/** Stable error codes — keep in sync with README error table. */
export type ErrorCode =
  | 'INTENT_AGENT_KIT_ERROR'
  | 'CONFIG_ERROR'
  | 'RECOGNIZER_ERROR'
  | 'SLOT_EXTRACTOR_ERROR'
  | 'FUSION_ERROR'
  | 'ROUTER_ERROR'
  | 'TIMEOUT_ERROR'
  | 'REGISTRY_ERROR';

/**
 * Base class. Library consumers should `instanceof IntentAgentKitError`
 * to distinguish our errors from anything thrown by user code or third
 * party SDKs.
 */
export class IntentAgentKitError extends Error {
  public readonly code: ErrorCode;
  public override readonly cause?: unknown;
  public readonly traceId?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { cause?: unknown; traceId?: string }
  ) {
    super(message);
    this.name = 'IntentAgentKitError';
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
    if (options?.traceId !== undefined) this.traceId = options.traceId;
  }
}

/** Thrown when an intent/recognizer/extractor configuration is invalid. */
export class ConfigError extends IntentAgentKitError {
  constructor(message: string, options?: { cause?: unknown; traceId?: string }) {
    super('CONFIG_ERROR', message, options);
    this.name = 'ConfigError';
  }
}

/** Wrapped recognizer failure. The engine catches the original and re-emits this. */
export class RecognizerError extends IntentAgentKitError {
  public readonly recognizerName: string;

  constructor(
    recognizerName: string,
    message: string,
    options?: { cause?: unknown; traceId?: string }
  ) {
    super('RECOGNIZER_ERROR', `[${recognizerName}] ${message}`, options);
    this.name = 'RecognizerError';
    this.recognizerName = recognizerName;
  }
}

/** Wrapped slot-extractor failure. */
export class SlotExtractorError extends IntentAgentKitError {
  public readonly extractorName: string;

  constructor(
    extractorName: string,
    message: string,
    options?: { cause?: unknown; traceId?: string }
  ) {
    super('SLOT_EXTRACTOR_ERROR', `[${extractorName}] ${message}`, options);
    this.name = 'SlotExtractorError';
    this.extractorName = extractorName;
  }
}

/** Fusion strategy failure. */
export class FusionError extends IntentAgentKitError {
  constructor(message: string, options?: { cause?: unknown; traceId?: string }) {
    super('FUSION_ERROR', message, options);
    this.name = 'FusionError';
  }
}

/** Router failure. */
export class RouterError extends IntentAgentKitError {
  constructor(message: string, options?: { cause?: unknown; traceId?: string }) {
    super('ROUTER_ERROR', message, options);
    this.name = 'RouterError';
  }
}

/** Raised when an async stage exceeds the configured timeout. */
export class TimeoutError extends IntentAgentKitError {
  public readonly stage: string;
  public readonly timeoutMs: number;

  constructor(
    stage: string,
    timeoutMs: number,
    options?: { cause?: unknown; traceId?: string }
  ) {
    super(
      'TIMEOUT_ERROR',
      `Stage "${stage}" exceeded ${timeoutMs}ms`,
      options
    );
    this.name = 'TimeoutError';
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

/** Registry-level failures (duplicate label, missing intent, etc). */
export class RegistryError extends IntentAgentKitError {
  constructor(message: string, options?: { cause?: unknown; traceId?: string }) {
    super('REGISTRY_ERROR', message, options);
    this.name = 'RegistryError';
  }
}
