import assert from 'node:assert/strict';

import type { OpportunityAssessment, PositionRecord } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function currentOpportunity(): OpportunityAssessment {
  return {
    pair: 'entry_new_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 90,
    finalScore: 92,
    confidence: 0.9,
    pumpProbability: 0.85,
    continuationProbability: 0.72,
    trapProbability: 0.1,
    spoofRisk: 0.08,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 24,
    quoteFlowAccelerationScore: 36,
    orderbookImbalance: 0.3,
    change1m: 0.9,
    change5m: 2.3,
    entryTiming: { state: 'READY', quality: 84, reason: 'ok', leadScore: 76 },
    reasons: ['ok'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: [],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.1,
    liquidityScore: 85,
    depthScore: 45,
    timestamp: Date.now(),
  };
}

const oldPosition: PositionRecord = {
  id: 'open-1',
  pair: 'legacy_micro_idr',
  accountId: 'acc',
  status: 'OPEN',
  side: 'long',
  quantity: 2_000,
  entryPrice: 30,
  averageEntryPrice: 30,
  averageExitPrice: null,
  currentPrice: 30,
  peakPrice: 30,
  unrealizedPnl: 0,
  realizedPnl: 0,
  totalEntryFeesPaid: 0,
  totalBoughtQuantity: 2_000,
  totalSoldQuantity: 0,
  stopLossPrice: null,
  takeProfitPrice: null,
  entryStyle: 'CONFIRM',
  pumpState: 'ACTIVE',
  lastContinuationScore: 0,
  lastDumpRisk: 0,
  lastScaleOutAt: null,
  emergencyExitArmed: false,
  exposurePairClass: 'MICRO',
  exposureDiscoveryBucket: 'ANOMALY',
  exposureSource: 'POSITION_METADATA',
  openedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  closedAt: null,
};

const settings = createDefaultSettings();
settings.portfolio.maxTotalDeployedCapitalIdr = 200_000;
settings.portfolio.maxExposurePerPairClassPct.MICRO = 0.3;

const engine = new PortfolioCapitalEngine();
const plan = engine.plan({
  settings,
  opportunity: currentOpportunity(),
  policyDecision: { action: 'ENTER', sizeMultiplier: 1 },
  openPositions: [oldPosition],
});

assert.equal(plan.capitalPlan.exposure.pairClass.key, 'MICRO');
assert.ok(plan.capitalPlan.exposure.pairClass.usedNotionalIdr > 0, 'exposure harus baca dari metadata posisi, bukan current opportunities');
assert.equal(plan.capitalPlan.allocatedNotionalIdr, 0, 'entry harus diblok bila class exposure sudah penuh');
assert.ok(!plan.capitalPlan.reasons.some((reason) => reason.includes('fallback legacy')), 'metadata lengkap tidak boleh dicatat sebagai fallback legacy');

console.log('portfolio_exposure_truth_persistence_probe: ok');
