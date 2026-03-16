import { DEFAULT\_TOP\_PAIRS } from '../../config/defaults';
import type { PairMetrics, PairTier, TickerSnapshot } from '../../core/types';
import { classifyTier, tierIntervalMs } from './pairClassifier';

interface PairUniverseEntry {
  pair: string;
  tier: PairTier;
  hotness: number;
  lastScore: number;
  pollIntervalMs: number;
  lastPolledAt: string | null;
  lastSignalAt: string | null;
}

export class PairUniverse {
  private readonly entries = new Map<string, PairUniverseEntry>();

  constructor(seedPairs: string\[] = DEFAULT\_TOP\_PAIRS) {
    for (const pair of seedPairs) {
      const tier = classifyTier(pair);
      this.entries.set(pair, {
        pair,
        tier,
        hotness: 0,
        lastScore: 0,
        pollIntervalMs: tierIntervalMs(tier),
        lastPolledAt: null,
        lastSignalAt: null,
      });
    }
  }

  listAll(): string\[] {
    return Array.from(this.entries.keys());
  }

  listByTier(tier: PairTier): string\[] {
    return Array.from(this.entries.values())
      .filter((item) => item.tier === tier)
      .sort((a, b) => b.hotness - a.hotness)
      .map((item) => item.pair);
  }

  getTier(pair: string): PairTier {
    return this.entries.get(pair)?.tier ?? classifyTier(pair);
  }

  markPolled(pair: string, polledAt: string): void {
    const entry = this.entries.get(pair);
    if (!entry) return;
    entry.lastPolledAt = polledAt;
  }

  updateFromSnapshot(pair: string, snapshot: TickerSnapshot, score?: number): void {
    const entry = this.entries.get(pair) ?? {
      pair,
      tier: classifyTier(pair, snapshot),
      hotness: 0,
      lastScore: 0,
      pollIntervalMs: tierIntervalMs(classifyTier(pair, snapshot)),
      lastPolledAt: null,
      lastSignalAt: null,
    };

    const calculatedHotness = Math.max(
      0,
      Math.min(
        100,
        snapshot.tradeBurstScore \* 0.25 +
          Math.abs(snapshot.change1m) \* 10 +
          Math.abs(snapshot.change5m) \* 5 +
          Math.max(0, 30 - snapshot.spreadPct \* 20) +
          (score ?? 0) \* 0.35,
      ),
    );

    const nextTier = calculatedHotness >= 80 ? 'HOT' : classifyTier(pair, snapshot);

    this.entries.set(pair, {
      ...entry,
      tier: nextTier,
      hotness: calculatedHotness,
      lastScore: score ?? entry.lastScore,
      pollIntervalMs: tierIntervalMs(nextTier),
      lastPolledAt: snapshot.capturedAt,
      lastSignalAt: score \&\& score >= 75 ? snapshot.capturedAt : entry.lastSignalAt,
    });
  }

  updateScore(pair: string, score: number, signalAt: string | null): void {
    const entry = this.entries.get(pair);
    if (!entry) return;
    entry.lastScore = score;
    entry.hotness = Math.max(entry.hotness, Math.min(100, score));
    if (signalAt) {
      entry.lastSignalAt = signalAt;
    }
    if (score >= 85) {
      entry.tier = 'HOT';
      entry.pollIntervalMs = tierIntervalMs('HOT');
    }
  }

  exportMetrics(historyByPair: Map<string, TickerSnapshot\[]>): PairMetrics\[] {
    return Array.from(this.entries.values()).map((entry) => ({
      pair: entry.pair,
      tier: entry.tier,
      hotness: entry.hotness,
      lastScore: entry.lastScore,
      lastSignalAt: entry.lastSignalAt,
      lastPolledAt: entry.lastPolledAt,
      pollIntervalMs: entry.pollIntervalMs,
      snapshots: historyByPair.get(entry.pair) ?? \[],
    }));
  }
}
