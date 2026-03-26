import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createDefaultSettings, PersistenceService } from '../src/services/persistenceService';
import { PositionManager } from '../src/domain/trading/positionManager';
import { RiskEngine } from '../src/domain/trading/riskEngine';
import { ReportService } from '../src/services/reportService';

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const positionManager = new PositionManager(persistence);
  await positionManager.load();

  const opened = await positionManager.applyBuyFill({
    accountId: 'acc-1',
    pair: 'btc_idr',
    quantity: 1,
    entryPrice: 100,
    entryFeesPaid: 1,
    stopLossPrice: 98,
    takeProfitPrice: 115,
  });

  assert.equal(opened.currentPrice, 100, 'Initial mark follows first known execution price');
  assert.equal(opened.peakPrice, 100, 'Initial peak follows initial mark');
  assert.equal(opened.unrealizedPnl, -1, 'Initial unrealized pnl must include entry fee');
  assert.equal(opened.entryStyle, 'CONFIRM', 'Default entry style should fallback to CONFIRM');
  assert.equal(opened.pumpState, 'ACTIVE', 'Default pump state should be ACTIVE');

  await positionManager.updateMark('btc_idr', 90, {
    continuationScore: 0.28,
    dumpRisk: 0.75,
    pumpState: 'DISTRIBUTING',
    emergencyExitArmed: false,
  });
  const markedDown = positionManager.getById(opened.id);
  assert.ok(markedDown, 'Position should exist after mark down');
  assert.equal(markedDown.currentPrice, 90, 'Current price should track market mark');
  assert.equal(markedDown.peakPrice, 100, 'Peak price should not drop on lower mark');
  assert.equal(markedDown.unrealizedPnl, -11, 'Unrealized pnl should use current mark and fees');
  assert.equal(markedDown.lastContinuationScore, 0.28, 'Continuation metadata should update on mark');
  assert.equal(markedDown.lastDumpRisk, 0.75, 'Dump risk metadata should update on mark');
  assert.equal(markedDown.pumpState, 'DISTRIBUTING', 'Pump state metadata should update on mark');

  const averaged = await positionManager.applyBuyFill({
    accountId: 'acc-1',
    pair: 'btc_idr',
    quantity: 1,
    entryPrice: 120,
    entryFeesPaid: 1,
    stopLossPrice: 108,
    takeProfitPrice: 126,
  });

  assert.equal(averaged.averageEntryPrice, 110, 'Average entry should be weighted by filled quantities');
  assert.equal(averaged.quantity, 2, 'Position quantity should increase after additional buy fill');
  assert.equal(
    averaged.currentPrice,
    90,
    'Buy fill must not overwrite mark state with execution price',
  );
  assert.equal(
    averaged.peakPrice,
    100,
    'Buy fill must not mutate peak mark because no new market mark was observed',
  );
  assert.equal(
    averaged.unrealizedPnl,
    -42,
    'Unrealized pnl must continue to use mark price, not buy fill price',
  );

  const risk = new RiskEngine();
  const settings = createDefaultSettings();
  const exitBeforeNewMark = risk.evaluateExit(averaged, settings);
  assert.equal(exitBeforeNewMark.action, 'DUMP_EXIT', 'Risk decision should follow stale-lower mark, not buy fill');

  await positionManager.updateMark('btc_idr', 130, {
    continuationScore: 0.72,
    dumpRisk: 0.2,
    pumpState: 'ACTIVE',
    emergencyExitArmed: false,
  });
  const markedUp = positionManager.getById(opened.id);
  assert.ok(markedUp, 'Position should exist after mark up');
  assert.equal(markedUp.currentPrice, 130, 'Mark update should set current mark');
  assert.equal(markedUp.peakPrice, 130, 'Peak should only increase on mark update');
  assert.equal(markedUp.unrealizedPnl, 38, 'Unrealized pnl should follow latest mark and averaged entry');

  const partiallyClosed = await positionManager.closePartial(opened.id, 1, 150, 0.5);
  assert.ok(partiallyClosed, 'Partial close should return updated position');
  assert.equal(partiallyClosed.quantity, 1, 'Quantity should drop after partial close');
  assert.equal(
    partiallyClosed.currentPrice,
    130,
    'Partial sell fill must not overwrite mark for remaining open quantity',
  );
  assert.equal(
    partiallyClosed.peakPrice,
    130,
    'Partial sell fill must not inflate peak mark using fill price',
  );
  assert.equal(partiallyClosed.realizedPnl, 38.5, 'Realized pnl should include entry-fee share and exit fee');
  assert.equal(partiallyClosed.unrealizedPnl, 19, 'Unrealized pnl should remain mark-based after partial close');

  const report = new ReportService().positionsText(positionManager.listOpen());
  assert.match(report, /mark=130\.00000000/, 'Report mark must display true market mark');
  assert.match(report, /unreal=19\.00/, 'Report unrealized pnl must display mark-based value');

  const exitAfterNewMark = risk.evaluateExit(partiallyClosed, settings);
  assert.equal(exitAfterNewMark.action, 'SCALE_OUT', 'Risk decision should react to updated mark with soft TP behaviour');

  const reloadedManager = new PositionManager(persistence);
  await reloadedManager.load();
  const reloaded = reloadedManager.getById(opened.id);
  assert.ok(reloaded, 'Position should persist after reload');
  assert.equal(reloaded.lastDumpRisk, partiallyClosed.lastDumpRisk, 'Dump risk metadata must persist');
  assert.equal(reloaded.pumpState, partiallyClosed.pumpState, 'Pump state metadata must persist');

  console.log('PASS position_mark_pnl_correctness_probe');
}

main().catch((error) => {
  console.error('FAIL position_mark_pnl_correctness_probe');
  console.error(error);
  process.exit(1);
});
