/**
 * Vector recognizer — embeds each intent's `examples`, embeds the user
 * input, then picks the highest cosine-similarity intent.
 *
 * The embedding backend is pluggable (`EmbeddingBackend`); the recognizer
 * itself does not depend on any specific model library. Examples are
 * pre-computed and cached in memory at `init()` time.
 */
import type {
  IntentContext,
  IntentDefinition,
  RecognizerOutput,
} from '../types.js';
import type { Recognizer } from './base.js';

export interface EmbeddingBackend {
  readonly name: string;
  /** Total dimensionality of emitted vectors; used for sanity checks. */
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
  init?(): Promise<void>;
  dispose?(): Promise<void>;
}

export interface VectorRecognizerOptions {
  name?: string;
  priority?: number;
  backend: EmbeddingBackend;
  /** Top-K examples to retain per intent; default 5. */
  topK?: number;
  /** Min cosine similarity to emit a result; default 0.30. */
  minSimilarity?: number;
}

interface IntentEmbeddings {
  intent: IntentDefinition;
  examples: string[];
  vectors: number[][];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class VectorRecognizer implements Recognizer {
  public readonly name: string;
  public readonly priority: number;
  public enabled = true;
  public readonly shortCircuitable = false;

  private readonly backend: EmbeddingBackend;
  private readonly topK: number;
  private readonly minSimilarity: number;
  private cache: IntentEmbeddings[] = [];
  private initialized = false;

  constructor(options: VectorRecognizerOptions) {
    if (!options.backend) {
      throw new Error('VectorRecognizer requires an EmbeddingBackend');
    }
    this.name = options.name ?? 'vector';
    this.priority = options.priority ?? 20;
    this.backend = options.backend;
    this.topK = options.topK ?? 5;
    this.minSimilarity = options.minSimilarity ?? 0.3;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.backend.init) await this.backend.init();
    this.initialized = true;
  }

  async dispose(): Promise<void> {
    if (this.backend.dispose) await this.backend.dispose();
    this.cache = [];
    this.initialized = false;
  }

  /** (Re)build the example-embedding cache. Call after registering intents. */
  async warmup(intents: IntentDefinition[]): Promise<void> {
    const next: IntentEmbeddings[] = [];
    for (const intent of intents) {
      if (intent.examples.length === 0) continue;
      const examples = intent.examples.slice(0, this.topK);
      const vectors =
        this.backend.embedBatch !== undefined
          ? await this.backend.embedBatch(examples)
          : await Promise.all(examples.map((ex) => this.backend.embed(ex)));
      next.push({ intent, examples, vectors });
    }
    this.cache = next;
  }

  async recognize(
    input: string,
    _context: IntentContext,
    intents: IntentDefinition[]
  ): Promise<RecognizerOutput | null> {
    if (!this.initialized) await this.init();
    if (this.cache.length === 0) await this.warmup(intents);
    if (this.cache.length === 0) return null;

    const query = await this.backend.embed(input);

    type Scored = { label: string; score: number; conf: number };
    const perIntent: Scored[] = [];
    for (const entry of this.cache) {
      let best = 0;
      for (const vec of entry.vectors) {
        const s = cosineSimilarity(query, vec);
        if (s > best) best = s;
      }
      // Map cosine [-1, 1] to [0, 1] with a soft floor.
      const conf = Math.max(0, (best + 1) / 2);
      perIntent.push({ label: entry.intent.label, score: best, conf });
    }

    perIntent.sort((a, b) => b.score - a.score);
    const top = perIntent[0];
    if (!top || top.score < this.minSimilarity) return null;

    const alternatives = perIntent.slice(1, 4).map((p) => ({
      intent: p.label,
      confidence: p.conf,
    }));

    return {
      intent: top.label,
      confidence: top.conf,
      slots: {},
      source: this.name,
      alternatives,
      raw: { score: top.score },
    };
  }
}
