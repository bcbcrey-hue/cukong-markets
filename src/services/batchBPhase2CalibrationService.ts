import { createHash, randomUUID } from 'node:crypto';
import type {
  BatchBPhase2CalibrationSummary,
  BatchBPhase2CalibrationReport,
  BatchBPhase2OperatorSummary,
  BatchBPhase2OutcomeStatus,
  BatchBPhase2PredictionTrackingRecord,
  BatchBPredictionConfidenceBucket,
  BatchBPredictionConfidenceReliabilityBucket,
  BatchBPredictionBreakdown,
  FutureTrendingPrediction,
} from '../core/types';
import { PersistenceService } from './persistenceService';

const HORIZON_LABEL = 'H5_15M';
const HORIZON_MINUTES = 15;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
}

function confidenceBucket(confidence: number): BatchBPredictionConfidenceBucket {
  if (confidence < 0.45) return 'LOW';
  if (confidence < 0.7) return 'MID';
  return 'HIGH';
}

function asDirection(movePct: number): FutureTrendingPrediction['direction'] {
  if (movePct >= 0.45) return 'UP';
  if (movePct <= -0.45) return 'DOWN';
  return 'SIDEWAYS';
}

export class BatchBPhase2CalibrationService {
  constructor(private readonly persistence: PersistenceService) {}

  private latestTracking(rows: BatchBPhase2PredictionTrackingRecord[]): BatchBPhase2PredictionTrackingRecord[] {
    const latest = new Map<string, BatchBPhase2PredictionTrackingRecord>();
    for (const row of rows) {
      const current = latest.get(row.trackingId);
      if (!current) {
        latest.set(row.trackingId, row);
        continue;
      }
      if (new Date(row.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
        latest.set(row.trackingId, row);
      }
    }
    return [...latest.values()];
  }

  private computeTrackingId(runId: string, ownershipKey: string, generatedAt: number, direction: string): string {
    return createHash('sha256')
      .update(`${runId}:${ownershipKey}:${generatedAt}:${direction}`)
      .digest('hex')
      .slice(0, 16);
  }

  async trackRunPredictions(runId: string): Promise<BatchBPhase2PredictionTrackingRecord[]> {
    const [shadowRuns, existingRaw] = await Promise.all([
      this.persistence.readShadowRunEvidence(),
      this.persistence.readBatchBPhase2Tracking(),
    ]);
    const existing = this.latestTracking(existingRaw);

    const runRows = shadowRuns.filter((row) => row.runId === runId);
    const linkageRows = runRows
      .map((row) => row.phase2PredictionLinkage)
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    const tracked = new Map(existing.map((row) => [row.trackingId, row]));

    for (const linkage of linkageRows) {
      if (linkage.linkageStatus !== 'CAPTURED' || !linkage.prediction || linkage.prediction.horizonLabel !== HORIZON_LABEL) {
        continue;
      }
      const predictionTs = Number.isFinite(linkage.prediction.generatedAt)
        ? linkage.prediction.generatedAt
        : Date.parse(linkage.capturedAt);
      const trackingId = this.computeTrackingId(runId, linkage.evidenceId, predictionTs, linkage.prediction.direction);
      if (tracked.has(trackingId)) continue;

      const record: BatchBPhase2PredictionTrackingRecord = {
        trackingId,
        runId,
        pair: linkage.pair,
        predictionTimestamp: predictionTs,
        horizonLabel: HORIZON_LABEL,
        horizonMinutes: linkage.prediction.horizonMinutes || HORIZON_MINUTES,
        horizonTargetTimestamp: predictionTs + (linkage.prediction.horizonMinutes || HORIZON_MINUTES) * 60_000,
        predictedDirection: linkage.prediction.direction,
        predictedExpectedMovePct: linkage.prediction.expectedMovePct,
        confidence: linkage.prediction.confidence,
        predictionStrength: linkage.prediction.strength,
        calibrationTag: linkage.prediction.calibrationTag,
        tradeFlowSource: linkage.prediction.tradeFlowSource,
        tradeFlowQuality: linkage.prediction.tradeFlowQuality,
        marketPolicyContextSummary: linkage.contextSummary ?? 'phase2-shadow-linkage-without-context',
        confidenceBucket: confidenceBucket(linkage.prediction.confidence),
        outcomeStatus: 'PENDING',
        actualDirection: null,
        actualMovePct: null,
        resolvedAt: null,
        confidenceCalibrationGap: null,
        driftMinutes: null,
        pairClass: undefined,
        regime: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.persistence.appendBatchBPhase2Tracking(record);
      tracked.set(trackingId, record);
    }

    return [...tracked.values()].filter((row) => row.runId === runId);
  }

  async resolveOutcomes(runId: string, nowMs = Date.now()): Promise<BatchBPhase2PredictionTrackingRecord[]> {
    const [rawRows, pairHistory] = await Promise.all([
      this.persistence.readBatchBPhase2Tracking(),
      this.persistence.readPairHistory(),
    ]);
    const allRows = this.latestTracking(rawRows);

    const snapshots = pairHistory
      .filter((row) => row.type === 'snapshot')
      .map((row) => row.snapshot as { pair: string; ticker?: { lastPrice?: number }; timestamp?: number })
      .filter((row) => row?.pair && row?.ticker?.lastPrice && row?.timestamp)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    const byPair = new Map<string, typeof snapshots>();
    for (const snap of snapshots) {
      const key = snap.pair.toLowerCase();
      const current = byPair.get(key) ?? [];
      current.push(snap);
      byPair.set(key, current);
    }

    const updates: BatchBPhase2PredictionTrackingRecord[] = [];
    for (const row of allRows.filter((item) => item.runId === runId)) {
      const pairSnaps = byPair.get(row.pair.toLowerCase()) ?? [];
      const reference = pairSnaps.find((snap) => (snap.timestamp ?? 0) >= row.predictionTimestamp);
      const target = pairSnaps.find((snap) => (snap.timestamp ?? 0) >= row.horizonTargetTimestamp);

      let outcomeStatus: BatchBPhase2OutcomeStatus = 'PENDING';
      let actualMovePct: number | null = null;
      let actualDirection: FutureTrendingPrediction['direction'] | null = null;
      let resolvedAt: number | null = null;
      let confidenceCalibrationGap: number | null = null;
      let driftMinutes: number | null = null;

      if (!reference || !target) {
        const ageMs = nowMs - row.horizonTargetTimestamp;
        outcomeStatus = ageMs >= row.horizonMinutes * 60_000 * 2 ? 'INSUFFICIENT_DATA' : 'PENDING';
      } else {
        const start = reference.ticker!.lastPrice!;
        const end = target.ticker!.lastPrice!;
        actualMovePct = ((end - start) / start) * 100;
        actualDirection = asDirection(actualMovePct);
        resolvedAt = target.timestamp ?? null;
        driftMinutes = resolvedAt === null ? null : Math.abs(resolvedAt - row.horizonTargetTimestamp) / 60_000;
        confidenceCalibrationGap = Math.abs(row.confidence - (actualDirection === row.predictedDirection ? 1 : 0));
        outcomeStatus = 'RESOLVED';
      }

      const updated: BatchBPhase2PredictionTrackingRecord = {
        ...row,
        outcomeStatus,
        actualMovePct,
        actualDirection,
        resolvedAt,
        driftMinutes,
        confidenceCalibrationGap,
        updatedAt: new Date().toISOString(),
      };
      updates.push(updated);
    }

    for (const row of updates) {
      await this.persistence.appendBatchBPhase2Tracking(row);
    }

    await this.persistence.saveBatchBPhase2LatestReport(this.buildReport(runId, updates));

    return updates;
  }

  private breakdownBucket(rows: BatchBPhase2PredictionTrackingRecord[]): BatchBPredictionBreakdown<BatchBPredictionConfidenceBucket>[] {
    return (['LOW', 'MID', 'HIGH'] as const).map((bucket) => {
      const subset = rows.filter((row) => row.confidenceBucket === bucket);
      const resolved = subset.filter((row) => row.outcomeStatus === 'RESOLVED');
      const hits = resolved.filter((row) => row.actualDirection === row.predictedDirection).length;
      return {
        key: bucket,
        total: subset.length,
        resolved: resolved.length,
        unresolved: subset.length - resolved.length,
        directionAccuracy: resolved.length === 0 ? 0 : hits / resolved.length,
        meanAbsoluteMoveErrorPct: average(
          resolved.map((row) => Math.abs((row.actualMovePct ?? 0) - row.predictedExpectedMovePct)),
        ),
      };
    });
  }

  private reliability(rows: BatchBPhase2PredictionTrackingRecord[]): BatchBPredictionConfidenceReliabilityBucket[] {
    const resolved = rows.filter((row) => row.outcomeStatus === 'RESOLVED');
    return (['LOW', 'MID', 'HIGH'] as const).map((bucket) => {
      const subset = resolved.filter((row) => row.confidenceBucket === bucket);
      const hitRate = subset.length > 0
        ? subset.filter((row) => row.actualDirection === row.predictedDirection).length / subset.length
        : 0;
      const avgConfidence = average(subset.map((row) => row.confidence));
      return {
        bucket,
        sampleCount: subset.length,
        averageConfidence: avgConfidence,
        realisedHitRate: hitRate,
        absoluteCalibrationGap: Math.abs(avgConfidence - hitRate),
      };
    });
  }

  buildReport(runId: string, rows: BatchBPhase2PredictionTrackingRecord[]): BatchBPhase2CalibrationReport {
    const resolved = rows.filter((row) => row.outcomeStatus === 'RESOLVED');
    const pending = rows.filter((row) => row.outcomeStatus === 'PENDING').length;
    const expired = rows.filter((row) => row.outcomeStatus === 'EXPIRED').length;
    const insufficientData = rows.filter((row) => row.outcomeStatus === 'INSUFFICIENT_DATA').length;
    const reliability = this.reliability(rows);
    const totalReliabilitySamples = reliability.reduce((sum, item) => sum + item.sampleCount, 0);
    const ece = totalReliabilitySamples > 0
      ? reliability.reduce((sum, item) => sum + (item.sampleCount / totalReliabilitySamples) * item.absoluteCalibrationGap, 0)
      : 0;
    const gap = average(resolved.map((row) => row.confidenceCalibrationGap ?? 0));
    const mismatchCount = resolved.filter((row) => (row.confidenceCalibrationGap ?? 0) >= 0.35).length;

    const warningAreas: string[] = [];
    if (resolved.length < 5) warningAreas.push('Sample resolved masih kecil; rekomendasi threshold bersifat sementara.');
    if (mismatchCount > 0) warningAreas.push(`Ada ${mismatchCount} prediction confidence mismatch tinggi (gap >= 0.35).`);
    if (pending > 0) warningAreas.push(`Masih ada ${pending} prediction pending; kalibrasi belum final.`);

    const summary: BatchBPhase2CalibrationSummary = {
      runId,
      generatedAt: new Date().toISOString(),
      totalPredictionCount: rows.length,
      resolvedPredictionCount: resolved.length,
      pendingPredictionCount: pending,
      expiredPredictionCount: expired,
      insufficientDataCount: insufficientData,
      confidenceBucketAccuracy: this.breakdownBucket(rows),
      confidenceReliabilityByBucket: reliability,
      meanAbsoluteConfidenceCalibrationGap: gap,
      expectedCalibrationError: ece,
      driftSummary: {
        meanAbsoluteDriftMinutes: average(resolved.map((row) => row.driftMinutes ?? 0)),
        p95AbsoluteDriftMinutes: p95(resolved.map((row) => row.driftMinutes ?? 0)),
        confidenceMismatchCount: mismatchCount,
      },
      warningAreas,
      conservativeAdjustmentRecommendation: gap >= 0.25
        ? 'Naikkan threshold confidence minimum secara konservatif (contoh +0.05) sampai mismatch menurun.'
        : 'Pertahankan threshold saat ini; lanjut monitor mismatch confidence harian.',
      weakPerformanceAreas: [],
    };

    const operatorSummary: BatchBPhase2OperatorSummary = {
      title: 'Batch B Fase 2 — Shadow-Live Calibration Summary',
      runId,
      generatedAt: summary.generatedAt,
      lines: [
        `Total prediction: ${summary.totalPredictionCount}`,
        `Resolved/Pending: ${summary.resolvedPredictionCount}/${summary.pendingPredictionCount}`,
        `Mean calibration gap: ${summary.meanAbsoluteConfidenceCalibrationGap.toFixed(4)}`,
        `ECE: ${summary.expectedCalibrationError.toFixed(4)}`,
        `Confidence mismatch count: ${summary.driftSummary.confidenceMismatchCount}`,
        `Rekomendasi: ${summary.conservativeAdjustmentRecommendation}`,
      ],
      honestBoundary:
        'Ini kalibrasi shadow-live prediction Batch B, bukan bukti final live-readiness dan bukan market-real capital validation.',
    };

    return {
      tracking: {
        totalRecords: rows.length,
        resolvedRecords: summary.resolvedPredictionCount,
        pendingRecords: summary.pendingPredictionCount,
        expiredRecords: summary.expiredPredictionCount,
        insufficientDataRecords: summary.insufficientDataCount,
      },
      calibration: summary,
      operatorSummary,
      limitations: [
        'Outcome hanya bisa di-resolve jika snapshot reference + snapshot horizon tersedia di pair-history runtime.',
        'Status pending/insufficient-data tidak boleh diartikan sebagai akurasi buruk/baik; hanya menandakan coverage belum cukup.',
        operatorSummary.honestBoundary,
      ],
    };
  }

  async runPhase2ForRunId(runId: string): Promise<BatchBPhase2CalibrationReport> {
    await this.trackRunPredictions(runId);
    const resolvedRows = await this.resolveOutcomes(runId);
    const report = this.buildReport(runId, resolvedRows);
    await this.persistence.saveBatchBPhase2LatestReport(report);
    return report;
  }

  generateRunId(): string {
    return `phase2-${randomUUID()}`;
  }
}
