import assert from 'node:assert/strict';

import { selectRuntimeEntryCandidate } from '../src/app';
import type { OpportunityAssessment } from '../src/core/types';
import { createDefaultSettings } from '../src/services/persistenceService';

function opp(pair: string, overrides: Partial<OpportunityAssessment>): OpportunityAssessment {
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
    entryTiming: { state: 'CONFIRM_WINDOW', quality: 80, reason: 'ok', leadScore: 70 },
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
  const addOn = opp('addon_idr', { recommendedAction: 'ADD_ON_CONFIRM', finalScore: 65, pairClass: 'MICRO' });
  const general = opp('general_idr', { recommendedAction: 'ENTER', finalScore: 88, pairClass: 'MAJOR' });

  const selected = selectRuntimeEntryCandidate([general, addOn], settings);
  assert.equal(selected?.pair, 'addon_idr', 'ADD_ON_CONFIRM wajib dipilih setelah scout lane tidak tersedia');

  console.log('runtime_selector_prefers_add_on_after_scout_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
