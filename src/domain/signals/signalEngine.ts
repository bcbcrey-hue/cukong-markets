import type { SignalCandidate } from '../../core/types';
import { PairUniverse } from '../market/pairUniverse';
import type { MarketSnapshotBundle } from '../market/marketWatcher';
import { calculateScore } from './scoreCalculator';

export class SignalEngine {
  constructor(private readonly universe: PairUniverse) {}

  score(bundle: MarketSnapshotBundle): SignalCandidate {
    const calculated = calculateScore(bundle.ticker, bundle.orderbook);
    this.universe.updateScore(bundle.pair, calculated.breakdown.total, calculated.breakdown.total >= 75 ? bundle.ticker.capturedAt : null);

    return {
      pair: bundle.pair,
      score: calculated.breakdown.total,
      breakdown: calculated.breakdown,
      strategies: calculated.strategies,
      ticker: bundle.ticker,
      orderbook: bundle.orderbook,
      createdAt: bundle.ticker.capturedAt,
    };
  }

  scoreMany(bundles: MarketSnapshotBundle\[]): SignalCandidate\[] {
    return bundles.map((item) => this.score(item)).sort((a, b) => b.score - a.score);
  }
}
