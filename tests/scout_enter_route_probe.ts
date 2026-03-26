import assert from 'node:assert/strict';

import { OpportunityEngine } from '../src/domain/intelligence/opportunityEngine';
import type { HistoricalContext, MarketSnapshot, SignalCandidate } from '../src/core/types';

function makeSignal(pair: string): SignalCandidate {
  const now = Date.now();
  return {
    pair,
    score: 78,
    confidence: 0.84,
    reasons: ['probe'],
    warnings: [],
    regime: 'BREAKOUT_SETUP',
    breakoutPressure: 7.4,
    quoteFlowAccelerationScore: 33,
    orderbookImbalance: 0.16,
    spreadPct: 0.34,
    marketPrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadBps: 34,
    bidDepthTop10: 240,
    askDepthTop10: 180,
    depthScore: 80,
    orderbookTimestamp: now,
    liquidityScore: 72,
    change1m: 0.82,
    change5m: 2.5,
    contributions: [],
    timestamp: now,
  };
}

function makeSnapshot(pair: string): MarketSnapshot {
  const now = Date.now();
  return {
    pair,
    ticker: {
      pair,
      lastPrice: 100,
      bid: 99.8,
      ask: 100,
      high24h: 108,
      low24h: 90,
      volume24hBase: 1_200,
      volume24hQuote: 320_000_000,
      change24hPct: 1.3,
      timestamp: now,
    },
    orderbook: {
      pair,
      bids: [{ price: 99.8, volume: 240 }],
      asks: [{ price: 100, volume: 180 }],
      bestBid: 99.8,
      bestAsk: 100,
      spread: 0.2,
      spreadPct: 0.2,
      midPrice: 99.9,
      timestamp: now,
    },
    recentTrades: [],
    recentTradesSource: 'NONE',
    timestamp: now,
  };
}

async function main() {
  const pair = 'probe_idr';
  const context: HistoricalContext = {
    pair,
    snapshotCount: 20,
    anomalyCount: 0,
    recentWinRate: 0.7,
    recentFalseBreakRate: 0.1,
    regime: 'BREAKOUT_SETUP',
    patternMatches: [],
    contextNotes: [],
    timestamp: Date.now(),
  };

  const history = {
    getRecentSnapshots: () => [],
    buildContext: async () => context,
    recordAnomaly: async () => undefined,
  };

  const featurePipeline = {
    build: () => ({
      pair,
      accumulationScore: 65,
      spoofRiskScore: 20,
      icebergScore: 0,
      clusterScore: 34,
      aggressionBias: 0,
      sweepScore: 0,
      breakoutPressureScore: 70,
      quoteFlowAccelerationScore: 33,
      liquidityQualityScore: 75,
      spreadScore: 80,
      exhaustionRiskScore: 34,
      timestamp: Date.now(),
      evidence: ['probe'],
      tradeFlowSource: 'NONE' as const,
      tradeFlowQuality: 'PROXY' as const,
    }),
  };

  const probabilityEngine = {
    assess: () => ({
      pumpProbability: 0.7,
      continuationProbability: 0.63,
      trapProbability: 0.16,
      confidence: 0.83,
    }),
  };

  const entryTimingEngine = {
    assess: () => ({
      state: 'SCOUT_WINDOW' as const,
      quality: 84,
      reason: 'scout',
      leadScore: 77,
      entryStyle: 'SCOUT' as const,
    }),
  };

  const edgeValidator = {
    validate: () => ({
      valid: true,
      reasons: [],
      warnings: [],
      blockedBySpoof: false,
      blockedBySpread: false,
      blockedByLiquidity: false,
      blockedByTiming: false,
    }),
  };

  const scoreExplainer = {
    build: () => ({
      reasons: ['ok'],
      warnings: [],
      featureBreakdown: [],
      riskContext: ['ok'],
      historicalMatchSummary: 'ok',
    }),
  };

  const engine = new OpportunityEngine(
    history as never,
    featurePipeline as never,
    probabilityEngine as never,
    edgeValidator as never,
    scoreExplainer as never,
    entryTimingEngine as never,
  );

  const result = await engine.assess(makeSnapshot(pair), makeSignal(pair));

  assert.equal(result.recommendedAction, 'SCOUT_ENTER', 'SCOUT_ENTER harus muncul pada setup scout sehat');
  assert.equal(result.entryTiming.state, 'SCOUT_WINDOW', 'timing baru harus dipakai di route scout');
  assert.equal(result.entryStyle, 'SCOUT', 'entryStyle harus menandai lane scout');

  console.log('scout_enter_route_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
