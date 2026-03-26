import assert from 'node:assert/strict';

import type { PositionRecord } from '../src/core/types';
import { ExecutionEngine } from '../src/domain/trading/executionEngine';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { createDefaultSettings } from '../src/services/persistenceService';

async function main() {
  const settings = createDefaultSettings();
  settings.tradingMode = 'FULL_AUTO';
  settings.paperTrade = true;
  settings.dryRun = false;
  settings.uiOnly = false;

  const position: PositionRecord = {
    id: 'p-1',
    pair: 'btc_idr',
    accountId: 'acc-1',
    status: 'OPEN',
    side: 'long',
    quantity: 1,
    entryPrice: 100,
    averageEntryPrice: 100,
    averageExitPrice: null,
    currentPrice: 116,
    peakPrice: 117,
    unrealizedPnl: 16,
    realizedPnl: 0,
    totalEntryFeesPaid: 0,
    totalBoughtQuantity: 1,
    totalSoldQuantity: 0,
    stopLossPrice: 98,
    takeProfitPrice: 115,
    entryStyle: 'SCOUT',
    pumpState: 'ACTIVE',
    lastContinuationScore: 0.6,
    lastDumpRisk: 0.2,
    lastScaleOutAt: null,
    emergencyExitArmed: false,
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
  };

  const sold: Array<{ positionId: string; quantity: number; closeReason: string }> = [];

  const execution = new ExecutionEngine(
    { getById: () => ({ id: 'acc-1', name: 'a', enabled: true }), getDefault: () => null, listEnabled: () => [], countEnabled: () => 1 } as never,
    { get: () => settings, getExecutionMode: () => 'SIMULATED' } as never,
    {
      get: () => ({
        status: 'RUNNING',
        pairs: {
          btc_idr: {
            pair: 'btc_idr',
            lastSeenAt: Date.now(),
            lastSignalAt: Date.now(),
            cooldownUntil: null,
            lastOpportunity: {
              pair: 'btc_idr',
              spreadPct: 0.3,
              continuationProbability: 0.45,
              quoteFlowAccelerationScore: 21,
              orderbookImbalance: 0.04,
              trapProbability: 0.51,
            },
          },
        },
      }),
    } as never,
    new RiskEngine(),
    {} as never,
    {
      listOpen: () => [position],
      getById: () => position,
    } as never,
    { listActive: () => [], create: async () => ({}), markFilled: async () => null } as never,
    { append: async () => undefined } as never,
    { publishExecutionSummary: async () => undefined, publishTradeOutcomeSummary: async () => undefined } as never,
  );

  execution.manualSell = (async (positionId: string, quantityToSell: number, _source, closeReason = 'AUTO_EXIT') => {
    sold.push({ positionId, quantity: quantityToSell, closeReason });
    return 'ok';
  }) as typeof execution.manualSell;

  const messages = await execution.evaluateOpenPositions();

  assert.equal(sold.length, 1, 'Runtime monitor harus memanggil jalur close position saat scale-out/exit');
  assert.equal(sold[0]?.closeReason, 'SCALE_OUT', 'Wiring harus membawa reason typed dari exit decision');
  assert.match(messages[0] ?? '', /scale-out/i, 'Message monitor harus menandai action scale-out');

  console.log('runtime_exit_wiring_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
