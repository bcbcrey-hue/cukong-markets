import type { MarketSnapshot, SignalCandidate } from '../../core/types';
import { OrderbookSnapshotBuilder } from '../market/orderbookSnapshot';
import { classifyPair } from '../market/pairClassifier';
import type { PairUniverse } from '../market/pairUniverse';
import { TickerSnapshotStore } from '../market/tickerSnapshot';
import { calculateScore } from './scoreCalculator';

export class SignalEngine {
  private readonly tickerSnapshots = new TickerSnapshotStore();
  private readonly orderbookSnapshots = new OrderbookSnapshotBuilder();

  constructor(private readonly _universe: PairUniverse) {}

  score(bundle: MarketSnapshot): SignalCandidate {
    const classification = classifyPair(bundle.pair);
    const tickerFeatures = this.tickerSnapshots.buildFeatures(bundle.ticker);
    const orderbookFeatures = this.orderbookSnapshots.build(
      bundle.orderbook ?? {
        pair: bundle.pair,
        bids: [],
        asks: [],
        bestBid: bundle.ticker.bid,
        bestAsk: bundle.ticker.ask,
        spread: Math.max(0, bundle.ticker.ask - bundle.ticker.bid),
        spreadPct:
          bundle.ticker.ask > 0
            ? ((bundle.ticker.ask - bundle.ticker.bid) / bundle.ticker.ask) * 100
            : 0,
        midPrice:
          bundle.ticker.ask > 0 && bundle.ticker.bid > 0
            ? (bundle.ticker.ask + bundle.ticker.bid) / 2
            : bundle.ticker.lastPrice,
        timestamp: bundle.timestamp,
      },
    );

    const scored = calculateScore({
      classification,
      ticker: tickerFeatures,
      orderbook: orderbookFeatures,
    });

    return {
      pair: bundle.pair,
      discoveryBucket: bundle.discoveryBucket,
      pairClass: bundle.pairClass ?? classification.pairClass,
      score: scored.total,
      confidence: scored.confidence,
      reasons: scored.reasons,
      warnings: scored.warnings,
      regime: scored.regime,
      breakoutPressure: scored.breakoutPressure,
      quoteFlowAccelerationScore: scored.quoteFlowAccelerationScore,
      orderbookImbalance: scored.orderbookImbalance,
      spreadPct: scored.spreadPct,
      marketPrice: bundle.ticker.lastPrice,
      bestBid: bundle.ticker.bid,
      bestAsk: bundle.ticker.ask,
      spreadBps: orderbookFeatures.spreadBps,
      bidDepthTop10: orderbookFeatures.bidDepthTop10,
      askDepthTop10: orderbookFeatures.askDepthTop10,
      depthScore: orderbookFeatures.depthScore,
      orderbookTimestamp: orderbookFeatures.current.timestamp,
      liquidityScore: orderbookFeatures.depthScore,
      change1m: tickerFeatures.change1m,
      change5m: tickerFeatures.change5m,
      contributions: scored.contributions,
      timestamp: bundle.ticker.timestamp,
    };
  }

  scoreMany(bundles: MarketSnapshot[]): SignalCandidate[] {
    return bundles.map((item) => this.score(item)).sort((a, b) => b.score - a.score);
  }
}
