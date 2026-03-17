import type { MarketRegime, MarketSnapshot, SignalCandidate } from '../../core/types';
import { avg } from '../../utils/math';

export class RegimeClassifier {
  classify(input: {
    snapshots: MarketSnapshot[];
    signals: SignalCandidate[];
  }): MarketRegime {
    const recentSignals = input.signals.slice(-5);
    const recentSnapshots = input.snapshots.slice(-5);

    const avgScore = avg(recentSignals.map((item) => item.score));
    const avgSpread = avg(recentSignals.map((item) => item.spreadPct));
    const avgChange1m = avg(recentSignals.map((item) => item.change1m));
    const avgChange5m = avg(recentSignals.map((item) => item.change5m));
    const tradeDensity = avg(recentSnapshots.map((item) => item.recentTrades.length));

    if (avgSpread > 1.25) {
      return 'TRAP_RISK';
    }

    if (avgScore >= 78 && avgChange5m >= 2.5) {
      return 'EXPANSION';
    }

    if (avgScore >= 65 && avgChange1m >= 0 && avgChange5m <= 2.2 && tradeDensity >= 2) {
      return 'ACCUMULATION';
    }

    if (avgScore >= 70 && avgChange5m >= 1.2) {
      return 'BREAKOUT_SETUP';
    }

    if (avgChange5m >= 5) {
      return 'EXHAUSTION';
    }

    if (avgScore <= 40 && avgChange1m < 0) {
      return 'DISTRIBUTION';
    }

    return 'QUIET';
  }
}