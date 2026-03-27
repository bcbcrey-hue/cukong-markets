import assert from 'node:assert/strict';

import { buildRuntimeEntryCandidates } from '../src/app';
import type { OpportunityAssessment, StoredAccount } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function opp(): OpportunityAssessment {
  return {
    pair: 'runtime_capital_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MID',
    rawScore: 88,
    finalScore: 90,
    confidence: 0.9,
    pumpProbability: 0.8,
    continuationProbability: 0.72,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 22,
    quoteFlowAccelerationScore: 33,
    orderbookImbalance: 0.22,
    change1m: 0.8,
    change5m: 2,
    entryTiming: { state: 'READY', quality: 81, reason: 'ok', leadScore: 75 },
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
    depthScore: 35,
    timestamp: Date.now(),
  };
}

const settings = createDefaultSettings();
settings.strategy.minScoreToBuy = 1;
settings.strategy.minScoreToAlert = 1;
settings.strategy.minConfidence = 0;
settings.strategy.minPumpProbability = 0;
settings.strategy.useAntiSpoof = false;
settings.risk.maxPositionSizeIdr = 5_000_000;
settings.portfolio.baseEntryCapitalIdr = 120_000;

const account: StoredAccount = {
  id: 'acc', name: 'a', apiKey: 'k', apiSecret: 's', isDefault: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), enabled: true,
};

const candidates = buildRuntimeEntryCandidates([opp()], settings, new RiskEngine(), new PortfolioCapitalEngine(), account, [], {});
const candidate = candidates[0];
assert.ok(candidate.capitalPlan.baseEntryCapitalIdr === 120_000);
assert.ok((candidate.riskCheckResult.adjustedAmountIdr ?? 0) <= 120_000 * 1.3);
assert.equal(candidate.riskCheckResult.adjustedAmountIdr, candidate.capitalPlan.allocatedNotionalIdr);
console.log('runtime_capital_policy_wiring_probe: ok');
