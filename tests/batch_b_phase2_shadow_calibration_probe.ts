import assert from 'node:assert/strict';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { BatchBPhase2CalibrationService } from '../src/services/batchBPhase2CalibrationService';
import type { FutureTrendingPrediction, ShadowRunEvidence } from '../src/core/types';
import { PersistenceService } from '../src/services/persistenceService';
import { writeBatchBPhase2Artifacts } from '../src/services/batchBPhase2ReportService';
import { ReportService } from '../src/services/reportService';

function buildPrediction(generatedAt: number, direction: FutureTrendingPrediction['direction']): FutureTrendingPrediction {
  return {
    target: 'TREND_DIRECTIONAL_MOVE',
    horizonLabel: 'H5_15M',
    horizonMinutes: 15,
    direction,
    expectedMovePct: direction === 'DOWN' ? -1.2 : 1.2,
    confidence: 0.78,
    strength: 'STRONG',
    calibrationTag: 'OUTCOME_AND_TRADE_TRUTH',
    reasons: ['momentum valid'],
    caveats: [],
    tradeFlowSource: 'EXCHANGE_TRADE_FEED',
    tradeFlowQuality: 'TAPE',
    generatedAt,
  };
}

async function seedRunEvidence(
  persistence: PersistenceService,
  input: { runId: string; pair: string; generatedAt: number; direction: FutureTrendingPrediction['direction'] },
): Promise<void> {
  const shadowEvidence: ShadowRunEvidence = {
    runId: input.runId,
    timestamp: new Date(input.generatedAt + 60_000).toISOString(),
    exchange: 'indodax',
    account: 'probe-account',
    allPassed: true,
    phase2PredictionLinkage: {
      evidenceId: `${input.runId}-evidence`,
      runId: input.runId,
      pair: input.pair,
      capturedAt: new Date(input.generatedAt + 30_000).toISOString(),
      linkageStatus: 'CAPTURED',
      opportunityTimestamp: input.generatedAt,
      runtimePolicyUpdatedAt: new Date(input.generatedAt + 45_000).toISOString(),
      prediction: buildPrediction(input.generatedAt, input.direction),
      contextSummary: `run=${input.runId}`,
    },
    checks: [
      {
        check: 'public_market',
        endpoint: `GET /api/depth/${input.pair}`,
        account: 'probe-account',
        pass: true,
        summary: { pair: input.pair },
      },
    ],
  };
  await persistence.appendShadowRunEvidence(shadowEvidence);
}

async function seedSnapshots(
  persistence: PersistenceService,
  pair: string,
  predictionTs: number,
  basePrice: number,
  horizonPrice: number,
): Promise<void> {
  await persistence.appendPairHistory({
    type: 'snapshot',
    pair,
    snapshot: { pair, ticker: { lastPrice: basePrice }, timestamp: predictionTs },
  });
  await persistence.appendPairHistory({
    type: 'snapshot',
    pair,
    snapshot: { pair, ticker: { lastPrice: horizonPrice }, timestamp: predictionTs + 15 * 60_000 },
  });
}

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const service = new BatchBPhase2CalibrationService(persistence);
  const now = Date.now();
  const targetRunId = `shadow-phase2-target-${now}`;
  const otherRunId = `shadow-phase2-other-${now}`;
  const missingLinkRunId = `shadow-phase2-missing-link-${now}`;

  const pair = 'btc_idr';
  const targetTs = now - 20 * 60_000;
  const otherTs = now - 200 * 60_000;

  await seedRunEvidence(persistence, { runId: targetRunId, pair, generatedAt: targetTs, direction: 'UP' });
  await seedRunEvidence(persistence, { runId: otherRunId, pair, generatedAt: otherTs, direction: 'DOWN' });

  await persistence.appendShadowRunEvidence({
    runId: missingLinkRunId,
    timestamp: new Date(now).toISOString(),
    exchange: 'indodax',
    account: 'probe-account',
    allPassed: true,
    checks: [{ check: 'public_market', endpoint: `GET /api/depth/${pair}`, account: 'probe-account', pass: true, summary: { pair } }],
  });

  await seedSnapshots(persistence, pair, targetTs, 100, 103);
  await seedSnapshots(persistence, pair, otherTs, 200, 190);

  // noise opportunity pada pair yang sama namun bukan linkage target
  await persistence.appendPairHistory({
    type: 'opportunity',
    pair,
    opportunity: { pair, prediction: buildPrediction(now - 5 * 60_000, 'UP') },
  });

  const report = await service.runPhase2ForRunId(targetRunId);
  const otherReport = await service.runPhase2ForRunId(otherRunId);
  const missingLinkReport = await service.runPhase2ForRunId(missingLinkRunId);

  assert.equal(report.tracking.totalRecords, 1, 'target run hanya boleh melacak prediction milik runId target');
  assert.equal(report.tracking.resolvedRecords, 1, 'target run harus resolve prediction target');
  assert.equal(otherReport.tracking.totalRecords, 1, 'run lain harus diproses terpisah tanpa kontaminasi');
  assert.equal(
    report.calibration.runId === targetRunId && otherReport.calibration.runId === otherRunId,
    true,
    'report harus mempertahankan ownership runId masing-masing',
  );
  assert.equal(
    missingLinkReport.tracking.totalRecords,
    0,
    'jika linkage eksplisit runId tidak ada maka tracking harus kosong (tidak boleh pair-match liar)',
  );

  const outputDir = path.resolve(process.cwd(), 'test_reports', 'batch_b_phase2_probe');
  await mkdir(outputDir, { recursive: true });
  const artifacts = await writeBatchBPhase2Artifacts({ report, outputDir });

  await access(artifacts.jsonPath);
  await access(artifacts.pdfPath);

  const json = JSON.parse(await readFile(artifacts.jsonPath, 'utf8')) as {
    report: {
      tracking: { totalRecords: number; resolvedRecords: number };
      calibration: { expectedCalibrationError: number };
      operatorSummary: { honestBoundary: string };
    };
  };

  assert.equal(json.report.tracking.totalRecords, 1, 'json report harus sinkron dengan tracking target run');
  assert.equal(json.report.tracking.resolvedRecords, 1, 'json report harus memuat resolved target run');
  assert.equal(typeof json.report.calibration.expectedCalibrationError, 'number');
  assert.match(json.report.operatorSummary.honestBoundary, /shadow-live prediction/i);

  const pdf = await readFile(artifacts.pdfPath);
  assert.equal(pdf.byteLength > 200, true, 'pdf artifact wajib terbentuk dan tidak kosong');
  const pdfText = pdf.toString('latin1');
  assert.match(pdfText, /Batch B Fase 2/, 'pdf wajib memuat identitas fase 2');
  assert.match(pdfText, /Akurasi per Confidence Bucket/, 'pdf wajib memuat bucket accuracy');

  const operatorText = new ReportService().batchBPhase2OperatorSummaryText(report.operatorSummary);
  assert.match(operatorText, /BATCH B FASE 2/, 'operator summary wajib terbentuk dari read-model report service');

  console.log(
    JSON.stringify(
      {
        probe: 'batch_b_phase2_shadow_calibration_probe',
        targetRunId,
        otherRunId,
        missingLinkRunId,
        targetTracking: report.tracking,
        otherTracking: otherReport.tracking,
        missingLinkTracking: missingLinkReport.tracking,
        artifacts,
      },
      null,
      2,
    ),
  );
  console.log('batch_b_phase2_shadow_calibration_probe: ok');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
