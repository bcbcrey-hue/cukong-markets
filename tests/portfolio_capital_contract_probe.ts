import assert from 'node:assert/strict';

import type { OpportunityAssessment } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function opportunity(): OpportunityAssessment {
  return {
    pair: 'contract_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
    rawScore: 80,
    finalScore: 82,
    confidence: 0.85,
    pumpProbability: 0.8,
    continuationProbability: 0.7,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 20,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    change1m: 0.7,
    change5m: 1.2,
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
    liquidityScore: 85,
    depthScore: 40,
    timestamp: Date.now(),
  };
}

const settings = createDefaultSettings();
const engine = new PortfolioCapitalEngine();
const result = engine.plan({
  settings,
  opportunity: opportunity(),
  policyDecision: { action: 'ENTER', sizeMultiplier: 1 },
  openPositions: [],
});

assert.equal(typeof settings.portfolio.baseEntryCapitalIdr, 'number');
assert.equal(typeof result.capitalPlan.allocatedNotionalIdr, 'number');
assert.equal(typeof result.capitalPlan.exposure.pairClass.remainingNotionalIdr, 'number');
assert.equal(result.capitalContext.pairClassBucket, 'MICRO');
console.log('portfolio_capital_contract_probe: ok');
