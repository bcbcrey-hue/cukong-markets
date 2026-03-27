import assert from 'node:assert/strict';

import {
  buildRuntimeEntryCandidates,
  buildRuntimePolicyDecisionEvidence,
  selectRuntimeEntryCandidate,
} from '../src/app';
import type { OpportunityAssessment, StoredAccount } from '../src/core/types';
import { PortfolioCapitalEngine } from '../src/domain/portfolio/portfolioCapitalEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function makeOpportunity(
  pair: string,
  overrides: Partial<OpportunityAssessment> = {},
): OpportunityAssessment {
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MID',
    rawScore: 88,
    finalScore: 90,
    confidence: 0.9,
    pumpProbability: 0.9,
    continuationProbability: 0.7,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'QUIET',
    breakoutPressure: 16,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    change1m: 1,
    change5m: 2,
    entryTiming: { state: 'READY', quality: 90, reason: 'probe', leadScore: 80 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: [],
    historicalMatchSummary: 'probe',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.05,
    liquidityScore: 80,
    depthScore: 40,
    timestamp: Date.now(),
    ...overrides,
  };
}

async function main() {
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
    id: 'batch-f-probe-account',
    name: 'batch-f-probe',
    apiKey: 'k',
    apiSecret: 's',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
  };

  const opportunities = [
    makeOpportunity('winner_idr', { finalScore: 96 }),
    makeOpportunity('blocked_by_risk_idr', { finalScore: 98 }),
    makeOpportunity('wait_hint_idr', { recommendedAction: 'WATCH', finalScore: 95 }),
  ];

  const pairCooldowns = { blocked_by_risk_idr: Date.now() + settings.risk.cooldownMs + 10_000 };

  const runtimeCandidates = buildRuntimeEntryCandidates(
    opportunities,
    settings,
    new RiskEngine(),
    new PortfolioCapitalEngine(),
    account,
    [],
    pairCooldowns,
  );

  const blocked = runtimeCandidates.find((item) => item.pair === 'blocked_by_risk_idr');
  assert.ok(blocked, 'candidate blocked_by_risk_idr harus ada');
  assert.equal(blocked?.riskCheckResult.allowed, false, 'risk check runtime harus aktif');
  assert.equal(blocked?.policyDecision.action, 'SKIP', 'final policy harus SKIP saat risk block');

  const waitHint = runtimeCandidates.find((item) => item.pair === 'wait_hint_idr');
  assert.ok(waitHint, 'candidate wait_hint_idr harus ada');
  assert.notEqual(
    waitHint?.policyDecision.action,
    waitHint?.opportunity.recommendedAction,
    'Batch F harus membuktikan final policy action bukan sekadar hint recommendedAction mentah',
  );

  const selected = selectRuntimeEntryCandidate(runtimeCandidates);
  assert.ok(selected, 'harus ada kandidat final untuk runtime');
  assert.equal(selected?.policyDecision.action, 'ENTER', 'selector final hanya boleh memilih action ENTER');

  const policyEvidence = buildRuntimePolicyDecisionEvidence(runtimeCandidates);
  assert.ok(policyEvidence.length >= 3, 'read-model policy evidence harus tersedia untuk semua candidate');
  assert.ok(
    policyEvidence.some((item) => item.pair === 'blocked_by_risk_idr' && item.action === 'SKIP'),
    'evidence policy harus menangkap SKIP karena risk guardrail',
  );

  console.log('batch_f_new_brain_validation_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
