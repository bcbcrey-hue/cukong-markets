import type { DiscoveryCandidate } from '../../core/types';
import type { IndodaxTickerEntry } from '../../integrations/indodax/publicApi';

export interface PairMetricSnapshot {
  pair: string;
  lastPrice: number;
  bestBid: number;
  bestAsk: number;
  high24h: number;
  low24h: number;
  volumeIdr: number;
  volumeBtc: number;
  serverTime: number;
}

export class PairUniverse {
  private pairs: string[] = [];
  private latest = new Map<string, PairMetricSnapshot>();

  updateFromTickers(tickers: Record<string, IndodaxTickerEntry>): PairMetricSnapshot[] {
    const seen = new Set<string>();

    for (const [pair, ticker] of Object.entries(tickers)) {
      const snapshot: PairMetricSnapshot = {
        pair,
        lastPrice: ticker.last,
        bestBid: ticker.buy,
        bestAsk: ticker.sell,
        high24h: ticker.high,
        low24h: ticker.low,
        volumeIdr: ticker.vol_idr,
        volumeBtc: ticker.vol_btc,
        serverTime: ticker.server_time,
      };

      this.latest.set(pair, snapshot);
      seen.add(pair);
    }

    this.pairs = [...seen].sort((a, b) => a.localeCompare(b));
    return this.listSnapshots();
  }

  listPairs(limit?: number): string[] {
    const pairs = [...this.pairs];
    if (typeof limit === 'number') {
      return pairs.slice(0, Math.max(0, limit));
    }
    return pairs;
  }

  listSnapshots(limit?: number): PairMetricSnapshot[] {
    const snapshots = this.listPairs(limit)
      .map((pair) => this.latest.get(pair))
      .filter((item): item is PairMetricSnapshot => Boolean(item));
    return snapshots;
  }

  get(pair: string): PairMetricSnapshot | undefined {
    return this.latest.get(pair);
  }

  toDiscoveryCandidates(snapshotAt = Date.now()): DiscoveryCandidate[] {
    return this.listSnapshots().map((item) => ({
      pair: item.pair,
      bucket: 'LIQUID_LEADER',
      volumeIdr: item.volumeIdr,
      spreadPct: item.bestAsk > 0 ? ((item.bestAsk - item.bestBid) / item.bestAsk) * 100 : 0,
      depthScore: 0,
      majorPair: item.pair.startsWith('btc_') || item.pair.startsWith('eth_'),
      tags: [],
      snapshotAt,
    }));
  }

  exportMetrics(history: Record<string, unknown>) {
    return {
      pairs: this.listPairs(),
      latest: Object.fromEntries(this.latest.entries()),
      history,
    };
  }
}
