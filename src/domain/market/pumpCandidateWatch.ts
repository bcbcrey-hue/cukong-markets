import type { MarketOverview, SignalCandidate } from '../../core/types';
import { classifyPair } from './pairClassifier';

export class PumpCandidateWatch {
  buildMarketOverview(signals: SignalCandidate[]): MarketOverview {
    const sortedByLiquidity = [...signals].sort((a, b) => b.liquidityScore - a.liquidityScore);
    const sortedByRotation = [...signals].sort(
      (a, b) => Math.abs(b.change5m) - Math.abs(a.change5m),
    );

    return {
      timestamp: Date.now(),
      breadth: {
        totalPairs: signals.length,
        gainers1m: signals.filter((item) => item.change1m > 0).length,
        losers1m: signals.filter((item) => item.change1m < 0).length,
        gainers5m: signals.filter((item) => item.change5m > 0).length,
        losers5m: signals.filter((item) => item.change5m < 0).length,
      },
      liquidLeaders: sortedByLiquidity.slice(0, 5),
      rotationLeaders: sortedByRotation.slice(0, 5),
      watchlist: [...signals].sort((a, b) => b.score - a.score).slice(0, 8),
    };
  }

  buildCandidateFeed(
    signals: SignalCandidate[],
    limit: number,
    majorPairMaxShare: number,
  ): SignalCandidate[] {
    const sorted = [...signals].sort((a, b) => b.score - a.score);
    const majorLimit = Math.max(1, Math.floor(Math.max(0, Math.min(1, majorPairMaxShare)) * limit));
    const selected: SignalCandidate[] = [];
    const deferredMajors: SignalCandidate[] = [];
    let majorCount = 0;

    for (const item of sorted) {
      if (selected.length >= limit) {
        break;
      }

      const isMajor = classifyPair(item.pair).pairClass === 'MAJOR';
      if (!isMajor) {
        selected.push(item);
        continue;
      }

      if (majorCount < majorLimit) {
        selected.push(item);
        majorCount += 1;
      } else {
        deferredMajors.push(item);
      }
    }

    for (const item of deferredMajors) {
      if (selected.length >= limit) {
        break;
      }
      selected.push(item);
    }

    return selected;
  }
}
