import assert from 'node:assert/strict';

import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';
import type { OpportunityAssessment, PositionRecord, StoredAccount } from '../src/core/types';

function makeAccount(id: string): StoredAccount {
  return {
    id,
    name: id,
    apiKey: 'k',
    apiSecret: 's',
    isDefault: id === 'acc-target',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: true,
  };
}

function makePosition(accountId: string): PositionRecord {
  return {
    id: `pos-${accountId}`,
    pair: 'btc_idr',
    accountId,
    status: 'OPEN',
    side: 'long',
    quantity: 1,
    entryPrice: 100,
    averageEntryPrice: 100,
    averageExitPrice: null,
    currentPrice: 101,
    peakPrice: 102,
    unrealizedPnl: 1,
    realizedPnl: 0,
    totalEntryFeesPaid: 0,
    totalBoughtQuantity: 1,
    totalSoldQuantity: 0,
    stopLossPrice: 95,
    takeProfitPrice: 108,
    entryStyle: 'CONFIRM',
    pumpState: 'ACTIVE',
    lastContinuationScore: 0.55,
    lastDumpRisk: 0.2,
    lastScaleOutAt: null,
    emergencyExitArmed: false,
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  };
}

function makeSignal(): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: 'btc_idr',
    rawScore: 82,
    finalScore: 88,
    confidence: 0.9,
    pumpProbability: 0.78,
    continuationProbability: 0.66,
    trapProbability: 0.15,
    spoofRisk: 0.2,
    edgeValid: true,
    marketRegime: 'EXPANSION',
    breakoutPressure: 7,
    quoteFlowAccelerationScore: 28,
    orderbookImbalance: 0.2,
    change1m: 0.9,
    change5m: 2.8,
    entryTiming: {
      state: 'CONFIRM_WINDOW',
      quality: 80,
      reason: 'confirm',
      leadScore: 75,
      entryStyle: 'CONFIRM',
    },
    reasons: ['ok'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: 'ADD_ON_CONFIRM',
    riskContext: ['ok'],
    historicalMatchSummary: 'ok',
    referencePrice: 100,
    bestBid: 99.8,
    bestAsk: 100,
    spreadPct: 0.3,
    liquidityScore: 80,
    timestamp: now,
  };
}

async function main() {
  const risk = new RiskEngine();
  const settings = createDefaultSettings();

  const result = risk.checkCanEnter({
    account: makeAccount('acc-target'),
    settings,
    signal: makeSignal(),
    openPositions: [makePosition('acc-other')],
    amountIdr: settings.risk.maxPositionSizeIdr,
    cooldownUntil: null,
  });

  assert.equal(result.allowed, false, 'ADD_ON_CONFIRM harus ditolak jika posisi pair sama hanya ada di akun lain');
  assert.ok(
    result.reasons.some((reason) => reason.includes('Add-on confirm butuh posisi aktif pair yang sama')),
    'Reason wajib menyatakan add-on butuh posisi akun yang sama',
  );

  console.log('add_on_confirm_account_scope_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
