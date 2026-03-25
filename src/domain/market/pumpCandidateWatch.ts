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
    const finalLimit = Math.max(0, Math.floor(limit));
    if (finalLimit === 0) {
      return [];
    }

    const sorted = [...signals].sort((a, b) => b.score - a.score);
    const clampedShare = Math.max(0, Math.min(1, majorPairMaxShare));
    const majorLimit = Math.floor(clampedShare * finalLimit);

    const majors = sorted.filter((item) => classifyPair(item.pair).pairClass === 'MAJOR');
    const nonMajors = sorted.filter((item) => classifyPair(item.pair).pairClass !== 'MAJOR');

    const selectedNonMajors = nonMajors.slice(0, finalLimit);
    const remainingSlots = Math.max(0, finalLimit - selectedNonMajors.length);
    const allowedMajorSlots = Math.max(0, Math.min(remainingSlots, majorLimit));
    const selectedMajors = majors.slice(0, allowedMajorSlots);

    return [...selectedNonMajors, ...selectedMajors].sort((a, b) => b.score - a.score);
  }
}
