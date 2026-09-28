/**
 * SlotExtractor contract — decoupled from recognizers. An extractor
 * returns `null` on no-match / failure and a `Slots` object on success.
 * The engine is responsible for merging and validating the values.
 */
import type {
  IntentContext,
  IntentDefinition,
  Slots,
} from '../types.js';

export interface SlotExtractor {
  readonly name: string;
  /** Lower numbers run first; later non-null slots overwrite earlier ones. */
  readonly priority: number;
  enabled: boolean;
  init?(): Promise<void>;
  dispose?(): Promise<void>;
  extract(
    input: string,
    context: IntentContext,
    intent: IntentDefinition
  ): Promise<Slots | null>;
}
