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
type EntryLane = 'DEFAULT' | 'SCOUT' | 'ADD_ON_CONFIRM';

function pctChange(from: number, to: number): number {
  if (from <= 0) {
    return 0;
  }

  return ((to - from) / from) * 100;
}

export class RiskEngine {
  resolveLaneAdjustedAmountIdr(input: RiskEntryCheckInput): {
    lane: EntryLane;
    baseAmountIdr: number;
    adjustedAmountIdr: number;
  } {
    const baseAmountIdr = input.amountIdr;
    const signal = 'finalScore' in input.signal ? input.signal : null;
    const action = signal?.recommendedAction;
    let lane: EntryLane = 'DEFAULT';
    let multiplier = 1;

    if (action === 'SCOUT_ENTER') {
      lane = 'SCOUT';
      multiplier = 0.3;
    } else if (action === 'ADD_ON_CONFIRM') {
      lane = 'ADD_ON_CONFIRM';
      multiplier = 0.55;
    }

    return {
      lane,
      baseAmountIdr,
      adjustedAmountIdr: Math.max(0, baseAmountIdr * multiplier),
    };
  }

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

  private getEntryReferencePrice(signal: SignalCandidate | OpportunityAssessment): number {
    if ('referencePrice' in signal) {
      return signal.bestAsk > 0 ? signal.bestAsk : signal.referencePrice;
    }

    return signal.bestAsk > 0 ? signal.bestAsk : signal.marketPrice;
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
    const plan = this.resolveLaneAdjustedAmountIdr(input);
    const signal = 'finalScore' in input.signal ? input.signal : null;
    const accountScopedOpenPositions = input.openPositions.filter(
      (item) => item.accountId === input.account.id,
    );
    const laneSpreadTolerance = plan.lane === 'SCOUT' ? 1.35 : 1;
    const laneCooldownTolerance = plan.lane === 'SCOUT' ? 0.45 : 1;
    const laneSpoofTolerance =
      plan.lane === 'SCOUT' ? input.settings.strategy.spoofRiskBlockThreshold + 0.08 : input.settings.strategy.spoofRiskBlockThreshold;

    if (!input.account.enabled) {
      reasons.push('Account nonaktif');
    }

    if (!Number.isFinite(plan.adjustedAmountIdr) || plan.adjustedAmountIdr <= 0) {
      reasons.push('Ukuran posisi tidak valid');
    }

    if (!Number.isFinite(this.getEntryReferencePrice(input.signal)) || this.getEntryReferencePrice(input.signal) <= 0) {
      reasons.push('Harga referensi signal tidak valid');
    }

    if (this.getScore(input.signal) < input.settings.strategy.minScoreToBuy) {
      reasons.push('Score di bawah minimum buy');
    }

    if (this.getConfidence(input.signal) < input.settings.strategy.minConfidence) {
      reasons.push('Confidence di bawah minimum');
    }

    if (this.getSpread(input.signal) > input.settings.risk.maxPairSpreadPct * laneSpreadTolerance) {
      reasons.push('Spread pair melebihi batas risiko');
    }

    if (plan.adjustedAmountIdr > input.settings.risk.maxPositionSizeIdr) {
      reasons.push('Ukuran posisi melebihi batas');
    }

    if (accountScopedOpenPositions.length >= input.settings.risk.maxOpenPositions) {
      reasons.push('Jumlah posisi terbuka mencapai batas');
    }

    const openSamePairPositions = accountScopedOpenPositions.filter(
      (item) => item.pair === this.getPair(input.signal),
    );
    const samePairOpen = openSamePairPositions.length > 0;
    if (samePairOpen && plan.lane !== 'ADD_ON_CONFIRM') {
      reasons.push('Masih ada posisi terbuka pada pair yang sama');
    }

    if (
      input.cooldownUntil &&
      Number.isFinite(input.cooldownUntil) &&
      input.cooldownUntil > Date.now() + input.settings.risk.cooldownMs * (1 - laneCooldownTolerance)
    ) {
      reasons.push('Pair masih cooldown');
    }

    if (!('finalScore' in input.signal) && input.signal.orderbookImbalance < 0) {
      warnings.push('Orderbook belum mendukung bias buy');
    }

    if (!('finalScore' in input.signal) && input.signal.breakoutPressure < 5) {
      warnings.push('Breakout pressure masih lemah');
    }

    if (signal) {
      if (!signal.edgeValid) {
        reasons.push('Opportunity belum lolos edge validation');
      }

      if (signal.pumpProbability < input.settings.strategy.minPumpProbability * (plan.lane === 'SCOUT' ? 0.9 : 1)) {
        reasons.push('Pump probability di bawah minimum auto entry');
      }

      if (['LATE', 'AVOID', 'CHASING', 'DEAD'].includes(signal.entryTiming.state)) {
        reasons.push('Timing entry tidak layak');
      }

      if (signal.trapProbability >= (plan.lane === 'SCOUT' ? 0.7 : 0.45)) {
        warnings.push('Trap probability relatif tinggi');
      }

      if (plan.lane === 'SCOUT' && signal.trapProbability >= 0.78) {
        reasons.push('Trap probability ekstrem untuk scout lane');
      }

      if (plan.lane === 'ADD_ON_CONFIRM') {
        if (openSamePairPositions.length === 0) {
          reasons.push('Add-on confirm butuh posisi aktif pair yang sama');
        }
        if (signal.continuationProbability < 0.58) {
          reasons.push('Continuation tidak cukup kuat untuk add-on confirm');
        }
        if (signal.change1m > 1.7 || signal.change5m > 4.2) {
          reasons.push('Harga sudah overextended untuk add-on confirm');
        }
        if (signal.quoteFlowAccelerationScore < 18 || signal.orderbookImbalance < 0.05) {
          reasons.push('Bid persistence/ask vacuum tidak mendukung add-on');
        }
      }
    }

    if (
      input.settings.strategy.useAntiSpoof &&
      this.getSpoofRisk(input.signal) >= laneSpoofTolerance
    ) {
      reasons.push('Spoof/trap risk threshold terlewati');
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      warnings,
      entryLane: plan.lane,
      baseAmountIdr: plan.baseAmountIdr,
      adjustedAmountIdr: plan.adjustedAmountIdr,
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
    const peakPrice = position.peakPrice ?? position.currentPrice;
    const peakPnlPct = pctChange(position.averageEntryPrice, peakPrice);

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
    const trailingFloorPct = peakPnlPct - Math.abs(settings.risk.trailingStopPct);

    if (peakPnlPct >= trailingTrigger && pnlPct <= trailingFloorPct) {
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
