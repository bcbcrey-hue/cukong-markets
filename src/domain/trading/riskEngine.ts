import type {
  BotSettings,
  OpportunityAssessment,
  PositionRecord,
  RiskCheckResult,
  SignalCandidate,
  StoredAccount,
} from '../../core/types';

export interface RiskEntryCheckInput {
  account: StoredAccount;
  settings: BotSettings;
  signal: SignalCandidate | OpportunityAssessment;
  openPositions: PositionRecord[];
  amountIdr: number;
  cooldownUntil?: number | null;
}

export interface ExitDecision {
  shouldExit: boolean;
  reason?: 'TAKE_PROFIT' | 'STOP_LOSS' | 'TRAILING_STOP';
}

function pctChange(from: number, to: number): number {
  if (from <= 0) {
    return 0;
  }

  return ((to - from) / from) * 100;
}

export class RiskEngine {
  private getPair(signal: SignalCandidate | OpportunityAssessment): string {
    return signal.pair;
  }

  private getScore(signal: SignalCandidate | OpportunityAssessment): number {
    return 'finalScore' in signal ? signal.finalScore : signal.score;
  }

  private getConfidence(signal: SignalCandidate | OpportunityAssessment): number {
    return signal.confidence;
  }

  private getSpread(signal: SignalCandidate | OpportunityAssessment): number {
    return signal.spreadPct;
  }

  private getSpoofRisk(signal: SignalCandidate | OpportunityAssessment): number {
    if ('spoofRisk' in signal) {
      return signal.spoofRisk;
    }

    return signal.orderbookImbalance >= 0.95 ? 1 : 0;
  }

  checkCanEnter(input: RiskEntryCheckInput): RiskCheckResult {
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (!input.account.enabled) {
      reasons.push('Account nonaktif');
    }

    if (this.getScore(input.signal) < input.settings.strategy.minScoreToBuy) {
      reasons.push('Score di bawah minimum buy');
    }

    if (this.getConfidence(input.signal) < input.settings.strategy.minConfidence) {
      reasons.push('Confidence di bawah minimum');
    }

    if (this.getSpread(input.signal) > input.settings.risk.maxPairSpreadPct) {
      reasons.push('Spread pair melebihi batas risiko');
    }

    if (input.amountIdr > input.settings.risk.maxPositionSizeIdr) {
      reasons.push('Ukuran posisi melebihi batas');
    }

    if (input.openPositions.length >= input.settings.risk.maxOpenPositions) {
      reasons.push('Jumlah posisi terbuka mencapai batas');
    }

    const samePairOpen = input.openPositions.some(
      (item) => item.pair === this.getPair(input.signal),
    );
    if (samePairOpen) {
      reasons.push('Masih ada posisi terbuka pada pair yang sama');
    }

    if (
      input.cooldownUntil &&
      Number.isFinite(input.cooldownUntil) &&
      input.cooldownUntil > Date.now()
    ) {
      reasons.push('Pair masih cooldown');
    }

    if (!('finalScore' in input.signal) && input.signal.orderbookImbalance < 0) {
      warnings.push('Orderbook belum mendukung bias buy');
    }

    if (!('finalScore' in input.signal) && input.signal.breakoutPressure < 5) {
      warnings.push('Breakout pressure masih lemah');
    }

    if ('finalScore' in input.signal) {
      if (!input.signal.edgeValid) {
        reasons.push('Opportunity belum lolos edge validation');
      }

      if (input.signal.pumpProbability < input.settings.strategy.minPumpProbability) {
        reasons.push('Pump probability di bawah minimum auto entry');
      }

      if (input.signal.entryTiming.state === 'LATE' || input.signal.entryTiming.state === 'AVOID') {
        reasons.push('Timing entry tidak layak');
      }

      if (input.signal.trapProbability >= 0.45) {
        warnings.push('Trap probability relatif tinggi');
      }
    }

    if (
      input.settings.strategy.useAntiSpoof &&
      this.getSpoofRisk(input.signal) >= input.settings.strategy.spoofRiskBlockThreshold
    ) {
      reasons.push('Spoof/trap risk threshold terlewati');
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      warnings,
    };
  }

  evaluateExit(
    position: PositionRecord,
    settings: BotSettings,
  ): ExitDecision {
    if (position.status === 'CLOSED') {
      return { shouldExit: false };
    }

    const pnlPct = pctChange(position.averageEntryPrice, position.currentPrice);

    if (
      position.takeProfitPrice !== null &&
      position.currentPrice >= position.takeProfitPrice
    ) {
      return { shouldExit: true, reason: 'TAKE_PROFIT' };
    }

    if (
      position.stopLossPrice !== null &&
      position.currentPrice <= position.stopLossPrice
    ) {
      return { shouldExit: true, reason: 'STOP_LOSS' };
    }

    if (pnlPct >= settings.risk.takeProfitPct) {
      return { shouldExit: true, reason: 'TAKE_PROFIT' };
    }

    if (pnlPct <= -Math.abs(settings.risk.stopLossPct)) {
      return { shouldExit: true, reason: 'STOP_LOSS' };
    }

    const trailingTrigger = settings.risk.takeProfitPct * 0.7;
    if (
      pnlPct >= trailingTrigger &&
      pnlPct <= Math.max(0, trailingTrigger - settings.risk.trailingStopPct)
    ) {
      return { shouldExit: true, reason: 'TRAILING_STOP' };
    }

    return { shouldExit: false };
  }

  buildStops(
    entryPrice: number,
    settings: BotSettings,
  ): {
    stopLossPrice: number | null;
    takeProfitPrice: number | null;
  } {
    if (entryPrice <= 0) {
      return {
        stopLossPrice: null,
        takeProfitPrice: null,
      };
    }

    return {
      stopLossPrice: entryPrice * (1 - settings.risk.stopLossPct / 100),
      takeProfitPrice: entryPrice * (1 + settings.risk.takeProfitPct / 100),
    };
  }
}
