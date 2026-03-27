import assert from 'node:assert/strict';

import { selectRuntimeEntryCandidate } from '../src/app';
import type { OpportunityAssessment } from '../src/core/types';
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

function assertSelectorAndExecutionConsistent(
  opportunities: OpportunityAssessment[],
  expectedSelectedPair: string | undefined,
  targetPair: string,
  expectedAction: 'ENTER' | 'SKIP' | 'WAIT',
  expectedLane: 'DEFAULT' | 'SCOUT' | 'ADD_ON_CONFIRM',
  message: string,
  settings = createDefaultSettings(),
): void {
  const selected = selectRuntimeEntryCandidate(opportunities, settings);
  assert.equal(selected?.pair, expectedSelectedPair, `${message} - selector mismatch`);

  const execution = makeExecution(settings);
  const target = opportunities.find((item) => item.pair === targetPair);
  assert.ok(target, `${message} - target opportunity tidak ditemukan`);

  const decision = execution.decideAutoExecution(target!);
  assert.equal(decision.action, expectedAction, `${message} - action mismatch`);
  assert.equal(decision.entryLane, expectedLane, `${message} - lane mismatch`);
}

async function main() {
  const settings = createDefaultSettings();

  const scout = makeOpportunity('scout_idr', {
    recommendedAction: 'SCOUT_ENTER',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
  });
  const addOn = makeOpportunity('addon_idr', {
    recommendedAction: 'ADD_ON_CONFIRM',
    pairClass: 'MID',
  });
  const normal = makeOpportunity('normal_idr', {
    recommendedAction: 'ENTER',
    pairClass: 'MAJOR',
  });

  assertSelectorAndExecutionConsistent(
    [normal, scout],
    'scout_idr',
    'scout_idr',
    'ENTER',
    'SCOUT',
    'lane scout harus sinkron',
    settings,
  );

  assertSelectorAndExecutionConsistent(
    [normal, addOn],
    'addon_idr',
    'addon_idr',
    'ENTER',
    'ADD_ON_CONFIRM',
    'lane add-on harus sinkron',
    settings,
  );

  assertSelectorAndExecutionConsistent(
    [normal],
    'normal_idr',
    'normal_idr',
    'ENTER',
    'DEFAULT',
    'lane default harus sinkron',
    settings,
  );

  const lowScore = makeOpportunity('low_score_idr', {
    finalScore: settings.strategy.minScoreToAlert - 1,
    recommendedAction: 'ENTER',
  });
  assertSelectorAndExecutionConsistent(
    [lowScore],
    undefined,
    'low_score_idr',
    'WAIT',
    'DEFAULT',
    'score rendah harus sinkron',
    settings,
  );

  const lowConfidence = makeOpportunity('low_conf_idr', {
    confidence: settings.strategy.minConfidence - 0.05,
    recommendedAction: 'ENTER',
  });
  assertSelectorAndExecutionConsistent(
    [lowConfidence],
    undefined,
    'low_conf_idr',
    'SKIP',
    'DEFAULT',
    'confidence rendah harus sinkron',
    settings,
  );

  const lowPump = makeOpportunity('low_pump_idr', {
    pumpProbability: settings.strategy.minPumpProbability - 0.05,
    recommendedAction: 'ENTER',
  });
  assertSelectorAndExecutionConsistent(
    [lowPump],
    undefined,
    'low_pump_idr',
    'WAIT',
    'DEFAULT',
    'pumpProbability rendah harus sinkron',
    settings,
  );

  const timingVeto = makeOpportunity('timing_veto_idr', {
    entryTiming: { state: 'CHASING', quality: 40, reason: 'late', leadScore: 20 },
    recommendedAction: 'SCOUT_ENTER',
    discoveryBucket: 'ANOMALY',
  });
  assertSelectorAndExecutionConsistent(
    [timingVeto],
    undefined,
    'timing_veto_idr',
    'SKIP',
    'SCOUT',
    'timing veto post-policy harus sinkron',
    settings,
  );

  console.log('decision_policy_semantic_sync_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
