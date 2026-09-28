/**
 * Minimal metrics interface. The engine calls these as it processes each
 * request. Implementations may forward to Prometheus, OpenTelemetry, or
 * just an in-memory counter for tests.
 */
import type { RoutedAction } from '../types.js';

export interface MetricsRecorder {
  /** Increment a counter identified by (name, labels). */
  increment(name: string, labels?: Record<string, string>): void;
  /** Observe a histogram value. */
  observe(name: string, value: number, labels?: Record<string, string>): void;
}

export class InMemoryMetrics implements MetricsRecorder {
  public readonly counters = new Map<string, number>();
  public readonly observations: Array<{ name: string; value: number; labels?: Record<string, string> }> = [];

  increment(name: string, labels?: Record<string, string>): void {
    const key = labels ? `${name}|${JSON.stringify(labels)}` : name;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  observe(name: string, value: number, labels?: Record<string, string>): void {
    if (labels) {
      this.observations.push({ name, value, labels });
    } else {
      this.observations.push({ name, value });
    }
  }
}

/** Helper to record action distribution after a single recognition. */
export function recordActionMetric(
  metrics: MetricsRecorder | undefined,
  action: RoutedAction
): void {
  metrics?.increment('intent_agent_kit.recognize.action', { action });
}
