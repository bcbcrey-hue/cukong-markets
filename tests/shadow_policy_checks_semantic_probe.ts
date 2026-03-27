import assert from 'node:assert/strict';

import type { OpportunityAssessment, RuntimePolicyReadModel } from '../src/core/types';
import { buildShadowPolicyValidationChecks } from '../src/domain/trading/executionEngine';

function makeOpportunity(pair: string, recommendedAction: OpportunityAssessment['recommendedAction']): OpportunityAssessment {
  const now = Date.now();
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass: 'MID',
    rawScore: 88,
    finalScore: 88,
    confidence: 0.9,
    pumpProbability: 0.8,
    continuationProbability: 0.7,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 12,
    quoteFlowAccelerationScore: 28,
    orderbookImbalance: 0.2,
    change1m: 0.3,
    change5m: 0.9,
    entryTiming: { state: 'READY', quality: 80, reason: 'ok', leadScore: 70 },
    reasons: ['probe'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction,
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99,
    bestAsk: 100,
    spreadPct: 0.1,
    liquidityScore: 70,
    timestamp: now,
  };
}

function makeRuntimePolicy(overrides: Partial<RuntimePolicyReadModel> = {}): RuntimePolicyReadModel {
  return {
    pair: 'btc_idr',
    action: 'ENTER',
    reasons: ['policy reason'],
    entryLane: 'DEFAULT',
    sizeMultiplier: 1,
    aggressiveness: 'NORMAL',
    riskAllowed: true,
    riskReasons: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function pickCheck(checks: ReturnType<typeof buildShadowPolicyValidationChecks>, name: ReturnType<typeof buildShadowPolicyValidationChecks>[number]['check']) {
  const found = checks.find((item) => item.check === name);
  assert.ok(found, `check ${name} harus ada`);
  return found;
}

async function main() {
  const account = 'probe-account';

  const noPolicyChecks = buildShadowPolicyValidationChecks({
    account,
    runtimePolicy: null,
    opportunities: [makeOpportunity('btc_idr', 'WATCH')],
  });
  assert.equal(
    pickCheck(noPolicyChecks, 'policy_runtime_decision').pass,
    false,
    'policy_runtime_decision harus FAIL jika runtime policy tidak tersedia',
  );

  const mismatchChecks = buildShadowPolicyValidationChecks({
    account,
    runtimePolicy: makeRuntimePolicy({ pair: 'eth_idr', action: 'WAIT' }),
    opportunities: [makeOpportunity('btc_idr', 'SCOUT_ENTER')],
  });
  assert.equal(
    pickCheck(mismatchChecks, 'policy_vs_hint_consistency').pass,
    false,
    'policy_vs_hint_consistency harus FAIL jika pair mismatch',
  );

  const samePairChecks = buildShadowPolicyValidationChecks({
    account,
    runtimePolicy: makeRuntimePolicy({ pair: 'btc_idr', action: 'WAIT' }),
    opportunities: [makeOpportunity('btc_idr', 'SCOUT_ENTER')],
  });
  assert.equal(
    pickCheck(samePairChecks, 'policy_vs_hint_consistency').pass,
    true,
    'policy_vs_hint_consistency harus PASS jika evidence hint vs final policy dari pair yang sama',
  );

  const guardrailPassChecks = buildShadowPolicyValidationChecks({
    account,
    runtimePolicy: makeRuntimePolicy({ action: 'SKIP', riskAllowed: false }),
    opportunities: [makeOpportunity('btc_idr', 'WATCH')],
  });
  assert.equal(
    pickCheck(guardrailPassChecks, 'policy_guardrail_enforced').pass,
    true,
    'policy_guardrail_enforced harus PASS jika action bukan ENTER saat riskAllowed=false',
  );

  const guardrailFailChecks = buildShadowPolicyValidationChecks({
    account,
    runtimePolicy: makeRuntimePolicy({ action: 'ENTER', riskAllowed: false }),
    opportunities: [makeOpportunity('btc_idr', 'ENTER')],
  });
  assert.equal(
    pickCheck(guardrailFailChecks, 'policy_guardrail_enforced').pass,
    false,
    'policy_guardrail_enforced harus FAIL jika action ENTER saat riskAllowed=false',
  );

  console.log('shadow_policy_checks_semantic_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
