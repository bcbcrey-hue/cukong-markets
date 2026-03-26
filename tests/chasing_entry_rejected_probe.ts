import assert from 'node:assert/strict';

import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';
import type { OpportunityAssessment, StoredAccount } from '../src/core/types';

function makeAccount(): StoredAccount {
  return {
    id: 'acc',
    name: 'main',
    apiKey: 'k',
    apiSecret: 's',
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
  };
}

function chasingOpportunity(): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: 'chase_idr',
    rawScore: 79,
    finalScore: 86,
    confidence: 0.87,
    pumpProbability: 0.74,
    continuationProbability: 0.6,
    trapProbability: 0.2,
    spoofRisk: 0.2,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 8,
    quoteFlowAccelerationScore: 26,
    orderbookImbalance: 0.13,
    change1m: 2.1,
    change5m: 4.8,
    entryTiming: { state: 'CHASING', quality: 25, reason: 'telat', leadScore: 20, entryStyle: 'CHASING' },
    reasons: ['chasing'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'WATCH',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadPct: 0.35,
    liquidityScore: 75,
    timestamp: now,
  };
}

async function main() {
  const risk = new RiskEngine();
  const settings = createDefaultSettings();
  const result = risk.checkCanEnter({
    account: makeAccount(),
    settings,
    signal: chasingOpportunity(),
    openPositions: [],
    amountIdr: settings.risk.maxPositionSizeIdr,
    cooldownUntil: null,
  });

  assert.equal(result.allowed, false, 'Entry CHASING tidak boleh dipaksa buy');
  assert.ok(result.reasons.some((reason) => reason.includes('Timing entry tidak layak')), 'Harus ada alasan timing rejection');

  console.log('chasing_entry_rejected_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
