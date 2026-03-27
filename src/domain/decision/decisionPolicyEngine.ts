import type {
  DecisionPolicyInput,
  DecisionPolicyOutput,
} from '../../core/types';

/**
 * Decision Policy V1 (Tahap 0B): rule-based only.
 * No ML, no prediction model baru, no learning loop.
 */
export function evaluateDecisionPolicyV1(input: DecisionPolicyInput): DecisionPolicyOutput {
  const blockedByTradingMode = input.tradingMode === 'OFF';
  if (blockedByTradingMode) {
    return {
      action: 'SKIP',
      sizeMultiplier: 0,
      aggressiveness: 'LOW',
      reasons: ['Trading mode OFF'],
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
  }

  return {
    action: 'ENTER',
    sizeMultiplier: 1,
    aggressiveness: input.tradingMode === 'FULL_AUTO' ? 'HIGH' : 'NORMAL',
    reasons: ['Signal memenuhi syarat entry'],
    entryLane: 'DEFAULT',
  };
}
