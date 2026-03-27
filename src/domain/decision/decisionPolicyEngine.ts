import type {
  BotSettings,
  DecisionPolicyInput,
  DecisionPolicyOutput,
  OpportunityAssessment,
  RiskCheckResult,
  SignalCandidate,
} from '../../core/types';

function skip(reasons: string[], entryLane: DecisionPolicyOutput['entryLane'] = 'DEFAULT'): DecisionPolicyOutput {
  return {
    action: 'SKIP',
    sizeMultiplier: 0,
    aggressiveness: 'LOW',
    reasons,
    entryLane,
  };
}

function wait(reasons: string[], entryLane: DecisionPolicyOutput['entryLane'] = 'DEFAULT'): DecisionPolicyOutput {
  return {
    action: 'WAIT',
    sizeMultiplier: 0,
    aggressiveness: 'LOW',
    reasons,
    entryLane,
  };
}

function enter(
  reasons: string[],
  options?: {
    sizeMultiplier?: number;
    aggressiveness?: DecisionPolicyOutput['aggressiveness'];
    entryLane?: DecisionPolicyOutput['entryLane'];
  },
): DecisionPolicyOutput {
  return {
    action: 'ENTER',
    sizeMultiplier: options?.sizeMultiplier ?? 1,
    aggressiveness: options?.aggressiveness ?? 'NORMAL',
    reasons,
    entryLane: options?.entryLane ?? 'DEFAULT',
  };
}

function resolveOpportunityLane(input: DecisionPolicyInput): DecisionPolicyOutput['entryLane'] {
  if (input.recommendedAction === 'SCOUT_ENTER') {
    return 'SCOUT';
  }

  if (input.recommendedAction === 'ADD_ON_CONFIRM') {
    return 'ADD_ON_CONFIRM';
  }

  return 'DEFAULT';
}

function isWeakDiscovery(bucket: DecisionPolicyInput['discoveryBucket']): boolean {
  return bucket === 'ROTATION' || bucket === 'LIQUID_LEADER' || !bucket;
}

function resolveRegimeDecision(
  input: DecisionPolicyInput,
  entryLane: DecisionPolicyOutput['entryLane'],
): DecisionPolicyOutput | null {
  if (input.marketRegime === 'TRAP_RISK') {
    return skip(['Market regime TRAP_RISK: auto-entry diblok'], entryLane);
  }

  if (input.marketRegime === 'DISTRIBUTION') {
    return skip(['Market regime DISTRIBUTION: auto-entry diblok'], entryLane);
  }

  return null;
}

function resolveHardRiskBlock(
  input: DecisionPolicyInput,
  entryLane: DecisionPolicyOutput['entryLane'],
): DecisionPolicyOutput | null {
  if (!input.riskCheckResult) {
    return null;
  }

  if (!input.riskCheckResult.allowed) {
    return skip([
      'RiskEngine memblokir entry final',
      ...input.riskCheckResult.reasons,
    ], entryLane);
  }

  return null;
}

/**
 * Decision Policy V1 (Tahap 0C): rule-based only.
 * Single source of final decision auto-entry (tanpa ML / prediction model baru / learning loop).
 */
export function evaluateDecisionPolicyV1(input: DecisionPolicyInput): DecisionPolicyOutput {
  const entryLane = resolveOpportunityLane(input);

  const hardRiskBlocked = resolveHardRiskBlock(input, entryLane);
  if (hardRiskBlocked) {
    return hardRiskBlocked;
  }

  const regimeBlocked = resolveRegimeDecision(input, entryLane);
  if (regimeBlocked) {
    return regimeBlocked;
  }

  if (typeof input.trapProbability === 'number' && input.trapProbability >= 0.52) {
    return skip(['Trap probability tinggi untuk auto-entry'], entryLane);
  }

  if (typeof input.spoofRisk === 'number' && typeof input.spoofRiskBlockThreshold === 'number') {
    if (input.spoofRisk >= input.spoofRiskBlockThreshold) {
      return skip(['Spoof risk melewati threshold block'], entryLane);
    }
  }

  if (input.confidence < input.minConfidence) {
    return skip(['Confidence belum cukup'], entryLane);
  }

  if (input.source === 'OPPORTUNITY') {
    if (input.recommendedAction === 'AVOID') {
      return skip(['Opportunity memberi sinyal avoid'], entryLane);
    }

    if (input.edgeValid === false) {
      return skip(['Opportunity belum lolos edge validation'], entryLane);
    }

    if (
      typeof input.pumpProbability === 'number'
      && typeof input.minPumpProbability === 'number'
      && input.pumpProbability < input.minPumpProbability
    ) {
      return wait(['Pump probability belum cukup tinggi'], entryLane);
    }

    if (isWeakDiscovery(input.discoveryBucket) && input.recommendedAction === 'ENTER') {
      if (input.score < input.minScoreToBuy + 4 || input.confidence < input.minConfidence + 0.04) {
        return wait(['Discovery bucket lemah: butuh kualitas lebih tinggi'], entryLane);
      }
    }

    if (input.entryTimingState && ['LATE', 'AVOID', 'CHASING', 'DEAD'].includes(input.entryTimingState)) {
      return skip(['Timing entry tidak layak'], entryLane);
    }

    if (input.marketRegime === 'QUIET') {
      if (input.score < input.minScoreToBuy + 3) {
        return wait(['Regime QUIET: tunggu setup lebih kuat'], entryLane);
      }

      return enter(['Regime QUIET: mode defensif'], {
        sizeMultiplier: Math.min(entryLane === 'SCOUT' ? 0.22 : 0.5, input.tradingMode === 'FULL_AUTO' ? 0.5 : 0.45),
        aggressiveness: 'LOW',
        entryLane,
      });
    }

    if (input.recommendedAction === 'SCOUT_ENTER') {
      return enter(['Opportunity scout lane aktif'], {
        sizeMultiplier: 0.3,
        aggressiveness: input.marketRegime === 'EXPANSION' ? 'NORMAL' : 'LOW',
        entryLane,
      });
    }

    if (input.recommendedAction === 'ADD_ON_CONFIRM') {
      return enter(['Opportunity continuation mengizinkan add-on'], {
        sizeMultiplier: input.marketRegime === 'EXPANSION' ? 0.7 : 0.55,
        aggressiveness: input.marketRegime === 'EXPANSION' ? 'HIGH' : 'NORMAL',
        entryLane,
      });
    }

    if (input.recommendedAction !== 'ENTER') {
      return wait(['Opportunity belum memberi sinyal entry final'], entryLane);
    }
  }

  if (input.score < input.minScoreToAlert) {
    return wait(['Score masih di bawah threshold alert'], entryLane);
  }

  if (input.score < input.minScoreToBuy) {
    return wait(['Score sudah menarik tetapi belum cukup untuk entry'], entryLane);
  }

  if (input.marketRegime === 'EXPANSION') {
    return enter(['Regime EXPANSION mendukung entry agresif'], {
      sizeMultiplier: entryLane === 'SCOUT' ? 0.35 : 1.15,
      aggressiveness: input.tradingMode === 'FULL_AUTO' ? 'HIGH' : 'NORMAL',
      entryLane,
    });
  }

  return enter(['Signal memenuhi syarat entry'], {
    sizeMultiplier: entryLane === 'SCOUT' ? 0.3 : 1,
    aggressiveness: input.tradingMode === 'FULL_AUTO' ? 'HIGH' : 'NORMAL',
    entryLane,
  });
}

function buildOpportunityPolicyInput(
  opportunity: OpportunityAssessment,
  settings: BotSettings,
  riskCheckResult?: RiskCheckResult,
): DecisionPolicyInput {
  return {
    pair: opportunity.pair,
    source: 'OPPORTUNITY',
    score: opportunity.finalScore,
    confidence: opportunity.confidence,
    recommendedAction: opportunity.recommendedAction,
    edgeValid: opportunity.edgeValid,
    pumpProbability: opportunity.pumpProbability,
    trapProbability: opportunity.trapProbability,
    spoofRisk: opportunity.spoofRisk,
    marketRegime: opportunity.marketRegime,
    discoveryBucket: opportunity.discoveryBucket,
    entryTimingState: opportunity.entryTiming.state,
    minScoreToAlert: settings.strategy.minScoreToAlert,
    minScoreToBuy: settings.strategy.minScoreToBuy,
    minConfidence: settings.strategy.minConfidence,
    minPumpProbability: settings.strategy.minPumpProbability,
    spoofRiskBlockThreshold: settings.strategy.spoofRiskBlockThreshold,
    tradingMode: settings.tradingMode,
    riskCheckResult,
  };
}

function buildSignalPolicyInput(
  signal: SignalCandidate,
  settings: BotSettings,
  riskCheckResult?: RiskCheckResult,
): DecisionPolicyInput {
  return {
    pair: signal.pair,
    source: 'SIGNAL',
    score: signal.score,
    confidence: signal.confidence,
    minScoreToAlert: settings.strategy.minScoreToAlert,
    minScoreToBuy: settings.strategy.minScoreToBuy,
    minConfidence: settings.strategy.minConfidence,
    marketRegime: signal.regime,
    discoveryBucket: signal.discoveryBucket,
    spoofRisk: signal.orderbookImbalance >= 0.95 ? 1 : 0,
    tradingMode: settings.tradingMode,
    riskCheckResult,
  };
}

export function evaluateOpportunityPolicyV1(
  opportunity: OpportunityAssessment,
  settings: BotSettings,
  riskCheckResult?: RiskCheckResult,
): DecisionPolicyOutput {
  return evaluateDecisionPolicyV1(buildOpportunityPolicyInput(opportunity, settings, riskCheckResult));
}

export function evaluateSignalPolicyV1(
  signal: SignalCandidate,
  settings: BotSettings,
  riskCheckResult?: RiskCheckResult,
): DecisionPolicyOutput {
  return evaluateDecisionPolicyV1(buildSignalPolicyInput(signal, settings, riskCheckResult));
}
