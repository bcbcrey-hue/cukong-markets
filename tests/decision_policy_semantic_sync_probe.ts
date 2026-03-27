import assert from 'node:assert/strict';

import { selectRuntimeEntryCandidate } from '../src/app';
import type { OpportunityAssessment, RiskCheckResult } from '../src/core/types';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function makeOpportunity(
  pair: string,
  overrides: Partial<OpportunityAssessment> = {},
): OpportunityAssessment {
  const now = Date.now();
  return {
    pair,
    discoveryBucket: 'ROTATION',
    pairClass: 'MID',
    rawScore: 78,
    finalScore: 78,
    confidence: 0.86,
    pumpProbability: 0.8,
    continuationProbability: 0.63,
    trapProbability: 0.12,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: 8,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    change1m: 0.8,
    change5m: 2.2,
    entryTiming: { state: 'READY', quality: 82, reason: 'ok', leadScore: 70 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.4,
    liquidityScore: 75,
    timestamp: now,
    ...overrides,
  };
}

function makeExecution(settingsOverride?: ReturnType<typeof createDefaultSettings>): ExecutionEngine {
  const settings = settingsOverride ?? createDefaultSettings();
  const settingsService = {
    get: () => settings,
  };

  return new ExecutionEngine(
    {} as never,
    settingsService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

function blockedRiskResult(reason: string): RiskCheckResult {
  return {
    allowed: false,
    reasons: [reason],
    warnings: [],
    entryLane: 'DEFAULT',
    baseAmountIdr: 1_000_000,
    adjustedAmountIdr: 1_000_000,
  };
}

async function main() {
  const settings = createDefaultSettings();
  settings.tradingMode = 'FULL_AUTO';
  const execution = makeExecution(settings);

  const trapRisk = makeOpportunity('trap_risk_idr', {
    marketRegime: 'TRAP_RISK',
    recommendedAction: 'ENTER',
  });
  const trapRiskDecision = execution.decideAutoExecution(trapRisk);
  assert.equal(trapRiskDecision.action, 'SKIP', 'TRAP_RISK wajib SKIP');
  assert.ok(trapRiskDecision.reasons.some((reason) => reason.includes('TRAP_RISK')));

  const distribution = makeOpportunity('distribution_idr', {
    marketRegime: 'DISTRIBUTION',
    recommendedAction: 'ENTER',
  });
  const distributionDecision = execution.decideAutoExecution(distribution);
  assert.equal(distributionDecision.action, 'SKIP', 'DISTRIBUTION wajib SKIP');

  const quiet = makeOpportunity('quiet_idr', {
    marketRegime: 'QUIET',
    finalScore: settings.strategy.minScoreToBuy + 6,
  });
  const quietDecision = execution.decideAutoExecution(quiet);
  assert.equal(quietDecision.action, 'ENTER', 'QUIET sehat boleh ENTER defensif');
  assert.equal(quietDecision.aggressiveness, 'LOW', 'QUIET wajib defensif');
  assert.ok(quietDecision.sizeMultiplier <= 0.5, 'QUIET wajib sizing kecil');

  const expansion = makeOpportunity('expansion_idr', {
    marketRegime: 'EXPANSION',
    discoveryBucket: 'ANOMALY',
    finalScore: settings.strategy.minScoreToBuy + 8,
  });
  const expansionDecision = execution.decideAutoExecution(expansion);
  assert.equal(expansionDecision.action, 'ENTER', 'EXPANSION aman boleh ENTER');
  assert.equal(expansionDecision.aggressiveness, 'HIGH', 'EXPANSION full-auto wajib lebih agresif');
  assert.ok(expansionDecision.sizeMultiplier >= 1, 'EXPANSION sizing minimal normal');

  const weakDiscovery = makeOpportunity('weak_discovery_idr', {
    discoveryBucket: 'ROTATION',
    finalScore: settings.strategy.minScoreToBuy + 1,
    confidence: settings.strategy.minConfidence + 0.01,
  });
  const weakDiscoveryDecision = execution.decideAutoExecution(weakDiscovery);
  assert.equal(weakDiscoveryDecision.action, 'WAIT', 'Discovery lemah tidak boleh lolos mudah');

  const riskBlocked = makeOpportunity('risk_block_idr', {
    marketRegime: 'EXPANSION',
    discoveryBucket: 'ANOMALY',
  });
  const riskBlockedDecision = execution.decideAutoExecution(
    riskBlocked,
    blockedRiskResult('max open positions reached'),
  );
  assert.equal(riskBlockedDecision.action, 'SKIP', 'Risk block tidak boleh dioverride jadi ENTER');
  assert.ok(riskBlockedDecision.reasons.some((reason) => reason.includes('RiskEngine memblokir')));

  const selectorResult = selectRuntimeEntryCandidate([
    makeOpportunity('selector_enter_idr', {
      discoveryBucket: 'ANOMALY',
      marketRegime: 'EXPANSION',
      pairClass: 'MICRO',
      finalScore: settings.strategy.minScoreToBuy + 7,
      recommendedAction: 'ENTER',
    }),
    makeOpportunity('selector_blocked_idr', {
      discoveryBucket: 'ANOMALY',
      marketRegime: 'TRAP_RISK',
      pairClass: 'MICRO',
      finalScore: settings.strategy.minScoreToBuy + 12,
      recommendedAction: 'ENTER',
    }),
  ], settings);
  assert.equal(
    selectorResult?.pair,
    'selector_enter_idr',
    'runtime selector harus mengikuti output policy final, bukan recommendedAction mentah',
  );

  console.log('decision_policy_semantic_sync_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
