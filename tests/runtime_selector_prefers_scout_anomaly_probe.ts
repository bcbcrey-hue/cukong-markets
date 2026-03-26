import assert from 'node:assert/strict';

import { selectRuntimeEntryCandidate } from '../src/app';
import type { OpportunityAssessment } from '../src/core/types';
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
    rawScore: 70,
    finalScore: 70,
    confidence: 0.9,
    pumpProbability: 0.8,
    continuationProbability: 0.6,
    trapProbability: 0.1,
    spoofRisk: 0.1,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: 8,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    change1m: 0.6,
    change5m: 2,
    entryTiming: { state: 'SCOUT_WINDOW', quality: 80, reason: 'ok', leadScore: 70 },
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
    liquidityScore: 70,
    timestamp: now,
    ...overrides,
  };
}

async function main() {
  const settings = createDefaultSettings();
  const topGeneral = makeOpportunity('major_idr', {
    finalScore: 95,
    recommendedAction: 'ENTER',
    pairClass: 'MAJOR',
  });
  const scoutAnomaly = makeOpportunity('micro_idr', {
    finalScore: 71,
    recommendedAction: 'SCOUT_ENTER',
    discoveryBucket: 'ANOMALY',
    pairClass: 'MICRO',
  });

  const selected = selectRuntimeEntryCandidate([topGeneral, scoutAnomaly], settings);
  assert.equal(selected?.pair, 'micro_idr', 'selector wajib pilih SCOUT_ENTER ANOMALY di atas top overall umum');

  console.log('runtime_selector_prefers_scout_anomaly_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
