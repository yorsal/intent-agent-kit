/**
 * Tiny fluent DSL for intent definitions. Strictly optional — most users
 * will just construct `IntentDefinition` objects directly. The DSL
 * mainly helps with readability when defining many intents in one file.
 */
import type { IntentDefinition, SlotDefinition } from '../types.js';

export interface IntentBuilder {
  description(text: string): IntentBuilder;
  example(...examples: string[]): IntentBuilder;
  pattern(...patterns: RegExp[]): IntentBuilder;
  keyword(...keywords: string[]): IntentBuilder;
  slot(def: SlotDefinition): IntentBuilder;
  slots(defs: SlotDefinition[]): IntentBuilder;
  action(action: string): IntentBuilder;
  metadata(meta: Record<string, unknown>): IntentBuilder;
  build(): IntentDefinition;
}

export function defineIntent(label: string): IntentBuilder {
  const state: IntentDefinition = {
    label,
    examples: [],
    patterns: [],
    keywords: [],
    slots: [],
    metadata: {},
  };
  const builder: IntentBuilder = {
    description(text) {
      state.description = text;
      return builder;
    },
    example(...examples) {
      state.examples.push(...examples);
      return builder;
    },
    pattern(...patterns) {
      state.patterns.push(...patterns);
      return builder;
    },
    keyword(...keywords) {
      state.keywords.push(...keywords);
      return builder;
    },
    slot(def) {
      state.slots.push(def);
      return builder;
    },
    slots(defs) {
      state.slots.push(...defs);
      return builder;
    },
    action(action) {
      state.action = action;
      return builder;
    },
    metadata(meta) {
      state.metadata = { ...state.metadata, ...meta };
      return builder;
    },
    build() {
      return { ...state, examples: [...state.examples], patterns: [...state.patterns] };
    },
  };
  return builder;
}
