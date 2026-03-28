import { randomUUID } from 'node:crypto';
import type {
  BacktestRunConfig,
  BatchBPredictionBreakdown,
  BatchBPredictionCalibrationSummary,
  BatchBPredictionConfidenceBucket,
  BatchBPredictionConservativeThresholdRecommendation,
  BatchBPredictionHorizonErrorSummary,
  BatchBPredictionPhase1Metrics,
  BatchBPredictionPhase1Report,
  BatchBPredictionRegimeBreakdown,
  BatchBPredictionRunConfig,
  BatchBPredictionSourceQualityBreakdown,
  BatchBPredictionStrengthBreakdown,
  BatchBPredictionValidationResult,
  BatchBPredictionValidationRow,
  BotSettings,
  PairClass,
} from '../../core/types';
import { SignalEngine } from '../signals/signalEngine';
import { PairUniverse } from '../market/pairUniverse';
import { FeaturePipeline } from '../intelligence/featurePipeline';
import { FutureTrendingPredictionEngine } from '../intelligence/futureTrendingPredictionEngine';
import { ReplayLoader } from './replayLoader';
import { PersistenceService } from '../../services/persistenceService';

const HORIZON_MINUTES = 15;
const HORIZON_LABEL = 'H5_15M';
const DIRECTION_THRESHOLD = 0.45;

function classifyDirection(expectedMovePct: number): 'UP' | 'SIDEWAYS' | 'DOWN' {
  if (expectedMovePct >= DIRECTION_THRESHOLD) {
    return 'UP';
  }
  if (expectedMovePct <= -DIRECTION_THRESHOLD) {
    return 'DOWN';
  }
  return 'SIDEWAYS';
}

function confidenceBucket(value: number): BatchBPredictionConfidenceBucket {
  if (value < 0.45) {
    return 'LOW';
  }
  if (value < 0.7) {
    return 'MID';
  }
  return 'HIGH';
}

function pairClassKey(pairClass: PairClass | undefined): 'MAJOR' | 'MID' | 'MICRO' | 'UNKNOWN' {
  return pairClass ?? 'UNKNOWN';
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

function findConservativeThresholdRecommendation(
  rows: BatchBPredictionValidationRow[],
): BatchBPredictionConservativeThresholdRecommendation {
  const resolved = rows.filter((row) => row.resolved);
  const candidates = [0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
  let best: BatchBPredictionConservativeThresholdRecommendation | null = null;

  for (const threshold of candidates) {
    const subset = resolved.filter((item) => item.predictionConfidence >= threshold);
    if (subset.length < 20) {
      continue;
    }

    const directionAccuracy =
      subset.filter((item) => item.isDirectionMatch).length / subset.length;
    const meanAbsoluteMoveErrorPct = average(subset.map((item) => Math.abs(item.moveErrorPct ?? 0)));

    if (!best || directionAccuracy > best.expectedDirectionAccuracy) {
      best = {
        confidenceThreshold: threshold,
        expectedDirectionAccuracy: directionAccuracy,
        resolvedSampleCount: subset.length,
        meanAbsoluteMoveErrorPct,
        rationale:
          'Threshold dipilih dari kandidat confidence yang mempertahankan sample >= 20 dengan akurasi arah tertinggi.',
      };
    }
  }

  return (
    best ?? {
      confidenceThreshold: 0.7,
      expectedDirectionAccuracy: 0,
      resolvedSampleCount: 0,
      meanAbsoluteMoveErrorPct: 0,
      rationale:
        'Belum ada sample resolved yang cukup (>=20) untuk threshold kandidat konservatif; gunakan baseline 0.70 sementara.',
    }
  );
}

function breakdownBy<T extends string>(
  rows: BatchBPredictionValidationRow[],
  keyGetter: (row: BatchBPredictionValidationRow) => T,
): BatchBPredictionBreakdown<T>[] {
  const map = new Map<T, BatchBPredictionValidationRow[]>();
  for (const row of rows) {
    const key = keyGetter(row);
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }

  return [...map.entries()].map(([key, items]) => {
    const resolved = items.filter((item) => item.resolved);
    const correct = resolved.filter((item) => item.isDirectionMatch).length;
    const errors = resolved.map((item) => Math.abs(item.moveErrorPct ?? 0));

    return {
      key,
      total: items.length,
      resolved: resolved.length,
      unresolved: items.length - resolved.length,
      directionAccuracy: resolved.length > 0 ? correct / resolved.length : 0,
      meanAbsoluteMoveErrorPct: average(errors),
    };
  });
}

function calculateMetrics(
  rows: BatchBPredictionValidationRow[],
): BatchBPredictionPhase1Metrics {
  const resolved = rows.filter((row) => row.resolved);
  const unresolvedCount = rows.length - resolved.length;
  const directionMatchCount = resolved.filter((row) => row.isDirectionMatch).length;

  const bucketBreakdown = breakdownBy(
    rows,
    (row) => row.confidenceBucket,
  );

  const calibrationByTag = breakdownBy(rows, (row) => row.calibrationTag);

  const regimeBreakdown: BatchBPredictionRegimeBreakdown[] = breakdownBy(
    rows,
    (row) => row.regime,
  );

  const pairClassBreakdown = breakdownBy(rows, (row) => pairClassKey(row.pairClass));

  const predictionStrengthBreakdown: BatchBPredictionStrengthBreakdown[] = breakdownBy(
    rows,
    (row) => row.predictionStrength,
  );

  const sourceQualityBreakdown: BatchBPredictionSourceQualityBreakdown[] = breakdownBy(
    rows,
    (row) => `${row.tradeFlowSource}:${row.tradeFlowQuality}`,
  );

  const expectedMoveErrors = resolved.map((row) => Math.abs(row.moveErrorPct ?? 0));
  const horizonErrors = resolved.map((row) => Math.abs((row.resolvedAt ?? row.referenceTimestamp) - row.horizonTargetTimestamp) / 60_000);
  const calibrationErrors = resolved.map((row) => {
    const predictedDirectional = Math.min(1, Math.max(0, Math.abs(row.predictedExpectedMovePct) / 4.5));
    const actualDirectional = Math.min(1, Math.max(0, Math.abs(row.actualMovePct ?? 0) / 4.5));
    return Math.abs(predictedDirectional - actualDirectional);
  });

  const failures = resolved
    .filter((row) => !row.isDirectionMatch)
    .sort((a, b) => Math.abs(b.moveErrorPct ?? 0) - Math.abs(a.moveErrorPct ?? 0))
    .slice(0, 7)
    .map((row) => ({
      pair: row.pair,
      regime: row.regime,
      pairClass: pairClassKey(row.pairClass),
      predictionStrength: row.predictionStrength,
      confidence: row.predictionConfidence,
      predictedDirection: row.predictedDirection,
      actualDirection: row.actualDirection,
      moveErrorPct: row.moveErrorPct ?? 0,
      note: `resolvedAt=${row.resolvedAt ? new Date(row.resolvedAt).toISOString() : 'n/a'}`,
    }));

  return {
    totalPredictionCount: rows.length,
    resolvedPredictionCount: resolved.length,
    unresolvedOrSkippedCount: unresolvedCount,
    overallDirectionAccuracy: resolved.length > 0 ? directionMatchCount / resolved.length : 0,
    confidenceBucketAccuracy: bucketBreakdown,
    calibrationSummary: {
      meanCalibrationError: average(calibrationErrors),
      byCalibrationTag: calibrationByTag,
    },
    expectedMoveError: {
      meanAbsoluteErrorPct: average(expectedMoveErrors),
      p95AbsoluteErrorPct:
        expectedMoveErrors.length > 0
          ? [...expectedMoveErrors].sort((a, b) => a - b)[
              Math.min(expectedMoveErrors.length - 1, Math.floor(expectedMoveErrors.length * 0.95))
            ]
          : 0,
    },
    horizonErrorSummary: {
      targetHorizonMinutes: HORIZON_MINUTES,
      meanAbsoluteResolutionDriftMinutes: average(horizonErrors),
      p95ResolutionDriftMinutes:
        horizonErrors.length > 0
          ? [...horizonErrors].sort((a, b) => a - b)[
              Math.min(horizonErrors.length - 1, Math.floor(horizonErrors.length * 0.95))
            ]
          : 0,
    } satisfies BatchBPredictionHorizonErrorSummary,
    regimeBreakdown,
    pairClassBreakdown,
    predictionStrengthBreakdown,
    sourceQualityBreakdown,
    conservativeThresholdRecommendation: findConservativeThresholdRecommendation(rows),
    caveats: [
      'Fase 1 hanya memvalidasi historis dari data snapshot yang tersedia di persistence replay.',
      'Hasil ini bukan bukti kesiapan live trading tanpa verifikasi runtime market-real dan exchange execution.',
    ],
  };
}

export class BatchBPredictionPhase1Validator {
  private readonly loader: ReplayLoader;

  constructor(private readonly persistence: PersistenceService) {
    this.loader = new ReplayLoader(persistence);
  }

  async run(
    config: BatchBPredictionRunConfig,
    settings: BotSettings,
  ): Promise<BatchBPredictionValidationResult> {
    const replayConfig: BacktestRunConfig = {
      pair: config.pair,
      startTime: config.startTime,
      endTime: config.endTime,
      maxEvents: config.maxEvents,
    };

    const snapshots = await this.loader.loadSnapshots(replayConfig);
    const signalEngine = new SignalEngine(new PairUniverse());
    const featurePipeline = new FeaturePipeline();
    const predictionEngine = new FutureTrendingPredictionEngine();

    const snapshotsByPair = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      const current = snapshotsByPair.get(snapshot.pair) ?? [];
      current.push(snapshot);
      snapshotsByPair.set(snapshot.pair, current);
    }

    const pairStats = new Map<string, { wins: number; losses: number; sample: number }>();
    const pairSignals = new Map<string, ReturnType<typeof signalEngine.score>[]>();
    const rows: BatchBPredictionValidationRow[] = [];

    for (const snapshot of snapshots) {
      const signal = signalEngine.score(snapshot);
      const pairSignalHistory = pairSignals.get(snapshot.pair) ?? [];
      const recentSignals = [...pairSignalHistory.slice(-25), signal];
      pairSignalHistory.push(signal);
      pairSignals.set(snapshot.pair, pairSignalHistory);

      const pairSnapshots = snapshotsByPair.get(snapshot.pair) ?? [];
      const recentSnapshots = pairSnapshots.filter((item) => item.timestamp <= snapshot.timestamp).slice(-25);
      const micro = featurePipeline.build(snapshot, signal, recentSnapshots);

      const stats = pairStats.get(snapshot.pair) ?? { wins: 0, losses: 0, sample: 0 };
      const recentWinRate = stats.sample > 0 ? stats.wins / stats.sample : 0;
      const recentFalseBreakRate = stats.sample > 0 ? stats.losses / stats.sample : 0;
      const historicalContext = {
        pair: snapshot.pair,
        snapshotCount: recentSnapshots.length,
        anomalyCount: 0,
        recentWinRate,
        recentFalseBreakRate,
        outcomeGrounding: 'PROXY_FALLBACK' as const,
        outcomeSampleSize: stats.sample,
        regime: signal.regime,
        patternMatches: [],
        contextNotes: ['phase1 validation menggunakan replay historis snapshot/proxy path yang tersedia'],
        timestamp: snapshot.timestamp,
      };

      const prediction = predictionEngine.predict({
        signal,
        microstructure: micro,
        historicalContext,
      });

      const horizonTargetTimestamp = snapshot.timestamp + prediction.horizonMinutes * 60_000;
      const resolvedSnapshot = pairSnapshots.find((item) => item.timestamp >= horizonTargetTimestamp);

      let actualMovePct: number | null = null;
      let actualDirection: 'UP' | 'SIDEWAYS' | 'DOWN' | null = null;
      let isDirectionMatch: boolean | null = null;
      let moveErrorPct: number | null = null;

      if (resolvedSnapshot && snapshot.ticker.lastPrice > 0) {
        actualMovePct = ((resolvedSnapshot.ticker.lastPrice - snapshot.ticker.lastPrice) / snapshot.ticker.lastPrice) * 100;
        actualDirection = classifyDirection(actualMovePct);
        isDirectionMatch = actualDirection === prediction.direction;
        moveErrorPct = prediction.expectedMovePct - actualMovePct;

        stats.sample += 1;
        if (actualMovePct > 0) {
          stats.wins += 1;
        } else {
          stats.losses += 1;
        }
        pairStats.set(snapshot.pair, stats);
      }

      rows.push({
        pair: snapshot.pair,
        pairClass: signal.pairClass,
        regime: historicalContext.regime,
        referenceTimestamp: snapshot.timestamp,
        horizonLabel: HORIZON_LABEL,
        horizonMinutes: prediction.horizonMinutes,
        horizonTargetTimestamp,
        predictedDirection: prediction.direction,
        predictedExpectedMovePct: prediction.expectedMovePct,
        predictionConfidence: prediction.confidence,
        predictionStrength: prediction.strength,
        calibrationTag: prediction.calibrationTag,
        confidenceBucket: confidenceBucket(prediction.confidence),
        tradeFlowSource: prediction.tradeFlowSource,
        tradeFlowQuality: prediction.tradeFlowQuality,
        resolved: Boolean(resolvedSnapshot),
        resolvedAt: resolvedSnapshot?.timestamp,
        actualDirection,
        actualMovePct,
        isDirectionMatch,
        moveErrorPct,
      });
    }

    const metrics = calculateMetrics(rows);

    return {
      runId: randomUUID(),
      generatedAt: new Date().toISOString(),
      config,
      totalSnapshotsEvaluated: snapshots.length,
      rows,
      metrics,
    };
  }
}

export function buildBatchBPredictionPhase1Report(
  result: BatchBPredictionValidationResult,
): BatchBPredictionPhase1Report {
  const m = result.metrics;

  return {
    runId: result.runId,
    generatedAt: result.generatedAt,
    executiveSummary: {
      headline: 'Fase 1 memvalidasi prediction Batch B secara historis kuantitatif dari replay snapshot yang tersedia.',
      totalPredictions: m.totalPredictionCount,
      resolvedPredictions: m.resolvedPredictionCount,
      unresolvedPredictions: m.unresolvedOrSkippedCount,
      directionAccuracy: m.overallDirectionAccuracy,
      caveat: 'Ini validasi historis source-level, bukan bukti siap live trading atau bukti eksekusi exchange real-time.',
    },
    accuracySummary: {
      overallDirectionAccuracy: m.overallDirectionAccuracy,
      confidenceBucketAccuracy: m.confidenceBucketAccuracy,
      expectedMoveError: m.expectedMoveError,
      horizonErrorSummary: m.horizonErrorSummary,
    },
    calibrationSummary: m.calibrationSummary,
    regimeBreakdown: m.regimeBreakdown,
    pairClassBreakdown: m.pairClassBreakdown,
    predictionStrengthBreakdown: m.predictionStrengthBreakdown,
    sourceQualityBreakdown: m.sourceQualityBreakdown,
    failureZones: m.regimeBreakdown
      .filter((item) => item.resolved >= 5)
      .sort((a, b) => a.directionAccuracy - b.directionAccuracy)
      .slice(0, 5)
      .map((item) => ({
        dimension: 'regime',
        key: item.key,
        resolved: item.resolved,
        directionAccuracy: item.directionAccuracy,
      })),
    conservativeThresholdRecommendation: m.conservativeThresholdRecommendation,
    limitations: [
      ...m.caveats,
      'Ground truth outcome memakai close price snapshot pada/di atas target horizon, bukan tick-by-tick exchange fill outcome.',
      'Jika coverage snapshot untuk horizon target kurang, sebagian prediction tidak resolved dan dicatat sebagai unresolved/skip.',
    ],
  };
}
