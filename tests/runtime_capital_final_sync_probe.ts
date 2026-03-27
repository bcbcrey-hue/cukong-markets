import assert from 'node:assert/strict';

import { buildRuntimeEntryCandidates, buildRuntimePolicyDecisionEvidence } from '../src/app';
import type { OpportunityAssessment, StoredAccount } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultHealth, createDefaultSettings } from '../src/services/persistenceService';
import { ReportService } from '../src/services/reportService';

function opp(): OpportunityAssessment {
  return {
    pair: 'sync_block_idr',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MID',
    rawScore: 90,
    finalScore: 93,
    confidence: 0.92,
    pumpProbability: 0.86,
    continuationProbability: 0.75,
    trapProbability: 0.1,
    spoofRisk: 0.05,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 25,
    quoteFlowAccelerationScore: 35,
    orderbookImbalance: 0.3,
    change1m: 0.9,
    change5m: 2.4,
    entryTiming: { state: 'READY', quality: 85, reason: 'ok', leadScore: 77 },
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
    depthScore: 38,
    timestamp: Date.now(),
  };
}

const settings = createDefaultSettings();
settings.tradingMode = 'FULL_AUTO';
settings.strategy.minScoreToAlert = 1;
settings.strategy.minScoreToBuy = 1;
settings.strategy.minConfidence = 0;
settings.strategy.minPumpProbability = 0;
settings.strategy.useAntiSpoof = false;
settings.risk.maxPairSpreadPct = 10;
settings.risk.maxOpenPositions = 10;

const account: StoredAccount = {
  id: 'acc-sync',
  name: 'probe',
  apiKey: 'k',
  apiSecret: 's',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  enabled: true,
};

const candidates = buildRuntimeEntryCandidates(
  [opp()],
  settings,
  new RiskEngine(),
  new PortfolioCapitalEngine(),
  account,
  [],
  { sync_block_idr: Date.now() + settings.risk.cooldownMs + 30_000 },
);

const blocked = candidates[0];
assert.equal(blocked.policyDecision.action, 'SKIP');
assert.equal(blocked.riskCheckResult.allowed, false);
assert.equal(blocked.capitalContext.blocked, true);
assert.equal(blocked.capitalContext.allocatedNotionalIdr, 0);
assert.ok(
  blocked.capitalContext.reasons.some((reason) => reason.includes('Final runtime blocked by')),
  'reason capital final harus menyebut final runtime blocked by risk/policy',
);

const evidence = buildRuntimePolicyDecisionEvidence(candidates)[0];
assert.equal(evidence.capitalContext?.blocked, true);
assert.equal(evidence.capitalContext?.allocatedNotionalIdr, 0);

const report = new ReportService();
const text = report.statusText({
  health: createDefaultHealth(),
  activeAccounts: 1,
  runtimePolicyDecision: {
    pair: evidence.pair,
    action: evidence.action,
    reasons: evidence.reasons,
    entryLane: evidence.entryLane,
    sizeMultiplier: evidence.sizeMultiplier,
    aggressiveness: evidence.aggressiveness,
    riskAllowed: evidence.riskAllowed,
    riskReasons: evidence.riskReasons,
    capital: evidence.capitalContext,
    updatedAt: new Date().toISOString(),
  },
});

assert.ok(text.includes('blocked=true'));
assert.ok(text.includes('allocated=0'));
console.log('runtime_capital_final_sync_probe: ok');
