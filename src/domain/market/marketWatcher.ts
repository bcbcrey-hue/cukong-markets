import { env } from '../../config/env';
import { logger } from '../../core/logger';
import type {
  DiscoverySettings,
  MarketSnapshot,
  OrderbookSnapshot,
  PairTickerSnapshot,
  TradePrint,
} from '../../core/types';
import type { IndodaxClient } from '../../integrations/indodax/client';
import type { IndodaxOrderbook } from '../../integrations/indodax/publicApi';
import { DiscoveryEngine } from './discoveryEngine';
import type { PairUniverse } from './pairUniverse';

interface TickerPoint {
  price: number;
  volumeQuote: number;
  capturedAt: number;
}

export class MarketWatcher {
  private history = new Map<string, TickerPoint[]>();
  private inferredTrades = new Map<string, TradePrint[]>();
  private readonly discoveryEngine = new DiscoveryEngine();

  constructor(
    private readonly indodax: IndodaxClient,
    private readonly universe: PairUniverse,
    private readonly getDiscoverySettings: () => DiscoverySettings,
  ) {}

  private updateHistory(snapshot: PairTickerSnapshot): TickerPoint | undefined {
    const current = this.history.get(snapshot.pair) ?? [];
    const previous = current.at(-1);

    current.push({
      price: snapshot.lastPrice,
      volumeQuote: snapshot.volume24hQuote,
      capturedAt: snapshot.timestamp,
    });

    while (current.length > env.scannerHistoryLimit) {
      current.shift();
    }

    this.history.set(snapshot.pair, current);
    return previous;
  }

  private percentChange(current: number, previous?: number): number {
    if (!previous || previous <= 0) {
      return 0;
    }

    return ((current - previous) / previous) * 100;
  }

  private getPriceBefore(pair: string, thresholdMs: number): number | undefined {
    const points = this.history.get(pair) ?? [];

    for (let index = points.length - 1; index >= 0; index -= 1) {
      if ((points[index]?.capturedAt ?? 0) <= thresholdMs) {
        return points[index]?.price;
      }
    }

    return points[0]?.price;
  }

  private inferTradePrints(
    ticker: PairTickerSnapshot,
    previous?: TickerPoint,
  ): TradePrint[] {
    const existing = this.inferredTrades.get(ticker.pair) ?? [];

    if (!previous) {
      this.inferredTrades.set(ticker.pair, existing);
      return existing;
    }

    const deltaVolume = Math.max(0, ticker.volume24hQuote - previous.volumeQuote);
    if (deltaVolume <= 0 || ticker.lastPrice <= 0) {
      this.inferredTrades.set(ticker.pair, existing);
      return existing;
    }

    const inferred: TradePrint = {
      pair: ticker.pair,
      price: ticker.lastPrice,
      quantity: deltaVolume / ticker.lastPrice,
      side:
        ticker.lastPrice > previous.price
          ? 'buy'
          : ticker.lastPrice < previous.price
            ? 'sell'
            : 'unknown',
      timestamp: ticker.timestamp,
    };

    const next = [...existing, inferred].slice(-40);
    this.inferredTrades.set(ticker.pair, next);
    return next;
  }

  private buildOrderbookSnapshot(
    pair: string,
    orderbook: IndodaxOrderbook,
    timestamp: number,
  ): OrderbookSnapshot {
    const bids = orderbook.buy.map(([price, volume]) => ({ price, volume }));
    const asks = orderbook.sell.map(([price, volume]) => ({ price, volume }));
    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const spread = Math.max(0, bestAsk - bestBid);
    const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;

    return {
      pair,
      bids,
      asks,
      bestBid,
      bestAsk,
      spread,
      spreadPct: bestAsk > 0 ? (spread / bestAsk) * 100 : 0,
      midPrice,
      timestamp,
    };
  }

  async batchSnapshot(limit = 10): Promise<MarketSnapshot[]> {
    const tickers = await this.indodax.getTickers();
    const metrics = this.universe.updateFromTickers(tickers);
    const discovery = await this.discoveryEngine.select({
      metrics,
      settings: this.getDiscoverySettings(),
      limit,
      getPreviousPoint: (pair) => this.history.get(pair)?.at(-1),
      getDepth: (pair) => this.indodax.getDepth(pair),
    });

    const snapshots: MarketSnapshot[] = [];

    for (const target of discovery.selected) {
      const item = this.universe.get(target.pair);
      if (!item) {
        continue;
      }

      try {
        const orderbook = discovery.depthByPair.get(item.pair) ?? await this.indodax.getDepth(item.pair);
        const timestamp = Date.now();
        const ticker: PairTickerSnapshot = {
          pair: item.pair,
          lastPrice: item.lastPrice,
          bid: item.bestBid,
          ask: item.bestAsk,
          high24h: item.high24h,
          low24h: item.low24h,
          volume24hBase: item.volumeBtc,
          volume24hQuote: item.volumeIdr,
          change24hPct: 0,
          timestamp,
        };
        const previous = this.updateHistory(ticker);
        const recentTrades = this.inferTradePrints(ticker, previous);
        const snapshotOrderbook = this.buildOrderbookSnapshot(item.pair, orderbook, timestamp);

        ticker.change24hPct = this.percentChange(
          ticker.lastPrice,
          ticker.low24h || ticker.lastPrice,
        );

        snapshots.push({
          pair: item.pair,
          ticker: {
            ...ticker,
            change24hPct: this.percentChange(
              ticker.lastPrice,
              ticker.low24h || ticker.lastPrice,
            ),
          },
          orderbook: snapshotOrderbook,
          recentTrades,
          timestamp,
        });
      } catch (error) {
        logger.warn({ pair: item.pair, error }, 'failed to build market snapshot');
      }
    }

    return snapshots;
  }

  exportHistory(): Record<string, Array<{ price: number; volumeQuote: number; capturedAt: number }>> {
    return Object.fromEntries(this.history.entries());
  }
}
