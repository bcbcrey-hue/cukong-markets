import type { ExitDecisionInput, ExitDecisionResult } from '../../core/types';

function isHealthyContinuation(input: ExitDecisionInput): boolean {
  return (
    input.continuationScore >= 0.55
    && input.quoteFlowScore >= 20
    && input.imbalance >= 0.05
    && input.dumpRisk < 0.45
    && input.retraceFromPeakPct < 25
  );
}

export class ExitDecisionEngine {
  decide(input: ExitDecisionInput): ExitDecisionResult {
    const rationale: string[] = [];

    if (
      input.dumpRisk >= 0.92
      || input.spreadPct >= 2.2
      || input.retraceFromPeakPct >= 45
      || (input.continuationScore < 0.12 && input.imbalance <= -0.35)
      || (input.emergencyExitArmed && input.retraceFromPeakPct >= 35)
    ) {
      rationale.push('Emergency override: market tidak aman di-hold');
      return {
        action: 'EMERGENCY_EXIT',
        shouldExit: true,
        shouldScaleOut: false,
        closeFraction: 1,
        closeReason: 'EMERGENCY_EXIT',
        rationale,
      };
    }

    if (input.pnlPct <= -Math.abs(input.stopLossPct)) {
      rationale.push('Stop guard rail terlewati');
      return {
        action: 'DUMP_EXIT',
        shouldExit: true,
        shouldScaleOut: false,
        closeFraction: 1,
        closeReason: 'DUMP_EXIT',
        rationale,
      };
    }

    if (
      input.pnlPct > 0
      && (
        input.continuationScore < 0.32
        || input.quoteFlowScore < 8
        || input.imbalance < -0.08
        || input.dumpRisk >= 0.7
      )
    ) {
      rationale.push('Distribusi/dump risk naik saat profit');
      return {
        action: 'DUMP_EXIT',
        shouldExit: true,
        shouldScaleOut: false,
        closeFraction: 1,
        closeReason: 'DUMP_EXIT',
        rationale,
      };
    }

    const trailingTrigger = input.takeProfitPct * 0.7;
    const trailingFloorPct = input.peakPnlPct - Math.abs(input.trailingStopPct);
    if (input.peakPnlPct >= trailingTrigger && input.pnlPct < trailingFloorPct) {
      rationale.push('Trailing guard rail terpicu');
      return {
        action: 'TAKE_PROFIT_EXIT',
        shouldExit: true,
        shouldScaleOut: false,
        closeFraction: 1,
        closeReason: 'TAKE_PROFIT_EXIT',
        rationale,
      };
    }

    if (input.pnlPct >= input.takeProfitPct) {
      if (isHealthyContinuation(input)) {
        rationale.push('Winner sehat: tahan posisi');
        return {
          action: 'HOLD',
          shouldExit: false,
          shouldScaleOut: false,
          closeFraction: 0,
          rationale,
        };
      }

      if (
        input.continuationScore >= 0.4
        && input.dumpRisk < 0.62
        && input.retraceFromPeakPct < 33
      ) {
        rationale.push('Momentum melemah: scale-out ringan');
        return {
          action: 'SCALE_OUT',
          shouldExit: false,
          shouldScaleOut: true,
          closeFraction: 0.35,
          closeReason: 'SCALE_OUT',
          rationale,
        };
      }

      rationale.push('TP tercapai + continuation rusak');
      return {
        action: 'TAKE_PROFIT_EXIT',
        shouldExit: true,
        shouldScaleOut: false,
        closeFraction: 1,
        closeReason: 'TAKE_PROFIT_EXIT',
        rationale,
      };
    }

    rationale.push('Belum ada sinyal exit kuat');
    return {
      action: 'HOLD',
      shouldExit: false,
      shouldScaleOut: false,
      closeFraction: 0,
      rationale,
    };
  }
}
