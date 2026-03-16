import type { OrderbookSnapshot, TickerSnapshot } from '../../core/types';
import { TtlCache } from '../../core/cache';
import { IndodaxClient } from '../../integrations/indodax/client';
import { buildTickerFromHistory } from '../../integrations/indodax/mapper';
import { nowIso } from '../../utils/time';
import { PairUniverse } from './pairUniverse';

export interface MarketSnapshotBundle {
  pair: string;
  ticker: TickerSnapshot;
  orderbook: OrderbookSnapshot | null;
}

export class MarketWatcher {
  private readonly tickerCache = new TtlCache<TickerSnapshot>(1\_500);
  private readonly orderbookCache = new TtlCache<OrderbookSnapshot>(1\_500);
  private readonly history = new Map<string, TickerSnapshot\[]>();
  private readonly maxHistory = 30;

  constructor(
    private readonly client: IndodaxClient,
    private readonly universe: PairUniverse,
  ) {}

  private pushHistory(pair: string, snapshot: TickerSnapshot): void {
    const previous = this.history.get(pair) ?? \[];
    this.history.set(pair, \[...previous, snapshot].slice(-this.maxHistory));
  }

  getHistory(pair: string): TickerSnapshot\[] {
    return this.history.get(pair) ?? \[];
  }

  exportHistory(): Map<string, TickerSnapshot\[]> {
    return this.history;
  }

  async snapshot(pair: string): Promise<MarketSnapshotBundle | null> {
    const cachedTicker = this.tickerCache.get(pair);
    const cachedOrderbook = this.orderbookCache.get(pair);
    if (cachedTicker) {
      return { pair, ticker: cachedTicker, orderbook: cachedOrderbook ?? null };
    }

    const rawTicker = await this.client.getTicker(pair);
    if (!rawTicker) {
      return null;
    }

    const orderbook = await this.client.getOrderbook(pair);
    const snapshot = buildTickerFromHistory(
      pair,
      {
        lastPrice: rawTicker.lastPrice,
        bestBid: rawTicker.bestBid,
        bestAsk: rawTicker.bestAsk,
        volume24h: rawTicker.quoteVolume24h,
        capturedAt: nowIso(),
      },
      this.getHistory(pair),
      orderbook,
    );

    this.pushHistory(pair, snapshot);
    this.tickerCache.set(pair, snapshot);
    if (orderbook) {
      this.orderbookCache.set(pair, orderbook);
    }

    this.universe.markPolled(pair, snapshot.capturedAt);
    this.universe.updateFromSnapshot(pair, snapshot);

    return { pair, ticker: snapshot, orderbook };
  }

  async batchSnapshot(limitPerTier = 4): Promise<MarketSnapshotBundle\[]> {
    const selectedPairs = \[
      ...this.universe.listByTier('HOT').slice(0, limitPerTier),
      ...this.universe.listByTier('A').slice(0, limitPerTier),
      ...this.universe.listByTier('B').slice(0, limitPerTier),
      ...this.universe.listByTier('C').slice(0, limitPerTier),
    ];

    const uniquePairs = Array.from(new Set(selectedPairs.length ? selectedPairs : this.universe.listAll().slice(0, 12)));
    const results = await Promise.all(uniquePairs.map((pair) => this.snapshot(pair)));
    return results.filter((item): item is MarketSnapshotBundle => Boolean(item));
  }
}
