import type { SignalCandidate } from '../../core/types';
import { OrderbookSnapshotBuilder } from '../market/orderbookSnapshot';
import { classifyPair } from '../market/pairClassifier';
import type { PairUniverse } from '../market/pairUniverse';
import { TickerSnapshotStore } from '../market/tickerSnapshot';
import { calculateScore } from './scoreCalculator';

export interface MarketSnapshotBundle {
  pair: string;
  ticker: {
    pair: string;
    lastPrice: number;
    bid: number;
    ask: number;
    high24h: number;
    low24h: number;
    volume24hBase: number;
    volume24hQuote: number;
    change24hPct: number;
    timestamp: number;
  };
  orderbook: {
    pair: string;
    bids: Array<{ price: number; volume: number }>;
    asks: Array<{ price: number; volume: number }>;
    bestBid: number;
    bestAsk: number;
    spread: number;
    spreadPct: number;
    midPrice: number;
    timestamp: number;
  };
}

export class SignalEngine {
  private readonly tickerSnapshots = new TickerSnapshotStore();
  private readonly orderbookSnapshots = new OrderbookSnapshotBuilder();

  constructor(private readonly _universe: PairUniverse) {}

  score(bundle: MarketSnapshotBundle): SignalCandidate {
    const classification = classifyPair(bundle.pair);
    const tickerFeatures = this.tickerSnapshots.buildFeatures(bundle.ticker);
    const orderbookFeatures = this.orderbookSnapshots.build(bundle.orderbook);

    const scored = calculateScore({
      classification,
      ticker: tickerFeatures,
      orderbook: orderbookFeatures,
    });

    return {
      pair: bundle.pair,
      score: scored.total,
      confidence: scored.confidence,
      reasons: scored.reasons,
      warnings: scored.warnings,
      regime: scored.regime,
      breakoutPressure: scored.breakoutPressure,
      volumeAcceleration: scored.volumeAcceleration,
      orderbookImbalance: scored.orderbookImbalance,
      spreadPct: scored.spreadPct,
      timestamp: bundle.ticker.timestamp,
    };
  }

  scoreMany(bundles: MarketSnapshotBundle[]): SignalCandidate[] {
    return bundles.map((item) => this.score(item)).sort((a, b) => b.score - a.score);
  }
}
