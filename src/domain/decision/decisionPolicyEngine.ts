import type {
  BotSettings,
  DecisionPolicyInput,
  DecisionPolicyOutput,
  OpportunityAssessment,
  SignalCandidate,
} from '../../core/types';

/**
 * Decision Policy V1 (Tahap 0B): rule-based only.
 * No ML, no prediction model baru, no learning loop.
 */
export function evaluateDecisionPolicyV1(input: DecisionPolicyInput): DecisionPolicyOutput {
  if (input.confidence < input.minConfidence) {
    return {
      action: 'SKIP',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['Confidence belum cukup'],
      entryLane: 'DEFAULT',
    };
  }

  if (input.source === 'OPPORTUNITY') {
    if (input.recommendedAction === 'AVOID') {
      return {
        action: 'SKIP',
        sizeMultiplier: 0,
        aggressiveness: 'LOW',
        reasons: ['Opportunity memberi sinyal avoid'],
        entryLane: 'DEFAULT',
      };
    }

    if (input.recommendedAction === 'SCOUT_ENTER') {
      return {
        action: 'ENTER',
        sizeMultiplier: 0.3,
        aggressiveness: 'LOW',
        reasons: ['Opportunity scout lane aktif'],
        entryLane: 'SCOUT',
      };
    }

    if (input.recommendedAction === 'ADD_ON_CONFIRM') {
      return {
        action: 'ENTER',
        sizeMultiplier: 0.55,
        aggressiveness: 'NORMAL',
        reasons: ['Opportunity continuation mengizinkan add-on'],
        entryLane: 'ADD_ON_CONFIRM',
      };
    }

    if (input.edgeValid === false) {
      return {
        action: 'SKIP',
        sizeMultiplier: 0,
        aggressiveness: 'LOW',
        reasons: ['Opportunity belum lolos edge validation'],
        entryLane: 'DEFAULT',
      };
    }

    if (
      typeof input.pumpProbability === 'number'
      && typeof input.minPumpProbability === 'number'
      && input.pumpProbability < input.minPumpProbability
    ) {
      return {
        action: 'WAIT',
        sizeMultiplier: 0,
        aggressiveness: 'LOW',
        reasons: ['Pump probability belum cukup tinggi'],
        entryLane: 'DEFAULT',
      };
    }

    if (input.recommendedAction === 'ENTER') {
      if (input.score < input.minScoreToAlert) {
        return {
          action: 'WAIT',
          sizeMultiplier: 0,
          aggressiveness: 'LOW',
          reasons: ['Score masih di bawah threshold alert'],
          entryLane: 'DEFAULT',
        };
      }

      return {
        action: 'ENTER',
        sizeMultiplier: 1,
        aggressiveness: input.tradingMode === 'FULL_AUTO' ? 'HIGH' : 'NORMAL',
        reasons: ['Opportunity memenuhi syarat entry'],
        entryLane: 'DEFAULT',
      };
    }

    return {
      action: 'WAIT',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['Opportunity belum memberi sinyal entry final'],
      entryLane: 'DEFAULT',
    };
  }

  if (input.score < input.minScoreToAlert) {
    return {
      action: 'WAIT',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['Score masih di bawah threshold alert'],
      entryLane: 'DEFAULT',
    };
  }

  if (input.score < input.minScoreToBuy) {
    return {
      action: 'WAIT',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['Score sudah menarik tetapi belum cukup untuk entry'],
      entryLane: 'DEFAULT',
    };
  }

  return {
    action: 'ENTER',
    sizeMultiplier: 1,
    aggressiveness: input.tradingMode === 'FULL_AUTO' ? 'HIGH' : 'NORMAL',
    reasons: ['Signal memenuhi syarat entry'],
    entryLane: 'DEFAULT',
  };
}

function buildOpportunityPolicyInput(
  opportunity: OpportunityAssessment,
  settings: BotSettings,
): DecisionPolicyInput {
  return {
    pair: opportunity.pair,
    source: 'OPPORTUNITY',
    score: opportunity.finalScore,
    confidence: opportunity.confidence,
    recommendedAction: opportunity.recommendedAction,
    edgeValid: opportunity.edgeValid,
    pumpProbability: opportunity.pumpProbability,
    minScoreToAlert: settings.strategy.minScoreToAlert,
    minScoreToBuy: settings.strategy.minScoreToBuy,
    minConfidence: settings.strategy.minConfidence,
    minPumpProbability: settings.strategy.minPumpProbability,
    tradingMode: settings.tradingMode,
  };
}

function buildSignalPolicyInput(
  signal: SignalCandidate,
  settings: BotSettings,
): DecisionPolicyInput {
  return {
    pair: signal.pair,
    source: 'SIGNAL',
    score: signal.score,
    confidence: signal.confidence,
    minScoreToAlert: settings.strategy.minScoreToAlert,
    minScoreToBuy: settings.strategy.minScoreToBuy,
    minConfidence: settings.strategy.minConfidence,
    tradingMode: settings.tradingMode,
  };
}

export function applyOpportunityPostPolicyVeto(
  opportunity: OpportunityAssessment,
  policyDecision: DecisionPolicyOutput,
): DecisionPolicyOutput {
  if (['LATE', 'AVOID', 'CHASING', 'DEAD'].includes(opportunity.entryTiming.state)) {
    return {
      action: 'SKIP',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['Timing entry tidak layak'],
      entryLane: policyDecision.entryLane,
    };
  }

  return policyDecision;
}

export function evaluateOpportunityPolicyV1(
  opportunity: OpportunityAssessment,
  settings: BotSettings,
): DecisionPolicyOutput {
  const baseDecision = evaluateDecisionPolicyV1(buildOpportunityPolicyInput(opportunity, settings));
  return applyOpportunityPostPolicyVeto(opportunity, baseDecision);
}

export function evaluateSignalPolicyV1(
  signal: SignalCandidate,
  settings: BotSettings,
): DecisionPolicyOutput {
  return evaluateDecisionPolicyV1(buildSignalPolicyInput(signal, settings));
}
