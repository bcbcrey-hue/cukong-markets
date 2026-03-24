import { env } from '../../config/env';
import type {
  HotlistEntry,
  OpportunityAssessment,
} from '../../core/types';

export class HotlistService {
  private items: HotlistEntry[] = [];

  update(input: OpportunityAssessment[]): HotlistEntry[] {
    this.items = [...input]
      .sort((a, b) => b.finalScore - a.finalScore)
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

  private toHotlistEntry(item: OpportunityAssessment, rank: number): HotlistEntry {
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
      spreadBps: item.spreadBps,
      bidDepthTop10: item.bidDepthTop10,
      askDepthTop10: item.askDepthTop10,
      depthScore: item.depthScore,
      orderbookTimestamp: item.orderbookTimestamp,
      liquidityScore: item.liquidityScore,
      change1m: item.change1m,
      change5m: item.change5m,
      contributions: item.featureBreakdown,
      timestamp: item.timestamp,
      recommendedAction: item.recommendedAction,
      edgeValid: item.edgeValid,
      entryTiming: item.entryTiming,
      pumpProbability: item.pumpProbability,
      trapProbability: item.trapProbability,
      historicalMatchSummary: item.historicalMatchSummary,
    };
  }
}
