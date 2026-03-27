import assert from 'node:assert/strict';

import { selectRuntimeEntryCandidate } from '../src/app';
import type { OpportunityAssessment } from '../src/core/types';
import { createDefaultSettings } from '../src/services/persistenceService';

function general(pair: string, pairClass: OpportunityAssessment['pairClass'], finalScore: number): OpportunityAssessment {
  const now = Date.now();
  return {
    pair,
    discoveryBucket: 'ANOMALY',
    pairClass,
    rawScore: finalScore,
    finalScore,
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
    entryTiming: { state: 'READY', quality: 80, reason: 'ok', leadScore: 70 },
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
  };
}

async function main() {
  const settings = createDefaultSettings();
  const major = general('fallback_major_idr', 'MAJOR', 95);
  const mid = general('fallback_mid_idr', 'MID', 84);
  const micro = general('fallback_micro_idr', 'MICRO', 80);

  const selected = selectRuntimeEntryCandidate([major, mid, micro], settings);
  assert.equal(selected?.pair, 'fallback_micro_idr', 'fallback umum wajib MICRO > MID > MAJOR meski score lebih rendah');

  console.log('runtime_selector_fallback_pair_priority_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
