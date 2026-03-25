import assert from 'node:assert/strict';

import { StateService } from '../src/services/stateService';
import { createDefaultRuntimeState } from '../src/services/persistenceService';
import type { RuntimeState } from '../src/core/types';

class FailingPersistence {
  private persisted: RuntimeState = createDefaultRuntimeState();

  async readState(): Promise<RuntimeState> {
    return this.persisted;
  }

  async saveState(): Promise<void> {
    throw new Error('disk write failure (injected)');
  }
}

async function main() {
  const persistence = new FailingPersistence();
  const stateService = new StateService(persistence as never);

  await stateService.load();
  const before = stateService.get().lastPumpCandidates.length;

  let errorCaught: Error | null = null;
  try {
    await stateService.setPumpCandidates([
      {
        pair: 'btc_idr',
        score: 90,
        confidence: 0.88,
        reasons: ['break-test'],
        warnings: [],
        regime: 'BREAKOUT_SETUP',
        breakoutPressure: 77,
        quoteFlowAccelerationScore: 70,
        orderbookImbalance: 0.4,
        spreadPct: 0.3,
        marketPrice: 100,
        bestBid: 99,
        bestAsk: 101,
        spreadBps: 30,
        bidDepthTop10: 100000,
        askDepthTop10: 90000,
        depthScore: 70,
        orderbookTimestamp: Date.now(),
        liquidityScore: 80,
        change1m: 1,
        change5m: 2,
        contributions: [],
        timestamp: Date.now(),
      },
    ]);
  } catch (error) {
    errorCaught = error as Error;
  }

  assert.ok(errorCaught, 'saveState failure harus terlempar ke caller');

  assert.equal(
    stateService.get().lastPumpCandidates.length,
    before,
    [
      'Mutasi memori harus atomic dengan persistence.',
      'Saat ini state memori berubah walau saveState gagal -> runtime vs disk divergen.',
    ].join(' '),
  );

  console.log('PASS break_state_atomicity_probe');
}

main().catch((error) => {
  console.error('FAIL break_state_atomicity_probe');
  console.error(error);
  process.exit(1);
});
