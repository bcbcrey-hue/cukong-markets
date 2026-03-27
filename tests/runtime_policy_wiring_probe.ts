import assert from 'node:assert/strict';

import { buildRuntimeEntryCandidates, selectRuntimeEntryCandidate } from '../src/app';
import type { OpportunityAssessment, StoredAccount } from '../src/core/types';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

function makeOpportunity(
  pair: string,
  overrides: Partial<OpportunityAssessment> = {},
): OpportunityAssessment {
  const now = Date.now();
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MID',
    rawScore: 88,
    finalScore: 88,
    confidence: 0.9,
    pumpProbability: 0.9,
    continuationProbability: 0.72,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'QUIET',
    breakoutPressure: 12,
    quoteFlowAccelerationScore: 34,
    orderbookImbalance: 0.22,
    change1m: 0.8,
    change5m: 2.1,
    entryTiming: { state: 'READY', quality: 88, reason: 'ok', leadScore: 74 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ENTER',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.05,
    liquidityScore: 78,
    timestamp: now,
    ...overrides,
  };
}

async function main() {
  const settings = createDefaultSettings();
  settings.tradingMode = 'FULL_AUTO';
  settings.strategy.useAntiSpoof = false;
  settings.strategy.minScoreToBuy = 1;
  settings.strategy.minScoreToAlert = 1;
  settings.strategy.minConfidence = 0;
  settings.strategy.minPumpProbability = 0;
  settings.risk.maxPairSpreadPct = 10;
  settings.risk.maxOpenPositions = 10;
  settings.risk.maxPositionSizeIdr = 1_000_000;
  const riskEngine = new RiskEngine();
  const account: StoredAccount = {
    id: 'acc-1',
    name: 'probe',
    apiKey: 'k',
    apiSecret: 's',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
  };

  const enterCandidate = makeOpportunity('enter_idr', { finalScore: 96, pairClass: 'MICRO' });
  const waitCandidate = makeOpportunity('wait_idr', {
    finalScore: settings.strategy.minScoreToBuy - 1,
    recommendedAction: 'WATCH',
  });
  const skipCandidate = makeOpportunity('skip_idr', {
    finalScore: 95,
    marketRegime: 'TRAP_RISK',
    recommendedAction: 'ENTER',
  });
  const cooldownBlocked = makeOpportunity('blocked_idr', {
    finalScore: 96,
    recommendedAction: 'ENTER',
  });

  const runtimeCandidates = buildRuntimeEntryCandidates(
    [enterCandidate, waitCandidate, skipCandidate, cooldownBlocked],
    settings,
    riskEngine,
    account,
    [],
    { blocked_idr: Date.now() + settings.risk.cooldownMs + 10_000 },
  );

  const blockedResult = runtimeCandidates.find((item) => item.pair === 'blocked_idr');
  assert.ok(blockedResult, 'blocked candidate should exist');
  assert.equal(blockedResult?.riskCheckResult.allowed, false, 'risk check harus terjadi di runtime sebelum policy final');
  assert.equal(blockedResult?.policyDecision.action, 'SKIP', 'risk block runtime harus menjadi keputusan policy final');
  assert.ok(
    blockedResult?.policyDecision.reasons.some((reason) => reason.includes('RiskEngine memblokir')),
    'policy final harus membawa alasan risk block',
  );

  const selected = selectRuntimeEntryCandidate(runtimeCandidates);
  assert.ok(selected, 'harus ada kandidat ENTER yang lolos');
  assert.equal(selected?.pair, 'enter_idr', 'hanya ENTER yang boleh lolos selector runtime final');
  assert.equal(selected?.policyDecision.action, 'ENTER', 'selector runtime final tidak boleh kirim WAIT/SKIP');
  assert.ok(
    runtimeCandidates
      .filter((item) => item.policyDecision.action !== 'ENTER')
      .every((item) => item.pair !== selected?.pair),
    'ranking final harus berbasis policy decision, bukan recommendedAction mentah',
  );

  console.log('runtime_policy_wiring_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
