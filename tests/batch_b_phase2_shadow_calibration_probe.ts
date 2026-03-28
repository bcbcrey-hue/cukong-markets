import assert from 'node:assert/strict';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { BatchBPhase2CalibrationService } from '../src/services/batchBPhase2CalibrationService';
import type { ShadowRunEvidence } from '../src/core/types';
import { PersistenceService } from '../src/services/persistenceService';
import { writeBatchBPhase2Artifacts } from '../src/services/batchBPhase2ReportService';
import { ReportService } from '../src/services/reportService';

async function seedRuntimeEvidence(persistence: PersistenceService, runId: string): Promise<void> {
  const now = Date.now();
  const pair = 'btc_idr';

  const shadowEvidence: ShadowRunEvidence = {
    runId,
    timestamp: new Date(now).toISOString(),
    exchange: 'indodax',
    account: 'probe-account',
    allPassed: true,
    checks: [
      {
        check: 'public_market',
        endpoint: `GET /api/depth/${pair}`,
        account: 'probe-account',
        pass: true,
        summary: { pair },
      },
    ],
  };
  await persistence.appendShadowRunEvidence(shadowEvidence);

  const predictionTs = now - 20 * 60_000;

  await persistence.appendPairHistory({
    type: 'opportunity',
    pair,
    recordedAt: new Date(predictionTs).toISOString(),
    opportunity: {
      pair,
      pairClass: 'MAJOR',
      marketRegime: 'EXPANSION',
      warnings: ['spread meningkat tipis'],
      prediction: {
        target: 'TREND_DIRECTIONAL_MOVE',
        horizonLabel: 'H5_15M',
        horizonMinutes: 15,
        direction: 'UP',
        expectedMovePct: 1.2,
        confidence: 0.78,
        strength: 'STRONG',
        calibrationTag: 'OUTCOME_AND_TRADE_TRUTH',
        reasons: ['momentum naik'],
        caveats: [],
        tradeFlowSource: 'EXCHANGE_TRADE_FEED',
        tradeFlowQuality: 'TAPE',
        generatedAt: predictionTs,
      },
    },
  });

  await persistence.appendPairHistory({
    type: 'snapshot',
    pair,
    recordedAt: new Date(predictionTs).toISOString(),
    snapshot: {
      pair,
      ticker: { lastPrice: 100 },
      timestamp: predictionTs,
    },
  });

  await persistence.appendPairHistory({
    type: 'snapshot',
    pair,
    recordedAt: new Date(predictionTs + 15 * 60_000).toISOString(),
    snapshot: {
      pair,
      ticker: { lastPrice: 103 },
      timestamp: predictionTs + 15 * 60_000,
    },
  });
}

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const service = new BatchBPhase2CalibrationService(persistence);
  const runId = `shadow-phase2-probe-${Date.now()}`;
  await seedRuntimeEvidence(persistence, runId);

  const report = await service.runPhase2ForRunId(runId);

  assert.equal(report.tracking.totalRecords > 0, true, 'tracking store harus berisi prediction dari path runtime');
  assert.equal(report.tracking.resolvedRecords > 0, true, 'outcome resolution harus menghasilkan status RESOLVED');
  assert.equal(
    report.calibration.confidenceBucketAccuracy.some((item) => item.resolved > 0),
    true,
    'calibration bucket harus terhitung dari sample resolved',
  );
  assert.equal(
    report.calibration.driftSummary.confidenceMismatchCount >= 0,
    true,
    'drift/confidence mismatch wajib terhitung',
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

  assert.equal(json.report.tracking.totalRecords >= 1, true, 'json report harus sinkron dengan tracking');
  assert.equal(json.report.tracking.resolvedRecords >= 1, true, 'json report harus memuat resolved count');
  assert.equal(
    typeof json.report.calibration.expectedCalibrationError,
    'number',
    'json report wajib memuat metrik calibration',
  );
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
        runId,
        tracking: report.tracking,
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
