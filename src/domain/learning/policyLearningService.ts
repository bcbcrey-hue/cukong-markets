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

function laneKey(record: PolicyEvaluationRecord): DecisionPolicyEntryLane {
  return record.finalDecision.entryLane;
}

function fingerprintEligibleOutcomeIds(outcomeIds: string[]): string {
  const canonical = [...new Set(outcomeIds)].sort().join('|');
  return crypto.createHash('sha1').update(canonical).digest('hex');
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

  async recordAutoEntryExecution(
    candidate: RuntimeEntryCandidate,
    settings: BotSettings,
    accountId: string,
    orderId: string,
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
      executionAnchor: {
        orderId,
        source: 'AUTO_RUNTIME_POLICY',
      },
      status: 'PENDING_EXECUTION',
      statusReason: 'order tercipta, menunggu anchor position lifecycle',
    };

    await this.persistence.savePolicyEvaluations([...records, record]);
    return record;
  }

  private async patchByOrderId(
    orderId: string,
    updater: (record: PolicyEvaluationRecord) => PolicyEvaluationRecord,
  ): Promise<number> {
    const records = await this.persistence.readPolicyEvaluations();
    let changed = 0;
    const next = records.map((record) => {
      if (record.executionAnchor?.orderId !== orderId) {
        return record;
      }
      changed += 1;
      return updater(record);
    });

    if (changed > 0) {
      await this.persistence.savePolicyEvaluations(next);
    }

    return changed;
  }

  async markExecutionAnchoredByOrder(orderId: string, positionId: string): Promise<number> {
    return this.patchByOrderId(orderId, (record) => ({
      ...record,
      executionAnchor: {
        ...record.executionAnchor,
        orderId,
        positionId,
        source: 'AUTO_RUNTIME_POLICY',
      },
      status: 'PENDING_OUTCOME',
      statusReason: 'anchor lifecycle position valid, menunggu outcome final',
    }));
  }

  async markExecutionFailedByOrder(orderId: string, reason: string): Promise<number> {
    return this.patchByOrderId(orderId, (record) => ({
      ...record,
      status: 'EXECUTION_FAILED',
      statusReason: reason,
    }));
  }

  async markExecutionSkippedByOrder(orderId: string, reason: string): Promise<number> {
    return this.patchByOrderId(orderId, (record) => ({
      ...record,
      status: 'EXECUTION_SKIPPED',
      statusReason: reason,
    }));
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
    const outcomeByPositionId = new Map(outcomes.map((outcome) => [outcome.positionId, outcome]));

    let linked = 0;
    const sharedPositionCount = new Map<string, number>();

    for (const record of records) {
      if (record.status === 'PENDING_OUTCOME' && record.executionAnchor?.positionId) {
        sharedPositionCount.set(
          record.executionAnchor.positionId,
          (sharedPositionCount.get(record.executionAnchor.positionId) ?? 0) + 1,
        );
      }
    }

    const updated: PolicyEvaluationRecord[] = records.map((record): PolicyEvaluationRecord => {
      if (record.status !== 'PENDING_OUTCOME') {
        return record;
      }

      const positionId = record.executionAnchor?.positionId;
      if (!positionId) {
        return {
          ...record,
          status: 'EXECUTION_FAILED',
          statusReason: 'missing positionId anchor: record tidak eligible untuk resolve/tuning',
        };
      }

      const match = outcomeByPositionId.get(positionId);
      if (!match) {
        return record;
      }

      const eligibleForTuning = TUNING_ELIGIBLE_ACCURACY.has(match.accuracy);
      linked += 1;
      return {
        ...record,
        status: 'RESOLVED',
        statusReason: `resolved by deterministic positionId anchor (${positionId})`,
        resolution: {
          outcomeId: match.id,
          positionId,
          outcomeAccuracy: match.accuracy,
          outcomeNetPnl: match.netPnl,
          outcomeReturnPct: match.returnPercentage,
          closeReason: match.closeReason,
          resolvedAt: new Date().toISOString(),
          eligibleForTuning,
          ineligibleReason: eligibleForTuning
            ? undefined
            : `accuracy ${match.accuracy} tidak eligible untuk tuning aktif`,
          sharedPositionLifecycle: (sharedPositionCount.get(positionId) ?? 0) > 1,
        },
      };
    });

    if (linked > 0 || updated.some((item, idx) => item !== records[idx])) {
      await this.persistence.savePolicyEvaluations(updated);
    }

    const resolved = updated.filter((item) => item.status === 'RESOLVED');
    const eligible = resolved.filter((item) => item.resolution?.eligibleForTuning);

    return {
      linked,
      totalRecords: updated.length,
      resolvedSamples: resolved.length,
      eligibleSamples: eligible.length,
      pendingSamples: updated.filter((item) => item.status === 'PENDING_EXECUTION' || item.status === 'PENDING_OUTCOME').length,
    };
  }

  private laneSample(records: PolicyEvaluationRecord[]): Record<DecisionPolicyEntryLane, number> {
    return {
      DEFAULT: records.filter((item) => laneKey(item) === 'DEFAULT').length,
      SCOUT: records.filter((item) => laneKey(item) === 'SCOUT').length,
      ADD_ON_CONFIRM: records.filter((item) => laneKey(item) === 'ADD_ON_CONFIRM').length,
    };
  }

  async runConservativeLearningCycle(
    settings: BotSettings,
    previousLearning: PolicyLearningReadModel | null,
  ): Promise<PolicyLearningReadModel> {
    const records = await this.persistence.readPolicyEvaluations();
    const resolvedRecords = records.filter((item) => item.status === 'RESOLVED');
    const eligibleRecords = resolvedRecords.filter((item) => item.resolution?.eligibleForTuning);
    const eligibleOutcomeIds = eligibleRecords
      .map((item) => item.resolution?.outcomeId)
      .filter((item): item is string => Boolean(item));
    const eligibleFingerprint = fingerprintEligibleOutcomeIds(eligibleOutcomeIds);
    const now = new Date().toISOString();

    const laneSample = this.laneSample(eligibleRecords);

    const baseNoOp = {
      lastEvaluatedAt: now,
      totalRecords: records.length,
      resolvedSamples: resolvedRecords.length,
      eligibleSamples: eligibleRecords.length,
      tuned: false,
      changes: [],
      laneSample,
      eligibleOutcomeIdsFingerprint: eligibleFingerprint,
      lastAppliedLearningSignature: previousLearning?.lastAppliedLearningSignature,
      appliedEligibleOutcomeIds: previousLearning?.appliedEligibleOutcomeIds ?? [],
    } satisfies Omit<PolicyLearningReadModel, 'reasons' | 'noOpReason'>;

    if (
      previousLearning?.lastAppliedLearningSignature
      && previousLearning.lastAppliedLearningSignature === eligibleFingerprint
    ) {
      return {
        ...baseNoOp,
        noOpReason: 'dataset eligible identik dengan siklus tuning sebelumnya (idempotent no-op)',
        reasons: ['no-op idempotent: belum ada eligible outcome baru sejak tuning terakhir'],
      };
    }

    if (eligibleRecords.length < MIN_SAMPLE_GLOBAL) {
      return {
        ...baseNoOp,
        noOpReason: `sample belum cukup (eligible=${eligibleRecords.length}, minimal=${MIN_SAMPLE_GLOBAL})`,
        reasons: ['learning no-op: minimum sample gate tidak terpenuhi'],
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
        ...baseNoOp,
        noOpReason: 'sinyal evaluasi belum cukup kuat untuk tuning konservatif',
        reasons,
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
        ...baseNoOp,
        noOpReason: 'hasil tuning bounded menjadi no-op (sudah menyentuh batas floor/ceiling/drift)',
        reasons,
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
      eligibleOutcomeIdsFingerprint: eligibleFingerprint,
      lastAppliedLearningSignature: eligibleFingerprint,
      appliedEligibleOutcomeIds: [...new Set(eligibleOutcomeIds)].sort(),
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
