import assert from 'node:assert/strict';

import { buildRuntimeEntryCandidates } from '../src/app';
import type {
  FutureTrendingPrediction,
  HistoricalContext,
  MarketSnapshot,
  MicrostructureFeatures,
  OpportunityAssessment,
  SignalCandidate,
  StoredAccount,
} from '../src/core/types';
import { OpportunityEngine } from '../src/domain/intelligence/opportunityEngine';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function makePrediction(input: { pair: string; strength: FutureTrendingPrediction['strength'] }): FutureTrendingPrediction {
  return {
    target: 'TREND_DIRECTIONAL_MOVE',
    horizonLabel: 'H5_15M',
    horizonMinutes: 15,
    direction: 'UP',
    expectedMovePct: 1.2,
    confidence: input.strength === 'STRONG' ? 0.82 : 0.41,
    strength: input.strength,
    calibrationTag: input.strength === 'STRONG' ? 'OUTCOME_AND_TRADE_TRUTH' : 'PROXY_FALLBACK',
    reasons: ['probe'],
    caveats: [],
    tradeFlowSource: input.strength === 'STRONG' ? 'EXCHANGE_TRADE_FEED' : 'INFERRED_PROXY',
    tradeFlowQuality: input.strength === 'STRONG' ? 'TAPE' : 'PROXY',
    generatedAt: Date.now(),
  };
}

function makeSnapshot(pair: string): MarketSnapshot {
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    ticker: {
      pair,
      lastPrice: 100,
      bid: 99.8,
      ask: 100,
      high24h: 120,
      low24h: 80,
      volume24hBase: 1_000,
      volume24hQuote: 800_000_000,
      change24hPct: 1.2,
      timestamp: Date.now(),
    },
    orderbook: null,
    recentTrades: [],
    recentTradesSource: 'EXCHANGE_TRADE_FEED',
    timestamp: Date.now(),
  };
}

function makeSignal(pair: string): SignalCandidate {
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    score: 84,
    confidence: 0.82,
    reasons: ['probe'],
    warnings: [],
    regime: 'EXPANSION',
    breakoutPressure: 7,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.4,
    spreadPct: 0.2,
    marketPrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadBps: 20,
    bidDepthTop10: 120_000,
    askDepthTop10: 100_000,
    depthScore: 78,
    orderbookTimestamp: Date.now(),
    liquidityScore: 79,
    change1m: 0.7,
    change5m: 2,
    contributions: [],
    timestamp: Date.now(),
  };
}

async function main() {
  const history = {
    getRecentSnapshots: () => [],
    buildContext: async (pair: string): Promise<HistoricalContext> => ({
      pair,
      snapshotCount: 12,
      anomalyCount: 0,
      recentWinRate: 0.6,
      recentFalseBreakRate: 0.2,
      outcomeGrounding: 'OUTCOME_GROUNDED',
      outcomeSampleSize: 6,
      regime: 'EXPANSION',
      patternMatches: [],
      contextNotes: ['probe'],
      timestamp: Date.now(),
    }),
    recordAnomaly: async () => undefined,
  };

  const featurePipeline = {
    build: (_snapshot: MarketSnapshot, signal: SignalCandidate): MicrostructureFeatures => ({
      pair: signal.pair,
      accumulationScore: 70,
      spoofRiskScore: 18,
      icebergScore: 22,
      clusterScore: 64,
      aggressionBias: 0.3,
      sweepScore: 42,
      breakoutPressureScore: 68,
      quoteFlowAccelerationScore: 30,
      liquidityQualityScore: 80,
      spreadScore: 74,
      exhaustionRiskScore: 20,
      timestamp: Date.now(),
      evidence: ['probe'],
      tradeFlowSource: 'EXCHANGE_TRADE_FEED',
      tradeFlowQuality: 'TAPE',
    }),
  };

  const probabilityEngine = {
    assess: () => ({
      pumpProbability: 0.75,
      continuationProbability: 0.65,
      trapProbability: 0.12,
      confidence: 0.82,
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
      reasons: ['probe'],
      warnings: [],
      featureBreakdown: [],
      riskContext: [],
      historicalMatchSummary: 'probe',
    }),
  };

  const entryTimingEngine = {
    assess: () => ({
      state: 'SCOUT_WINDOW' as const,
      quality: 80,
      reason: 'probe',
      leadScore: 72,
      entryStyle: 'SCOUT' as const,
    }),
  };

  const predictionEngine = {
    predict: ({ signal }: { signal: SignalCandidate }) =>
      makePrediction({
        pair: signal.pair,
        strength: signal.pair === 'strong_runtime_idr' ? 'STRONG' : 'WEAK',
      }),
  };

  const opportunityEngine = new OpportunityEngine(
    history as never,
    featurePipeline as never,
    probabilityEngine as never,
    edgeValidator as never,
    scoreExplainer as never,
    entryTimingEngine as never,
    undefined,
    predictionEngine as never,
  );

  const strongOpportunity: OpportunityAssessment = await opportunityEngine.assess(
    makeSnapshot('strong_runtime_idr'),
    makeSignal('strong_runtime_idr'),
  );
  const weakOpportunity: OpportunityAssessment = await opportunityEngine.assess(
    makeSnapshot('weak_runtime_idr'),
    makeSignal('weak_runtime_idr'),
  );

  assert.equal(strongOpportunity.recommendedAction, 'SCOUT_ENTER', 'probe harus memakai lane runtime nyata dari OpportunityEngine');
  assert.equal(weakOpportunity.recommendedAction, 'SCOUT_ENTER', 'probe harus memakai lane runtime nyata dari OpportunityEngine');

  const settings = createDefaultSettings();
  settings.tradingMode = 'FULL_AUTO';
  settings.strategy.minScoreToAlert = 1;
  settings.strategy.minScoreToBuy = 1;
  settings.strategy.minConfidence = 0.4;
  settings.strategy.minPumpProbability = 0;
  settings.strategy.spoofRiskBlockThreshold = 1;
  settings.risk.maxOpenPositions = 10;
  settings.risk.maxPairSpreadPct = 5;

  const account: StoredAccount = {
    id: 'acc-runtime',
    name: 'runtime-probe',
    apiKey: 'k',
    apiSecret: 's',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
  };

  const runtimeCandidates = buildRuntimeEntryCandidates(
    [strongOpportunity, weakOpportunity],
    settings,
    new RiskEngine(),
    new PortfolioCapitalEngine(),
    account,
    [],
    [strongOpportunity, weakOpportunity],
    {},
  );

  const strongCandidate = runtimeCandidates.find((item) => item.pair === 'strong_runtime_idr');
  const weakCandidate = runtimeCandidates.find((item) => item.pair === 'weak_runtime_idr');

  assert.equal(strongCandidate?.policyDecision.action, 'ENTER');
  assert.equal(weakCandidate?.policyDecision.action, 'ENTER');
  assert.ok(
    (strongCandidate?.policyDecision.sizeMultiplier ?? 0) > (weakCandidate?.policyDecision.sizeMultiplier ?? 0),
    'pada runtime lane nyata, prediction kuat vs lemah harus memberi sizing berbeda',
  );
  assert.equal(weakCandidate?.policyDecision.aggressiveness, 'LOW');

  console.log('runtime_prediction_reachable_lane_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
