import assert from 'node:assert/strict';

import { buildRuntimeEntryCandidates, selectRuntimeEntryCandidate } from '../src/app';
import type { FutureTrendingPrediction, OpportunityAssessment, StoredAccount } from '../src/core/types';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function prediction(overrides: Partial<FutureTrendingPrediction>): FutureTrendingPrediction {
  return {
    target: 'TREND_DIRECTIONAL_MOVE',
    horizonLabel: 'H5_15M',
    horizonMinutes: 15,
    direction: 'UP',
    expectedMovePct: 1,
    confidence: 0.76,
    strength: 'STRONG',
    calibrationTag: 'OUTCOME_AND_TRADE_TRUTH',
    reasons: ['probe'],
    caveats: [],
    tradeFlowSource: 'EXCHANGE_TRADE_FEED',
    tradeFlowQuality: 'TAPE',
    generatedAt: Date.now(),
    ...overrides,
  };
}

function opportunity(pair: string, pred: FutureTrendingPrediction, overrides: Partial<OpportunityAssessment> = {}): OpportunityAssessment {
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 85,
    finalScore: 86,
    confidence: 0.86,
    pumpProbability: 0.8,
    continuationProbability: 0.7,
    trapProbability: 0.12,
    spoofRisk: 0.08,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 74,
    quoteFlowAccelerationScore: 68,
    orderbookImbalance: 0.35,
    change1m: 0.8,
    change5m: 2.2,
    entryTiming: { state: 'READY', quality: 79, reason: 'probe', leadScore: 70 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: [],
    historicalMatchSummary: 'probe',
    referencePrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadPct: 0.1,
    liquidityScore: 80,
    prediction: pred,
    timestamp: Date.now(),
    ...overrides,
  };
}

async function main() {
  const settings = createDefaultSettings();
  settings.tradingMode = 'FULL_AUTO';
  settings.strategy.minScoreToAlert = 1;
  settings.strategy.minScoreToBuy = 1;
  settings.strategy.minConfidence = 0.4;
  settings.strategy.minPumpProbability = 0;
  settings.strategy.spoofRiskBlockThreshold = 1;
  settings.strategy.useAntiSpoof = false;
  settings.risk.maxOpenPositions = 10;
  settings.risk.maxPairSpreadPct = 5;

  const riskEngine = new RiskEngine();
  const account: StoredAccount = {
    id: 'acc1',
    name: 'probe',
    apiKey: 'k',
    apiSecret: 's',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
  };

  const strong = opportunity('strong_idr', prediction({ strength: 'STRONG', direction: 'UP' }));
  const weak = opportunity('weak_idr', prediction({ strength: 'WEAK', confidence: 0.4, calibrationTag: 'PROXY_FALLBACK' }));
  const blocked = opportunity('blocked_idr', prediction({ strength: 'STRONG', direction: 'UP' }));

  const runtimeCandidates = buildRuntimeEntryCandidates(
    [strong, weak, blocked],
    settings,
    riskEngine,
    account,
    [],
    { blocked_idr: Date.now() + settings.risk.cooldownMs + 5_000 },
  );

  const strongCandidate = runtimeCandidates.find((item) => item.pair === 'strong_idr');
  const weakCandidate = runtimeCandidates.find((item) => item.pair === 'weak_idr');
  const blockedCandidate = runtimeCandidates.find((item) => item.pair === 'blocked_idr');

  assert.notEqual(strongCandidate?.policyDecision.action, 'WAIT', 'prediction kuat tidak boleh diperlakukan setara prediction lemah');
  assert.notEqual(weakCandidate?.policyDecision.action, 'ENTER', 'prediction lemah tidak boleh diperlakukan setara strong');
  assert.equal(blockedCandidate?.policyDecision.action, 'SKIP', 'risk block tetap hard stop di runtime flow');

  const selected = selectRuntimeEntryCandidate(runtimeCandidates);
  if (selected) {
    assert.equal(selected.pair, 'strong_idr', 'jika ada kandidat ENTER, runtime selector harus mengikuti policy final');
  }

  console.log('runtime_prediction_policy_wiring_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
