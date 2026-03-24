import { env } from '../../config/env';
import type {
  HotlistEntry,
  OpportunityAssessment,
  SignalCandidate,
} from '../../core/types';

export class HotlistService {
  private items: HotlistEntry[] = [];

  update(input: Array<SignalCandidate | OpportunityAssessment>): HotlistEntry[] {
    this.items = [...input]
      .sort((a, b) => this.getScore(b) - this.getScore(a))
      .slice(0, env.hotlistLimit)
      .map((item, index) => this.toHotlistEntry(item, index + 1));

    return this.items;
  }

  list(): HotlistEntry[] {
    return [...this.items];
  }

  top(): HotlistEntry | undefined {
    return this.items[0];
  }

  get(pair: string): HotlistEntry | undefined {
    return this.items.find((item) => item.pair === pair);
  }

  private getScore(item: SignalCandidate | OpportunityAssessment): number {
    return 'finalScore' in item ? item.finalScore : item.score;
  }

  private toHotlistEntry(
    item: SignalCandidate | OpportunityAssessment,
    rank: number,
  ): HotlistEntry {
    if ('finalScore' in item) {
      return {
        pair: item.pair,
        rank,
        score: item.finalScore,
        confidence: item.confidence,
        reasons: item.reasons,
        warnings: item.warnings,
        regime: item.marketRegime,
        breakoutPressure: item.breakoutPressure,
        volumeAcceleration: item.volumeAcceleration,
        orderbookImbalance: item.orderbookImbalance,
        spreadPct: item.spreadPct,
        marketPrice: item.referencePrice,
        bestBid: item.bestBid,
        bestAsk: item.bestAsk,
        liquidityScore: item.liquidityScore,
        change1m: item.change1m,
        change5m: item.change5m,
        contributions: item.featureBreakdown,
        edgeValid: item.edgeValid,
        recommendedAction: item.recommendedAction,
        timestamp: item.timestamp,
      };
    }

    return {
      ...item,
      rank,
    };
  }
}
