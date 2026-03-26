import assert from 'node:assert/strict';

import { ExitDecisionEngine } from '../src/domain/intelligence/exitDecisionEngine';

function main() {
  const engine = new ExitDecisionEngine();
  const decision = engine.decide({
    pnlPct: 4,
    peakPnlPct: 13,
    spreadPct: 2.8,
    retraceFromPeakPct: 41,
    continuationScore: 0.08,
    quoteFlowScore: 3,
    imbalance: -0.41,
    dumpRisk: 0.93,
    stopLossPct: 1.5,
    takeProfitPct: 15,
    trailingStopPct: 1,
    emergencyExitArmed: true,
  });

  assert.equal(decision.action, 'EMERGENCY_EXIT', 'Kondisi darurat harus override ke EMERGENCY_EXIT');
  assert.equal(decision.shouldExit, true, 'EMERGENCY_EXIT wajib close penuh');
  assert.equal(decision.closeReason, 'EMERGENCY_EXIT', 'close reason harus typed EMERGENCY_EXIT');

  console.log('emergency_exit_override_probe: ok');
}

main();
