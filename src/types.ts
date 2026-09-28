/**
 * Core Zod schemas and inferred TypeScript types for intent-agent-kit.
 *
 * Everything that crosses a public boundary (recognizer input/output,
 * engine result, intent definition) is declared here so that downstream
 * consumers get both runtime validation and compile-time guarantees.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A user-defined intent label. The library never hard-codes business intents. */
export type IntentLabel = string;

/** Slot value union: scalar or array of strings. */
export const SlotValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
export type SlotValue = z.infer<typeof SlotValueSchema>;

/** Map of slot name -> value. */
export const SlotsSchema = z.record(SlotValueSchema);
export type Slots = z.infer<typeof SlotsSchema>;

/** Supported slot value types. */
export const SlotTypeSchema = z.enum([
  'string',
  'number',
  'boolean',
  'date',
  'enum',
  'string[]',
]);
export type SlotType = z.infer<typeof SlotTypeSchema>;

// ---------------------------------------------------------------------------
// Intent & slot definitions
// ---------------------------------------------------------------------------

/**
 * Declarative description of a slot. The engine uses this both for
 * extraction prompts (LLM) and for post-extraction validation/defaulting.
 */
export const SlotDefinitionSchema = z.object({
  /** Slot identifier, e.g. `from`, `to`, `time`. */
  name: z.string(),
  /** Type used for validation and downstream consumption. */
  type: SlotTypeSchema,
  /** Whether the slot must be present before the action can execute. */
  required: z.boolean().default(false),
  /** Human-readable description; consumed by LLM extractors. */
  description: z.string().optional(),
  /** Allowed values when `type === "enum"`. */
  enumValues: z.array(z.string()).optional(),
  /** Default value applied when the slot is missing. */
  defaultValue: SlotValueSchema.optional(),
  /** Regex for `RegexSlotExtractor`; capture group `0` unless `group` is set. */
  pattern: z.instanceof(RegExp).optional(),
  /** Capture group index for `pattern`, defaults to 0. */
  group: z.number().int().nonnegative().optional(),
  /** Optional transform applied to the captured string (e.g. "tomorrow" -> ISO date). */
  transform: z
    .object({
      kind: z.enum(['toDate', 'toNumber', 'trim', 'lowercase', 'uppercase']),
      /** Optional timezone offset for `toDate`, e.g. `+08:00`. */
      tzOffset: z.string().optional(),
    })
    .optional(),
  /** Question to ask the user when this slot is missing. */
  prompt: z.string().optional(),
});
export type SlotDefinition = z.infer<typeof SlotDefinitionSchema>;

/** A complete intent definition (label + examples + slot contract + action). */
export const IntentDefinitionSchema = z.object({
  /** Unique intent label. */
  label: z.string(),
  /** Human-readable description; consumed by LLM recognizers. */
  description: z.string().optional(),
  /** Example utterances used by vector/rule recognizers. */
  examples: z.array(z.string()).default([]),
  /** Regex patterns used by `RuleRecognizer`. */
  patterns: z.array(z.instanceof(RegExp)).default([]),
  /** Keywords used by `RuleRecognizer`. */
  keywords: z.array(z.string()).default([]),
  /** Slot contract — the parameters this intent needs. */
  slots: z.array(SlotDefinitionSchema).default([]),
  /** Downstream Agent action identifier, e.g. `tool:create_order`. */
  action: z.string().optional(),
  /** Free-form metadata for downstream consumers. */
  metadata: z.record(z.unknown()).default({}),
});
export type IntentDefinition = z.infer<typeof IntentDefinitionSchema>;

// ---------------------------------------------------------------------------
// Recognizer / fusion output
// ---------------------------------------------------------------------------

/** Output of a single recognizer. */
export const RecognizerOutputSchema = z.object({
  /** Predicted intent label. */
  intent: z.string(),
  /** Confidence in [0, 1]. */
  confidence: z.number().min(0).max(1),
  /** Optional slots already extracted by the recognizer (advisory). */
  slots: SlotsSchema.default({}),
  /** Source recognizer name (debugging + fusion weights). */
  source: z.string(),
  /** Ranked alternatives (excluding top-1). */
  alternatives: z
    .array(
      z.object({
        intent: z.string(),
        confidence: z.number().min(0).max(1),
      })
    )
    .default([]),
  /** Raw recognizer payload for debugging. */
  raw: z.unknown().optional(),
});
export type RecognizerOutput = z.infer<typeof RecognizerOutputSchema>;

/** Fusion output — single best intent plus provenance. */
export const FusedIntentSchema = RecognizerOutputSchema.extend({
  /** Per-recognizer contributions used to compute the final confidence. */
  contributions: z
    .array(
      z.object({
        source: z.string(),
        intent: z.string(),
        confidence: z.number(),
        weight: z.number(),
      })
    )
    .default([]),
});
export type FusedIntent = z.infer<typeof FusedIntentSchema>;

// ---------------------------------------------------------------------------
// Routing & final result
// ---------------------------------------------------------------------------

/** Routing decision emitted by a Router. */
export const RoutedActionSchema = z.enum([
  'execute',
  'clarify',
  'fallback',
  'transfer_human',
]);
export type RoutedAction = z.infer<typeof RoutedActionSchema>;

/** Final engine output. */
export const IntentResultSchema = FusedIntentSchema.extend({
  action: RoutedActionSchema,
  /** Resolved Agent action identifier (from the intent definition). */
  resolvedAction: z.string().optional(),
  /** Names of required slots that are still missing. */
  missingSlots: z.array(z.string()).default([]),
  /** Slot fill rate in [0, 1] across required slots. */
  slotFillRate: z.number().min(0).max(1).default(0),
  /** Suggested clarification message for the user/Agent. */
  clarificationPrompt: z.string().optional(),
  /** Total engine latency in milliseconds. */
  latencyMs: z.number(),
  /** Trace identifier correlating logs and hook events. */
  traceId: z.string(),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

// ---------------------------------------------------------------------------
// Conversation context
// ---------------------------------------------------------------------------

/** Single chat turn used for history-aware extraction. */
export const HistoryTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type HistoryTurn = z.infer<typeof HistoryTurnSchema>;

/**
 * Free-form per-call context. Only what the engine actually reads is typed
 * here; consumers may attach arbitrary metadata.
 */
export interface IntentContext {
  userId?: string;
  sessionId?: string;
  history?: HistoryTurn[];
  /** Slots inherited from a previous turn (used by ContextSlotExtractor). */
  inheritedSlots?: Slots;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Type-safe schema -> type inference helpers for downstream code. */
export type InferSlots<S extends z.ZodTypeAny> = z.infer<S>;
export type InferIntentResult<S extends z.ZodTypeAny> = z.infer<S>;
