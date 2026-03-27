import { logger } from '../../core/logger';
import type {
  DiscoveryObservabilitySummary,
  DiscoverySettings,
  MarketSnapshot,
  PairTickerSnapshot,
  TradePrint,
} from '../../core/types';
import type { IndodaxClient } from '../../integrations/indodax/client';
import type { PairUniverse } from './pairUniverse';
import { classifyPair } from './pairClassifier';
import { DiscoveryEngine } from './discoveryEngine';

interface TickerPoint {
  price: number;
  volumeQuote: number;
}

interface TradeFlowResolution {
  recentTrades: TradePrint[];
  recentTradesSource: MarketSnapshot['recentTradesSource'];
}

export class MarketWatcher {
  private inferredTrades = new Map<string, TradePrint[]>();
  private lastTickerByPair = new Map<string, TickerPoint>();
  private lastDiscoverySummary: DiscoveryObservabilitySummary | null = null;
  private readonly discoveryEngine: DiscoveryEngine;

  constructor(
    private readonly indodax: IndodaxClient,
    private readonly universe: PairUniverse,
    private readonly getDiscoverySettings: () => DiscoverySettings,
  ) {
    this.discoveryEngine = new DiscoveryEngine(this.universe);
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
      source: 'INFERRED_SNAPSHOT_DELTA',
      quality: 'PROXY',
      inferenceBasis: 'volume24hQuote_delta_and_price_direction',
    };

    const next = [...existing, inferred].slice(-40);
    this.inferredTrades.set(ticker.pair, next);
    return next;
  }

  private toTruthTradePrints(
    pair: string,
    trades: Awaited<ReturnType<IndodaxClient['getRecentTrades']>>,
  ): TradePrint[] {
    if (!trades) {
      return [];
    }

    return trades
      .slice(0, 40)
      .map((trade) => ({
        pair,
        price: trade.price,
        quantity: trade.amount,
        side: trade.type,
        timestamp: trade.date * 1000,
        source: 'EXCHANGE_TRADE_FEED' as const,
        quality: 'TAPE' as const,
      }))
      .filter((trade) => trade.price > 0 && trade.quantity > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private async fetchRecentTrades(pair: string): Promise<Awaited<ReturnType<IndodaxClient['getRecentTrades']>>> {
    const client = this.indodax as IndodaxClient & {
      getRecentTrades?: (candidatePair: string) => Promise<Awaited<ReturnType<IndodaxClient['getRecentTrades']>>>;
    };

    if (typeof client.getRecentTrades !== 'function') {
      return null;
    }

    return client.getRecentTrades(pair);
  }

  private resolveTradeFlow(
    inferredTrades: TradePrint[],
    truthTrades: TradePrint[],
  ): TradeFlowResolution {
    if (truthTrades.length > 0 && inferredTrades.length > 0 && truthTrades.length < 3) {
      return {
        recentTrades: [...truthTrades, ...inferredTrades].slice(-40),
        recentTradesSource: 'MIXED',
      };
    }

    if (truthTrades.length > 0) {
      return {
        recentTrades: truthTrades,
        recentTradesSource: 'EXCHANGE_TRADE_FEED',
      };
    }

    if (inferredTrades.length > 0) {
      return {
        recentTrades: inferredTrades,
        recentTradesSource: 'INFERRED_PROXY',
      };
    }

    return {
      recentTrades: [],
      recentTradesSource: 'NONE',
    };
  }

  async batchSnapshot(limit = 10): Promise<MarketSnapshot[]> {
    const tickers = await this.indodax.getTickers();
    this.universe.updateFromTickers(tickers);

    const discovery = await this.discoveryEngine.discover(
      Math.max(0, limit),
      async (pair) => this.indodax.getDepth(pair),
      this.getDiscoverySettings(),
    );
    this.lastDiscoverySummary = discovery.summary;

    const snapshots: MarketSnapshot[] = [];

    for (const selected of discovery.selected) {
      try {
        const timestamp = Date.now();
        const raw = selected.snapshot;
        const ticker: PairTickerSnapshot = {
          pair: raw.pair,
          lastPrice: raw.lastPrice,
          bid: raw.bestBid,
          ask: raw.bestAsk,
          high24h: raw.high24h,
          low24h: raw.low24h,
          volume24hBase: raw.volumeBtc,
          volume24hQuote: raw.volumeIdr,
          change24hPct: raw.low24h > 0 ? ((raw.lastPrice - raw.low24h) / raw.low24h) * 100 : 0,
          timestamp,
        };

        const previous = this.lastTickerByPair.get(ticker.pair);
        this.lastTickerByPair.set(ticker.pair, {
          price: ticker.lastPrice,
          volumeQuote: ticker.volume24hQuote,
        });

        const inferredTrades = this.inferTradePrints(ticker, previous);
        const truthTrades = this.toTruthTradePrints(
          selected.pair,
          await this.fetchRecentTrades(selected.pair),
        );
        const tradeFlow = this.resolveTradeFlow(inferredTrades, truthTrades);

        snapshots.push({
          pair: selected.pair,
          discoveryBucket: selected.bucket,
          pairClass: classifyPair(selected.pair).pairClass,
          ticker,
          orderbook: discovery.orderbookByPair.get(selected.pair) ?? null,
          recentTrades: tradeFlow.recentTrades,
          recentTradesSource: tradeFlow.recentTradesSource,
          timestamp,
        });
      } catch (error) {
        logger.warn({ pair: selected.pair, error }, 'failed to build market snapshot');
      }
    }

    return snapshots;
  }

  exportHistory(): Record<string, Array<{ price: number; volumeQuote: number }>> {
    return Object.fromEntries(
      [...this.lastTickerByPair.entries()].map(([pair, point]) => [pair, [point]]),
    );
  }

  getLastDiscoverySummary(): DiscoveryObservabilitySummary | null {
    return this.lastDiscoverySummary;
  }
}
