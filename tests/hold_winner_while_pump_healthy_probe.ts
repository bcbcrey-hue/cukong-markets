import assert from 'node:assert/strict';

import { ExitDecisionEngine } from '../src/domain/intelligence/exitDecisionEngine';

function main() {
  const engine = new ExitDecisionEngine();
  const decision = engine.decide({
    pnlPct: 18,
    peakPnlPct: 19,
    spreadPct: 0.2,
    retraceFromPeakPct: 4,
    continuationScore: 0.72,
    quoteFlowScore: 33,
    imbalance: 0.18,
    dumpRisk: 0.22,
    stopLossPct: 1.5,
    takeProfitPct: 15,
    trailingStopPct: 1,
    emergencyExitArmed: false,
  });

  assert.equal(decision.action, 'HOLD', 'Winner sehat harus HOLD walau TP sudah tercapai');
  assert.equal(decision.shouldExit, false, 'HOLD tidak boleh force full exit');
  assert.equal(decision.shouldScaleOut, false, 'HOLD tidak boleh auto scale-out');

  console.log('hold_winner_while_pump_healthy_probe: ok');
}

main();
