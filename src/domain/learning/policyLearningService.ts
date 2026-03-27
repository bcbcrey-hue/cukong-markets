import crypto from 'node:crypto';

import type {
  BotSettings,
  DecisionPolicyEntryLane,
  PolicyEvaluationRecord,
  PolicyLearningReadModel,
  RuntimeEntryCandidate,
  StrategySettings,
  TradeOutcomeSummary,
} from '../../core/types';
import { createDefaultSettings } from '../../services/persistenceService';
import { PersistenceService } from '../../services/persistenceService';

const TUNABLE_KEYS = ['minScoreToBuy', 'minConfidence', 'minPumpProbability'] as const;
type TunableKey = (typeof TUNABLE_KEYS)[number];

const MIN_SAMPLE_GLOBAL = 6;
const MIN_SAMPLE_LANE = 4;

type BoundedRule = {
  floor: number;
  ceiling: number;
  maxDriftFromBaseline: number;
  step: number;
};

const RULES: Record<TunableKey, BoundedRule> = {
  minScoreToBuy: {
    floor: 70,
    ceiling: 85,
    maxDriftFromBaseline: 6,
    step: 1,
  },
  minConfidence: {
    floor: 0.55,
    ceiling: 0.82,
    maxDriftFromBaseline: 0.08,
    step: 0.01,
  },
  minPumpProbability: {
    floor: 0.6,
    ceiling: 0.9,
    maxDriftFromBaseline: 0.08,
    step: 0.01,
  },
};

const TUNING_ELIGIBLE_ACCURACY = new Set(['CONFIRMED_LIVE', 'PARTIAL_LIVE']);

function toFixedStep(value: number, step: number): number {
  if (step >= 1) {
    return Math.round(value);
  }

  return Number(value.toFixed(2));
}

function clampTunableValue(
  key: TunableKey,
  candidate: number,
  baseline: number,
): number {
  const rule = RULES[key];
  const withAbsoluteBounds = Math.min(rule.ceiling, Math.max(rule.floor, candidate));
  const boundedByDrift = Math.min(
    baseline + rule.maxDriftFromBaseline,
    Math.max(baseline - rule.maxDriftFromBaseline, withAbsoluteBounds),
  );

  return toFixedStep(boundedByDrift, rule.step);
}

function laneKey(
  record: PolicyEvaluationRecord,
): DecisionPolicyEntryLane {
  return record.finalDecision.entryLane;
}

export class PolicyLearningService {
  private readonly baselineStrategy: Pick<
    StrategySettings,
    'minScoreToBuy' | 'minConfidence' | 'minPumpProbability'
  >;

  constructor(
    private readonly persistence: PersistenceService,
  ) {
    const baseline = createDefaultSettings().strategy;
    this.baselineStrategy = {
      minScoreToBuy: baseline.minScoreToBuy,
      minConfidence: baseline.minConfidence,
      minPumpProbability: baseline.minPumpProbability,
    };
  }

  async recordPolicyEntry(
    candidate: RuntimeEntryCandidate,
    settings: BotSettings,
    accountId: string,
  ): Promise<PolicyEvaluationRecord> {
    const records = await this.persistence.readPolicyEvaluations();

    const record: PolicyEvaluationRecord = {
      id: crypto.randomUUID(),
      pair: candidate.pair,
      accountId,
      entryDecisionAt: new Date().toISOString(),
      context: {
        score: candidate.opportunity.finalScore,
        confidence: candidate.opportunity.confidence,
        marketRegime: candidate.opportunity.marketRegime,
        discoveryBucket: candidate.opportunity.discoveryBucket,
        recommendedAction: candidate.opportunity.recommendedAction,
        entryTimingState: candidate.opportunity.entryTiming.state,
        pumpProbability: candidate.opportunity.pumpProbability,
        trapProbability: candidate.opportunity.trapProbability,
        spoofRisk: candidate.opportunity.spoofRisk,
        riskAllowed: candidate.riskCheckResult.allowed,
        riskReasonCount: candidate.riskCheckResult.reasons.length,
      },
      finalDecision: {
        ...candidate.policyDecision,
      },
      policyParams: {
        minScoreToBuy: settings.strategy.minScoreToBuy,
        minConfidence: settings.strategy.minConfidence,
        minPumpProbability: settings.strategy.minPumpProbability,
        spoofRiskBlockThreshold: settings.strategy.spoofRiskBlockThreshold,
      },
      status: 'PENDING_OUTCOME',
    };

    await this.persistence.savePolicyEvaluations([...records, record]);
    return record;
  }

  async resolveOutcomesWithEvaluations(): Promise<{
    linked: number;
    totalRecords: number;
    resolvedSamples: number;
    eligibleSamples: number;
    pendingSamples: number;
  }> {
    const records = await this.persistence.readPolicyEvaluations();
    const outcomes = await this.persistence.readTradeOutcomes();
    const usedOutcomeIds = new Set(
      records
        .filter((record) => record.status === 'RESOLVED' && record.resolution)
        .map((record) => record.resolution?.outcomeId)
        .filter((id): id is string => Boolean(id)),
    );

    let linked = 0;
    const updated = [...records].sort(
      (a, b) => new Date(a.entryDecisionAt).getTime() - new Date(b.entryDecisionAt).getTime(),
    );

    for (const record of updated) {
      if (record.status !== 'PENDING_OUTCOME') {
        continue;
      }

      const match = outcomes
        .filter((outcome) => !usedOutcomeIds.has(outcome.id))
        .filter((outcome) => outcome.pair === record.pair && outcome.accountId === record.accountId)
        .find((outcome) => new Date(outcome.timestamp).getTime() >= new Date(record.entryDecisionAt).getTime());

      if (!match) {
        continue;
      }

      const eligibleForTuning = TUNING_ELIGIBLE_ACCURACY.has(match.accuracy);
      record.status = 'RESOLVED';
      record.resolution = {
        outcomeId: match.id,
        outcomeAccuracy: match.accuracy,
        outcomeNetPnl: match.netPnl,
        outcomeReturnPct: match.returnPercentage,
        closeReason: match.closeReason,
        resolvedAt: new Date().toISOString(),
        eligibleForTuning,
        ineligibleReason: eligibleForTuning
          ? undefined
          : `accuracy ${match.accuracy} tidak eligible untuk tuning aktif`,
      };
      usedOutcomeIds.add(match.id);
      linked += 1;
    }

    if (linked > 0) {
      await this.persistence.savePolicyEvaluations(updated);
    }

    const resolved = updated.filter((item) => item.status === 'RESOLVED');
    const eligible = resolved.filter((item) => item.resolution?.eligibleForTuning);

    return {
      linked,
      totalRecords: updated.length,
      resolvedSamples: resolved.length,
      eligibleSamples: eligible.length,
      pendingSamples: updated.length - resolved.length,
    };
  }

  private laneSample(records: PolicyEvaluationRecord[]): Record<DecisionPolicyEntryLane, number> {
    return {
      DEFAULT: records.filter((item) => laneKey(item) === 'DEFAULT').length,
      SCOUT: records.filter((item) => laneKey(item) === 'SCOUT').length,
      ADD_ON_CONFIRM: records.filter((item) => laneKey(item) === 'ADD_ON_CONFIRM').length,
    };
  }

  async runConservativeLearningCycle(settings: BotSettings): Promise<PolicyLearningReadModel> {
    const records = await this.persistence.readPolicyEvaluations();
    const resolvedRecords = records.filter((item) => item.status === 'RESOLVED');
    const eligibleRecords = resolvedRecords.filter((item) => item.resolution?.eligibleForTuning);
    const now = new Date().toISOString();

    const laneSample = this.laneSample(eligibleRecords);

    if (eligibleRecords.length < MIN_SAMPLE_GLOBAL) {
      return {
        lastEvaluatedAt: now,
        totalRecords: records.length,
        resolvedSamples: resolvedRecords.length,
        eligibleSamples: eligibleRecords.length,
        tuned: false,
        noOpReason: `sample belum cukup (eligible=${eligibleRecords.length}, minimal=${MIN_SAMPLE_GLOBAL})`,
        reasons: ['learning no-op: minimum sample gate tidak terpenuhi'],
        changes: [],
        laneSample,
      };
    }

    const wins = eligibleRecords.filter((item) => (item.resolution?.outcomeNetPnl ?? 0) > 0).length;
    const winRate = wins / eligibleRecords.length;
    const avgReturn = eligibleRecords.reduce((sum, item) => sum + (item.resolution?.outcomeReturnPct ?? 0), 0) / eligibleRecords.length;

    const reasons = [
      `eligible=${eligibleRecords.length}`,
      `winRate=${(winRate * 100).toFixed(1)}%`,
      `avgReturn=${avgReturn.toFixed(2)}%`,
    ];

    const poorPerformance = winRate <= 0.38;
    const strongPerformance = winRate >= 0.62 && avgReturn >= 0.35;

    if (!poorPerformance && !strongPerformance) {
      return {
        lastEvaluatedAt: now,
        totalRecords: records.length,
        resolvedSamples: resolvedRecords.length,
        eligibleSamples: eligibleRecords.length,
        tuned: false,
        noOpReason: 'sinyal evaluasi belum cukup kuat untuk tuning konservatif',
        reasons,
        changes: [],
        laneSample,
      };
    }

    const scoutSampleEnough = laneSample.SCOUT >= MIN_SAMPLE_LANE;
    const scoutWinRate = scoutSampleEnough
      ? eligibleRecords
          .filter((item) => laneKey(item) === 'SCOUT')
          .filter((item) => (item.resolution?.outcomeNetPnl ?? 0) > 0).length / laneSample.SCOUT
      : null;

    const direction = poorPerformance ? 1 : -1;
    const laneBiasExtra =
      scoutSampleEnough && scoutWinRate !== null && ((poorPerformance && scoutWinRate <= 0.35) || (strongPerformance && scoutWinRate >= 0.65))
        ? 1
        : 0;

    const nextStrategy = {
      minScoreToBuy: settings.strategy.minScoreToBuy,
      minConfidence: settings.strategy.minConfidence,
      minPumpProbability: settings.strategy.minPumpProbability,
    };

    for (const key of TUNABLE_KEYS) {
      const rule = RULES[key];
      const stepCount = 1 + laneBiasExtra;
      const candidate = nextStrategy[key] + direction * rule.step * stepCount;
      nextStrategy[key] = clampTunableValue(key, candidate, this.baselineStrategy[key]);
    }

    const changes = TUNABLE_KEYS
      .map((key) => ({
        key,
        before: settings.strategy[key],
        after: nextStrategy[key],
        delta: toFixedStep(nextStrategy[key] - settings.strategy[key], RULES[key].step),
      }))
      .filter((item) => Math.abs(item.delta) > 1e-9);

    if (changes.length === 0) {
      return {
        lastEvaluatedAt: now,
        totalRecords: records.length,
        resolvedSamples: resolvedRecords.length,
        eligibleSamples: eligibleRecords.length,
        tuned: false,
        noOpReason: 'hasil tuning bounded menjadi no-op (sudah menyentuh batas floor/ceiling/drift)',
        reasons,
        changes: [],
        laneSample,
      };
    }

    return {
      lastEvaluatedAt: now,
      totalRecords: records.length,
      resolvedSamples: resolvedRecords.length,
      eligibleSamples: eligibleRecords.length,
      tuned: true,
      reasons: [
        ...reasons,
        poorPerformance ? 'mode=tighten' : 'mode=relax-conservative',
        laneBiasExtra > 0 ? 'lane-signal=SCOUT sample cukup, step ditambah 1' : 'lane-signal tidak menambah step',
      ],
      changes,
      laneSample,
    };
  }

  async findOutcomeByEvaluationId(evaluationId: string): Promise<TradeOutcomeSummary | null> {
    const records = await this.persistence.readPolicyEvaluations();
    const record = records.find((item) => item.id === evaluationId);
    if (!record?.resolution?.outcomeId) {
      return null;
    }

    const outcomes = await this.persistence.readTradeOutcomes();
    return outcomes.find((outcome) => outcome.id === record.resolution?.outcomeId) ?? null;
  }
}
