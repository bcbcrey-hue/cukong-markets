import assert from 'node:assert/strict';

import { selectRuntimeEntryCandidate } from '../src/app';
import type { OpportunityAssessment } from '../src/core/types';
import { createDefaultSettings } from '../src/services/persistenceService';

function opp(pair: string, finalScore: number): OpportunityAssessment {
  const now = Date.now();
  return {
    pair,
    discoveryBucket: 'ROTATION',
    pairClass: 'MID',
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
  const topGeneral = {
    ...opp('general_top_major_idr', 90),
    pairClass: 'MAJOR' as const,
  };
  const lowerGeneral = {
    ...opp('general_lower_micro_idr', 70),
    pairClass: 'MICRO' as const,
  };

  const selected = selectRuntimeEntryCandidate([lowerGeneral, topGeneral], settings);
  assert.equal(
    selected?.pair,
    'general_lower_micro_idr',
    'fallback umum wajib hormati pair priority, bukan finalScore murni',
  );

  console.log('runtime_selector_fallback_general_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
