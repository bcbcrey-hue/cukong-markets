import assert from 'node:assert/strict';

import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';
import type { OpportunityAssessment, StoredAccount } from '../src/core/types';

function account(): StoredAccount {
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

function opportunity(action: OpportunityAssessment['recommendedAction']): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: 'sizing_idr',
    rawScore: 78,
    finalScore: 82,
    confidence: 0.84,
    pumpProbability: 0.72,
    continuationProbability: 0.64,
    trapProbability: 0.2,
    spoofRisk: 0.2,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: 7,
    quoteFlowAccelerationScore: 29,
    orderbookImbalance: 0.2,
    change1m: 0.8,
    change5m: 2.6,
    entryTiming: { state: 'SCOUT_WINDOW', quality: 80, reason: 'scout', leadScore: 75, entryStyle: 'SCOUT' },
    reasons: ['ok'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: action,
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99.9,
    bestAsk: 100,
    spreadPct: 0.3,
    liquidityScore: 80,
    timestamp: now,
  };
}

async function main() {
  const risk = new RiskEngine();
  const settings = createDefaultSettings();
  const normal = risk.checkCanEnter({
    account: account(),
    settings,
    signal: opportunity('ENTER'),
    openPositions: [],
    amountIdr: settings.risk.maxPositionSizeIdr,
    cooldownUntil: null,
  });

  const scout = risk.checkCanEnter({
    account: account(),
    settings,
    signal: opportunity('SCOUT_ENTER'),
    openPositions: [],
    amountIdr: settings.risk.maxPositionSizeIdr,
    cooldownUntil: null,
  });

  assert.equal(normal.allowed, true, 'Lane normal harus tetap bisa masuk pada setup sehat');
  assert.equal(scout.allowed, true, 'Lane scout harus lolos pada setup sehat');
  assert.equal(scout.entryLane, 'SCOUT', 'Lane scout harus terdeteksi');
  assert.ok(
    (scout.adjustedAmountIdr ?? 0) < (normal.adjustedAmountIdr ?? Number.MAX_SAFE_INTEGER),
    'Ukuran scout harus lebih kecil dari ukuran normal',
  );
  assert.ok((scout.adjustedAmountIdr ?? 0) <= settings.risk.maxPositionSizeIdr * 0.35, 'Ukuran scout wajib <= 35% dari normal');

  console.log('scout_lane_sizing_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
