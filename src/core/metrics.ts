export interface RuntimeMetricSnapshot {
  counters: Record<string, number>;
  gauges: Record<string, number>;
  timestamps: Record<string, string>;
}

export class MetricsRegistry {
  private readonly counters: Record<string, number> = {};
  private readonly gauges: Record<string, number> = {};
  private readonly timestamps: Record<string, string> = {};

  increment(name: string, by = 1): void {
    this.counters[name] = (this.counters[name] ?? 0) + by;
    this.timestamps[name] = new Date().toISOString();
  }

  setGauge(name: string, value: number): void {
    this.gauges[name] = value;
    this.timestamps[name] = new Date().toISOString();
  }

  snapshot(): RuntimeMetricSnapshot {
    return {
      counters: { ...this.counters },
      gauges: { ...this.gauges },
      timestamps: { ...this.timestamps },
    };
  }
}
