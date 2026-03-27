import assert from 'node:assert/strict';

import type { OpportunityAssessment } from '../src/core/types';
import { evaluateOpportunityPolicyV1 } from '../src/domain/decision/decisionPolicyEngine';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function opp(pair: string, action: OpportunityAssessment['recommendedAction']): OpportunityAssessment {
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MID',
    rawScore: 85,
    finalScore: 87,
    confidence: 0.86,
    pumpProbability: 0.8,
    continuationProbability: 0.7,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 30,
    quoteFlowAccelerationScore: 40,
    orderbookImbalance: 0.2,
    change1m: 0.8,
    change5m: 2,
    entryTiming: { state: 'READY', quality: 82, reason: 'ok', leadScore: 74 },
    reasons: ['ok'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: action,
    riskContext: [],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.1,
    liquidityScore: 80,
    depthScore: 35,
    timestamp: Date.now(),
  };
}

const settings = createDefaultSettings();
settings.tradingMode = 'FULL_AUTO';
settings.strategy.minScoreToBuy = 1;
settings.strategy.minScoreToAlert = 1;
settings.strategy.minConfidence = 0;
settings.strategy.minPumpProbability = 0;
const engine = new PortfolioCapitalEngine();

const scout = opp('scout_idr', 'SCOUT_ENTER');
const normal = opp('normal_idr', 'ENTER');

const scoutPolicy = evaluateOpportunityPolicyV1(scout, settings);
const normalPolicy = evaluateOpportunityPolicyV1(normal, settings);
const scoutPlan = engine.plan({ settings, opportunity: scout, policyDecision: scoutPolicy, openPositions: [] });
const normalPlan = engine.plan({ settings, opportunity: normal, policyDecision: normalPolicy, openPositions: [] });

assert.equal(scoutPolicy.action, 'ENTER');
assert.equal(normalPolicy.action, 'ENTER');
assert.ok(normalPlan.capitalPlan.policyIntentNotionalIdr > scoutPlan.capitalPlan.policyIntentNotionalIdr);
assert.ok(normalPlan.capitalPlan.allocatedNotionalIdr >= scoutPlan.capitalPlan.allocatedNotionalIdr);
console.log('policy_to_capital_sizing_probe: ok');
