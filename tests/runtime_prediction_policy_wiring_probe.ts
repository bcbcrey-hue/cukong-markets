import assert from 'node:assert/strict';

import { buildRuntimeEntryCandidates, selectRuntimeEntryCandidate } from '../src/app';
import type { FutureTrendingPrediction, OpportunityAssessment, StoredAccount } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { ReportService } from '../src/services/reportService';
import { createDefaultHealth, createDefaultSettings } from '../src/services/persistenceService';

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
    recommendedAction: 'SCOUT_ENTER',
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
    new PortfolioCapitalEngine(),
    account,
    [],
    [strong, weak, blocked],
    { blocked_idr: Date.now() + settings.risk.cooldownMs + 5_000 },
  );

  const strongCandidate = runtimeCandidates.find((item) => item.pair === 'strong_idr');
  const weakCandidate = runtimeCandidates.find((item) => item.pair === 'weak_idr');
  const blockedCandidate = runtimeCandidates.find((item) => item.pair === 'blocked_idr');

  assert.equal(strongCandidate?.policyDecision.action, 'ENTER', 'lane SCOUT runtime sehat tetap ENTER');
  assert.equal(weakCandidate?.policyDecision.action, 'ENTER', 'prediction lemah tidak menggantikan policy menjadi hard skip');
  assert.ok(
    (strongCandidate?.policyDecision.sizeMultiplier ?? 0) > (weakCandidate?.policyDecision.sizeMultiplier ?? 0),
    'prediction kuat vs lemah harus memberi sizing berbeda di runtime flow nyata',
  );
  assert.equal(
    weakCandidate?.policyDecision.aggressiveness,
    'LOW',
    'prediction lemah wajib menurunkan aggressiveness pada lane runtime nyata',
  );
  assert.equal(blockedCandidate?.policyDecision.action, 'SKIP', 'risk block tetap hard stop di runtime flow');

  const selected = selectRuntimeEntryCandidate(runtimeCandidates);
  if (selected) {
    assert.equal(selected.pair, 'strong_idr', 'jika ada kandidat ENTER, runtime selector harus mengikuti policy final');
  }

  const report = new ReportService();
  const status = report.statusText({
    health: createDefaultHealth(),
    activeAccounts: 1,
    runtimePolicyDecision: {
      pair: strong.pair,
      action: strongCandidate?.policyDecision.action ?? 'WAIT',
      reasons: strongCandidate?.policyDecision.reasons ?? [],
      entryLane: strongCandidate?.policyDecision.entryLane ?? 'SCOUT',
      sizeMultiplier: strongCandidate?.policyDecision.sizeMultiplier ?? 0,
      aggressiveness: strongCandidate?.policyDecision.aggressiveness ?? 'LOW',
      riskAllowed: strongCandidate?.riskCheckResult.allowed ?? false,
      riskReasons: strongCandidate?.riskCheckResult.reasons ?? [],
      predictionContext: strong.prediction
        ? {
          target: strong.prediction.target,
          horizonLabel: strong.prediction.horizonLabel,
          strength: strong.prediction.strength,
          confidence: strong.prediction.confidence,
          calibrationTag: strong.prediction.calibrationTag,
          direction: strong.prediction.direction,
        }
        : undefined,
      updatedAt: new Date().toISOString(),
    },
  });
  assert.ok(
    status.includes('runtimePolicyPrediction target=TREND_DIRECTIONAL_MOVE'),
    'status operator-facing harus menampilkan prediction context runtime',
  );

  console.log('runtime_prediction_policy_wiring_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
