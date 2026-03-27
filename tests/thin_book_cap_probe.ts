import assert from 'node:assert/strict';

import type { OpportunityAssessment } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function make(depthScore: number): OpportunityAssessment {
  return {
    pair: `thin_${depthScore}_idr`,
    discoveryBucket: 'STEALTH',
    pairClass: 'MID',
    rawScore: 80,
    finalScore: 82,
    confidence: 0.8,
    pumpProbability: 0.75,
    continuationProbability: 0.65,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 10,
    quoteFlowAccelerationScore: 20,
    orderbookImbalance: 0.2,
    change1m: 0.6,
    change5m: 1.5,
    entryTiming: { state: 'READY', quality: 78, reason: 'ok', leadScore: 70 },
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
    depthScore,
    timestamp: Date.now(),
  };
}

const settings = createDefaultSettings();
const engine = new PortfolioCapitalEngine();
const healthy = engine.plan({ settings, opportunity: make(50), policyDecision: { action: 'ENTER', sizeMultiplier: 1 }, openPositions: [], opportunities: [] });
const thin = engine.plan({ settings, opportunity: make(5), policyDecision: { action: 'ENTER', sizeMultiplier: 1 }, openPositions: [], opportunities: [] });

assert.ok((thin.capitalPlan.thinBookCapIdr ?? 0) > 0);
assert.ok(thin.capitalPlan.allocatedNotionalIdr < healthy.capitalPlan.allocatedNotionalIdr);
console.log('thin_book_cap_probe: ok');
