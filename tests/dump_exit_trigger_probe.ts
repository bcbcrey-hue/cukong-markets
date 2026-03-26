import assert from 'node:assert/strict';

import { ExitDecisionEngine } from '../src/domain/intelligence/exitDecisionEngine';

function main() {
  const engine = new ExitDecisionEngine();
  const decision = engine.decide({
    pnlPct: 9,
    peakPnlPct: 12,
    spreadPct: 0.5,
    retraceFromPeakPct: 20,
    continuationScore: 0.21,
    quoteFlowScore: 5,
    imbalance: -0.2,
    dumpRisk: 0.79,
    stopLossPct: 1.5,
    takeProfitPct: 15,
    trailingStopPct: 1,
    emergencyExitArmed: false,
  });

  assert.equal(decision.action, 'DUMP_EXIT', 'Distribusi/dump risk harus memicu dump exit');
  assert.equal(decision.shouldExit, true, 'DUMP_EXIT wajib close penuh');
  assert.equal(decision.closeReason, 'DUMP_EXIT', 'close reason harus typed DUMP_EXIT');

  console.log('dump_exit_trigger_probe: ok');
}

main();
