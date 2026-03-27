import assert from 'node:assert/strict';

import type { FutureTrendingPrediction, OpportunityAssessment } from '../src/core/types';
import { evaluateOpportunityPolicyV1 } from '../src/domain/decision/decisionPolicyEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function prediction(overrides: Partial<FutureTrendingPrediction>): FutureTrendingPrediction {
  return {
    target: 'TREND_DIRECTIONAL_MOVE',
    horizonLabel: 'H5_15M',
    horizonMinutes: 15,
    direction: 'UP',
    expectedMovePct: 1.2,
    confidence: 0.8,
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

function opportunity(pair: string, pred: FutureTrendingPrediction): OpportunityAssessment {
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 82,
    finalScore: 84,
    confidence: 0.82,
    pumpProbability: 0.76,
    continuationProbability: 0.66,
    trapProbability: 0.14,
    spoofRisk: 0.12,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 72,
    quoteFlowAccelerationScore: 64,
    orderbookImbalance: 0.32,
    change1m: 0.8,
    change5m: 2,
    entryTiming: { state: 'READY', quality: 78, reason: 'probe', leadScore: 68 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: [],
    historicalMatchSummary: 'probe',
    referencePrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadPct: 0.2,
    liquidityScore: 78,
    prediction: pred,
    timestamp: Date.now(),
  };
}

async function main() {
  const settings = createDefaultSettings();
  settings.tradingMode = 'FULL_AUTO';
  settings.strategy.minScoreToAlert = 40;
  settings.strategy.minScoreToBuy = 60;
  settings.strategy.minConfidence = 0.4;
  settings.strategy.minPumpProbability = 0.4;

  const strongDecision = evaluateOpportunityPolicyV1(
    opportunity('strong_pred_idr', prediction({ strength: 'STRONG', direction: 'UP', confidence: 0.82 })),
    settings,
  );
  const weakDecision = evaluateOpportunityPolicyV1(
    opportunity('weak_pred_idr', prediction({ strength: 'WEAK', confidence: 0.4, calibrationTag: 'PROXY_FALLBACK' })),
    settings,
  );

  assert.equal(strongDecision.action, 'ENTER');
  assert.equal(weakDecision.action, 'WAIT', 'prediction weak harus bisa menurunkan keputusan policy');

  const riskBlocked = evaluateOpportunityPolicyV1(
    opportunity('risk_blocked_pred_idr', prediction({ strength: 'STRONG', direction: 'UP' })),
    settings,
    {
      allowed: false,
      reasons: ['max positions reached'],
      warnings: [],
      entryLane: 'DEFAULT',
      baseAmountIdr: 1_000_000,
      adjustedAmountIdr: 0,
    },
  );

  assert.equal(riskBlocked.action, 'SKIP', 'risk block harus tetap hard stop meskipun prediction kuat');

  console.log('prediction_policy_input_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
