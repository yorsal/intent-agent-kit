/**
 * IntentRegistry — central catalog of `IntentDefinition`s. The engine
 * accepts either an array of intents or a registry; the registry is
 * preferable when intents are added/removed dynamically.
 */
import { RegistryError } from '../errors.js';
import { IntentDefinitionSchema, type IntentDefinition } from '../types.js';

export class IntentRegistry {
  private readonly intents = new Map<string, IntentDefinition>();

  register(def: IntentDefinition): void {
    const parsed = IntentDefinitionSchema.parse(def);
    if (this.intents.has(parsed.label)) {
      throw new RegistryError(`Intent "${parsed.label}" is already registered`);
    }
    this.intents.set(parsed.label, parsed);
  }

  registerMany(defs: IntentDefinition[]): void {
    for (const def of defs) this.register(def);
  }

  unregister(label: string): boolean {
    return this.intents.delete(label);
  }

  get(label: string): IntentDefinition | undefined {
    return this.intents.get(label);
  }

  has(label: string): boolean {
    return this.intents.has(label);
  }

  getAll(): IntentDefinition[] {
    return Array.from(this.intents.values());
  }

  size(): number {
    return this.intents.size;
  }

  clear(): void {
    this.intents.clear();
  }

  /** Load intents from a plain JSON-ish structure. Patterns are serialized as strings. */
  loadFromJSON(json: unknown): void {
    if (!Array.isArray(json)) {
      throw new RegistryError('IntentRegistry.loadFromJSON expects an array');
    }
    for (const raw of json) {
      if (typeof raw !== 'object' || raw === null) {
        throw new RegistryError('Each intent must be an object');
      }
      const obj = raw as Record<string, unknown>;
      const patterns = Array.isArray(obj.patterns)
        ? (obj.patterns as unknown[]).map((p) => new RegExp(String(p)))
        : [];
      const slots = Array.isArray(obj.slots)
        ? (obj.slots as Array<Record<string, unknown>>).map((slot) => ({
            ...slot,
            pattern:
              typeof slot.pattern === 'string' ? new RegExp(slot.pattern) : undefined,
          }))
        : [];
      this.register({ ...obj, patterns, slots } as IntentDefinition);
    }
  }

  toJSON(): unknown {
    return Array.from(this.intents.values()).map((def) => ({
      ...def,
      patterns: def.patterns.map((p) => p.source),
      slots: def.slots.map((slot) => ({
        ...slot,
        pattern: slot.pattern ? slot.pattern.source : undefined,
      })),
    }));
  }
}
