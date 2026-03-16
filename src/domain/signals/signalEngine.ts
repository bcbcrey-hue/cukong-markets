import type { SignalCandidate } from '../../core/types';
import type { MarketSnapshot } from '../market/marketWatcher';
import type { PairUniverse } from '../market/pairUniverse';

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export class SignalEngine {
  constructor(private readonly _universe: PairUniverse) {}

  scoreMany(snapshots: MarketSnapshot[]): SignalCandidate[] {
    return snapshots
      .map((snapshot) => this.scoreOne(snapshot))
      .sort((a, b) => b.score - a.score);
  }

  scoreOne(snapshot: MarketSnapshot): SignalCandidate {
    const spreadPenalty = snapshot.ticker.spreadPct > 1 ? 20 : snapshot.ticker.spreadPct * 10;
    const liquidityBoost = snapshot.ticker.liquidityScore * 0.2;
    const momentumBoost = Math.max(0, snapshot.ticker.change1m) * 4 + Math.max(0, snapshot.ticker.change5m) * 2;
    const imbalanceBoost = Math.max(0, snapshot.orderbook.imbalanceTop5) * 25;
    const volumeBoost = Math.min(20, Math.log10(Math.max(1, snapshot.ticker.volumeIdr)) * 2);

    const score = clamp(
      20 + liquidityBoost + momentumBoost + imbalanceBoost + volumeBoost - spreadPenalty,
    );

    const confidence = clamp(
      (snapshot.ticker.liquidityScore * 0.35) +
        (Math.max(0, snapshot.orderbook.imbalanceTop5) * 30) +
        (Math.max(0, snapshot.ticker.change1m) * 2),
      0,
      100,
    ) / 100;

    const reasons: string[] = [];
    const warnings: string[] = [];

    if (snapshot.ticker.change1m > 0.4) {
      reasons.push('momentum 1m positif');
    }
    if (snapshot.ticker.change5m > 1) {
      reasons.push('momentum 5m menguat');
    }
    if (snapshot.orderbook.imbalanceTop5 > 0.2) {
      reasons.push('bid depth dominan');
    }
    if (snapshot.ticker.liquidityScore > 50) {
      reasons.push('likuiditas memadai');
    }
    if (snapshot.ticker.spreadPct > 0.8) {
      warnings.push('spread masih lebar');
    }
    if (snapshot.orderbook.askDepthTop5 > snapshot.orderbook.bidDepthTop5 * 1.5) {
      warnings.push('ask wall relatif berat');
    }

    return {
      pair: snapshot.pair,
      score,
      confidence,
      regime: score >= 70 ? 'momentum' : score >= 45 ? 'watch' : 'neutral',
      spreadPct: snapshot.ticker.spreadPct,
      reasons,
      warnings,
      observedAt: snapshot.observedAt,
    };
  }
}
