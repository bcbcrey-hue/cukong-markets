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
    pair: 'eth_idr',
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

function makeSignal(action: OpportunityAssessment['recommendedAction']): OpportunityAssessment {
  const now = Date.now();
  return {
    pair: 'eth_idr',
    rawScore: 80,
    finalScore: 86,
    confidence: 0.88,
    pumpProbability: 0.76,
    continuationProbability: 0.64,
    trapProbability: 0.16,
    spoofRisk: 0.2,
    edgeValid: true,
    marketRegime: 'BREAKOUT_SETUP',
    breakoutPressure: 7,
    quoteFlowAccelerationScore: 30,
    orderbookImbalance: 0.2,
    change1m: 0.8,
    change5m: 2.5,
    entryTiming: {
      state: action === 'SCOUT_ENTER' ? 'SCOUT_WINDOW' : 'READY',
      quality: 80,
      reason: 'ok',
      leadScore: 75,
      entryStyle: action === 'SCOUT_ENTER' ? 'SCOUT' : undefined,
    },
    reasons: ['ok'],
    warnings: [],
    featureBreakdown: [],
    recommendedAction: action,
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

function assertNotBlockedBySamePairOtherAccount(result: ReturnType<RiskEngine['checkCanEnter']>, label: string) {
  assert.equal(result.allowed, true, `${label} harus tetap allowed jika posisi pair sama hanya ada di akun lain`);
  assert.equal(
    result.reasons.some((reason) => reason.includes('Masih ada posisi terbuka pada pair yang sama')),
    false,
    `${label} tidak boleh kena same-pair block lintas akun`,
  );
}

async function main() {
  const risk = new RiskEngine();
  const settings = createDefaultSettings();
  const openPositions = [makePosition('acc-other')];

  const normalResult = risk.checkCanEnter({
    account: makeAccount('acc-target'),
    settings,
    signal: makeSignal('ENTER'),
    openPositions,
    amountIdr: settings.risk.maxPositionSizeIdr,
    cooldownUntil: null,
  });

  const scoutResult = risk.checkCanEnter({
    account: makeAccount('acc-target'),
    settings,
    signal: makeSignal('SCOUT_ENTER'),
    openPositions,
    amountIdr: settings.risk.maxPositionSizeIdr,
    cooldownUntil: null,
  });

  assertNotBlockedBySamePairOtherAccount(normalResult, 'ENTRY normal');
  assertNotBlockedBySamePairOtherAccount(scoutResult, 'SCOUT entry');

  console.log('normal_entry_other_account_same_pair_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
