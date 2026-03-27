import assert from 'node:assert/strict';

import type { OpportunityAssessment, PositionRecord } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function opp(): OpportunityAssessment {
  return {
    pair: 'micro_new_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 88,
    finalScore: 90,
    confidence: 0.88,
    pumpProbability: 0.8,
    continuationProbability: 0.7,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 12,
    quoteFlowAccelerationScore: 20,
    orderbookImbalance: 0.3,
    change1m: 0.9,
    change5m: 2.1,
    entryTiming: { state: 'READY', quality: 80, reason: 'ok', leadScore: 75 },
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
    liquidityScore: 80,
    depthScore: 40,
    timestamp: Date.now(),
  };
}

const settings = createDefaultSettings();
settings.portfolio.maxTotalDeployedCapitalIdr = 300_000;
settings.portfolio.maxExposurePerPairClassPct.MICRO = 0.2;

const open: PositionRecord = {
  id: 'p1', pair: 'micro_old_idr', accountId: 'a', status: 'OPEN', side: 'long', quantity: 1000, entryPrice: 60,
  averageEntryPrice: 60, averageExitPrice: null, currentPrice: 60, peakPrice: 60, unrealizedPnl: 0, realizedPnl: 0,
  totalEntryFeesPaid: 0, totalBoughtQuantity: 1000, totalSoldQuantity: 0, stopLossPrice: null, takeProfitPrice: null,
  entryStyle: 'CONFIRM', pumpState: 'ACTIVE', lastContinuationScore: 0, lastDumpRisk: 0, lastScaleOutAt: null,
  emergencyExitArmed: false, openedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), closedAt: null,
  exposurePairClass: 'MICRO',
  exposureDiscoveryBucket: 'ANOMALY',
  exposureSource: 'POSITION_METADATA',
};

const engine = new PortfolioCapitalEngine();
const planned = engine.plan({
  settings,
  opportunity: opp(),
  policyDecision: { action: 'ENTER', sizeMultiplier: 1 },
  openPositions: [open],
});

assert.equal(planned.capitalPlan.exposure.pairClass.key, 'MICRO');
assert.ok(planned.capitalPlan.allocatedNotionalIdr === 0, 'exposure class cap harus memblok saat full');
assert.equal(planned.capitalPlan.blocked, true);
console.log('portfolio_exposure_cap_probe: ok');
