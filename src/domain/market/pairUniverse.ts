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
    const items: PairMetricSnapshot[] = [];

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
      items.push(snapshot);
    }

    this.pairs = items.map((item) => item.pair);

    return items;
  }

  top(limit = 50): string[] {
    return this.pairs.slice(0, limit);
  }

  get(pair: string): PairMetricSnapshot | undefined {
    return this.latest.get(pair);
  }

  exportMetrics(history: Record<string, unknown>) {
    return {
      pairs: this.pairs,
      latest: Object.fromEntries(this.latest.entries()),
      history,
    };
  }
}
