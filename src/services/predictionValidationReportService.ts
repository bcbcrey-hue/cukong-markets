import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BatchBPredictionPhase1Report,
  BatchBPredictionValidationResult,
} from '../core/types';

function asPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function markdownFromReport(report: BatchBPredictionPhase1Report): string {
  const bucketLines = report.accuracySummary.confidenceBucketAccuracy
    .map((item) => `- ${item.key}: acc=${asPct(item.directionAccuracy)} (resolved=${item.resolved}, unresolved=${item.unresolved})`)
    .join('\n');

  const regimeLines = report.regimeBreakdown
    .map((item) => `- ${item.key}: acc=${asPct(item.directionAccuracy)} resolved=${item.resolved}`)
    .join('\n');

  const pairClassLines = report.pairClassBreakdown
    .map((item) => `- ${item.key}: acc=${asPct(item.directionAccuracy)} resolved=${item.resolved}`)
    .join('\n');

  const strengthLines = report.predictionStrengthBreakdown
    .map((item) => `- ${item.key}: acc=${asPct(item.directionAccuracy)} resolved=${item.resolved}`)
    .join('\n');

  const qualityLines = report.sourceQualityBreakdown
    .map((item) => `- ${item.key}: acc=${asPct(item.directionAccuracy)} resolved=${item.resolved}`)
    .join('\n');

  const failureLines = report.failureZones
    .map((item) => `- ${item.dimension}:${item.key} -> acc=${asPct(item.directionAccuracy)} resolved=${item.resolved}`)
    .join('\n');

  return [
    '# Batch B — Phase 1 Historical Quantitative Validation Report',
    '',
    `Run ID: ${report.runId}`,
    `Generated At (UTC): ${report.generatedAt}`,
    '',
    '## Executive Summary',
    `- ${report.executiveSummary.headline}`,
    `- Total predictions: ${report.executiveSummary.totalPredictions}`,
    `- Resolved predictions: ${report.executiveSummary.resolvedPredictions}`,
    `- Unresolved/skipped: ${report.executiveSummary.unresolvedPredictions}`,
    `- Direction accuracy: ${asPct(report.executiveSummary.directionAccuracy)}`,
    `- Honest boundary: ${report.executiveSummary.caveat}`,
    '',
    '## Accuracy Summary',
    `- Overall direction accuracy: ${asPct(report.accuracySummary.overallDirectionAccuracy)}`,
    `- Expected move MAE: ${report.accuracySummary.expectedMoveError.meanAbsoluteErrorPct.toFixed(4)}%`,
    `- Expected move P95 abs error: ${report.accuracySummary.expectedMoveError.p95AbsoluteErrorPct.toFixed(4)}%`,
    `- Mean horizon drift: ${report.accuracySummary.horizonErrorSummary.meanAbsoluteResolutionDriftMinutes.toFixed(2)}m`,
    `- P95 horizon drift: ${report.accuracySummary.horizonErrorSummary.p95ResolutionDriftMinutes.toFixed(2)}m`,
    '',
    '### Confidence Bucket Accuracy',
    bucketLines || '- (tidak ada data)',
    '',
    '## Calibration Summary',
    `- Mean calibration error: ${report.calibrationSummary.meanCalibrationError.toFixed(5)}`,
    ...report.calibrationSummary.byCalibrationTag.map((item) =>
      `- ${item.key}: acc=${asPct(item.directionAccuracy)} resolved=${item.resolved}`,
    ),
    '',
    '## Regime Breakdown',
    regimeLines || '- (tidak ada data)',
    '',
    '## Pair-Class Breakdown',
    pairClassLines || '- (tidak ada data)',
    '',
    '## Prediction Strength Breakdown',
    strengthLines || '- (tidak ada data)',
    '',
    '## Trade-Flow Source/Quality Breakdown',
    qualityLines || '- (tidak ada data)',
    '',
    '## Failure Zones',
    failureLines || '- (tidak ada failure zone sample yang memenuhi)',
    '',
    '## Conservative Threshold Recommendation',
    `- Recommended confidence threshold: ${report.conservativeThresholdRecommendation.confidenceThreshold.toFixed(2)}`,
    `- Expected direction accuracy: ${asPct(report.conservativeThresholdRecommendation.expectedDirectionAccuracy)}`,
    `- Resolved sample count: ${report.conservativeThresholdRecommendation.resolvedSampleCount}`,
    `- Mean absolute move error: ${report.conservativeThresholdRecommendation.meanAbsoluteMoveErrorPct.toFixed(4)}%`,
    `- Rationale: ${report.conservativeThresholdRecommendation.rationale}`,
    '',
    '## Limitations',
    ...report.limitations.map((item) => `- ${item}`),
    '',
    '> Catatan jujur: ini validasi historis source-level, BUKAN bukti siap live-trading.',
    '',
  ].join('\n');
}

function simplePdfFromText(lines: string[]): Buffer {
  const escapedLines = lines.map((line) => escapePdfText(line));
  let y = 800;
  const textOps = escapedLines
    .flatMap((line) => {
      const currentY = y;
      y -= 14;
      return [`1 0 0 1 50 ${currentY} Tm (${line}) Tj`];
    })
    .join('\n');

  const stream = `BT\n/F1 10 Tf\n${textOps}\nET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
  ];

  let content = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(content.length);
    content += `${object}\n`;
  }

  const xrefStart = content.length;
  content += `xref\n0 ${objects.length + 1}\n`;
  content += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    content += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  content += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(content, 'utf8');
}

export interface BatchBPhase1ArtifactPaths {
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
  pdfPath: string;
}

export async function writeBatchBPhase1Artifacts(input: {
  result: BatchBPredictionValidationResult;
  report: BatchBPredictionPhase1Report;
  outputDir: string;
}): Promise<BatchBPhase1ArtifactPaths> {
  const outputDir = path.resolve(process.cwd(), input.outputDir);
  await mkdir(outputDir, { recursive: true });

  const jsonPath = path.resolve(outputDir, 'batch_b_phase1_report.json');
  const markdownPath = path.resolve(outputDir, 'batch_b_phase1_report.md');
  const pdfPath = path.resolve(outputDir, 'batch_b_phase1_report.pdf');

  const machineReadable = {
    result: input.result,
    report: input.report,
  };
  await writeFile(jsonPath, `${JSON.stringify(machineReadable, null, 2)}\n`, 'utf8');

  const markdown = markdownFromReport(input.report);
  await writeFile(markdownPath, markdown, 'utf8');

  const pdfLines = markdown
    .split('\n')
    .map((line) => line.replace(/^#+\s*/g, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 52);
  const pdf = simplePdfFromText(pdfLines);
  await writeFile(pdfPath, pdf);

  return {
    outputDir,
    jsonPath,
    markdownPath,
    pdfPath,
  };
}
