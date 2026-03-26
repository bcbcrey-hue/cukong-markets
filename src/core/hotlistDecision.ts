import type { HotlistEntry, OpportunityAssessment } from './types';

export type HotlistUiStatus = 'READY' | 'WATCH' | 'CAUTION' | 'BLOCKED';

export interface HotlistUiDecision {
  status: HotlistUiStatus;
  canManualBuy: boolean;
  reason: string;
}

type HotlistDecisionInput = Pick<HotlistEntry | OpportunityAssessment, 'recommendedAction' | 'edgeValid' | 'entryTiming' | 'warnings' | 'reasons'>;

export function isHotlistEntryActionable(input: HotlistDecisionInput): boolean {
  return input.edgeValid && ['ENTER', 'SCOUT_ENTER', 'ADD_ON_CONFIRM'].includes(input.recommendedAction);
}

export function evaluateHotlistUiDecision(input: HotlistDecisionInput): HotlistUiDecision {
  if (!input.edgeValid) {
    return {
      status: 'BLOCKED',
      canManualBuy: false,
      reason: input.warnings[0] ?? input.reasons[0] ?? 'edgeValid=false',
    };
  }

  if (input.recommendedAction === 'AVOID') {
    return {
      status: 'BLOCKED',
      canManualBuy: false,
      reason: input.entryTiming.reason || 'recommendedAction=AVOID',
    };
  }

  if (
    input.recommendedAction === 'ENTER' ||
    input.recommendedAction === 'SCOUT_ENTER' ||
    input.recommendedAction === 'ADD_ON_CONFIRM'
  ) {
    return {
      status: 'READY',
      canManualBuy: true,
      reason: 'entry ready; tetap disiplin sizing & risiko',
    };
  }

  if (input.recommendedAction === 'CONFIRM_ENTRY' || input.recommendedAction === 'PREPARE_ENTRY') {
    return {
      status: 'CAUTION',
      canManualBuy: false,
      reason: input.entryTiming.reason || `recommendedAction=${input.recommendedAction}`,
    };
  }

  return {
    status: 'WATCH',
    canManualBuy: false,
    reason: input.entryTiming.reason || 'recommendedAction=WATCH',
  };
}
