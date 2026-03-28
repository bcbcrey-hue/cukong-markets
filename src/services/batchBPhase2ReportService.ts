import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BatchBPhase2CalibrationReport } from '../core/types';

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function simplePdfFromText(lines: string[]): Buffer {
  const pageSize = 52;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += pageSize) pages.push(lines.slice(i, i + pageSize));
  if (pages.length === 0) pages.push(['Laporan Fase 2 kosong.']);

  const objects: string[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  let nextObjectId = 4;
  const pageObjectIds: number[] = [];

  for (const pageLines of pages) {
    const pageId = nextObjectId;
    const contentId = nextObjectId + 1;
    nextObjectId += 2;

    let y = 800;
    const stream = `BT\n/F1 10 Tf\n${pageLines
      .map((line) => {
        const out = `1 0 0 1 50 ${y} Tm (${escapePdfText(line)}) Tj`;
        y -= 14;
        return out;
      })
      .join('\n')}\nET`;

    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >> endobj`,
    );
    objects.push(`${contentId} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`);
    pageObjectIds.push(pageId);
  }

  objects.unshift(`${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`);
  objects.unshift(
    `${pagesId} 0 obj << /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >> endobj`,
  );
  objects.unshift(`${catalogId} 0 obj << /Type /Catalog /Pages ${pagesId} 0 R >> endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

function markdownFromReport(report: BatchBPhase2CalibrationReport): string {
  const bucketLines = report.calibration.confidenceBucketAccuracy
    .map((item) => `- ${item.key}: akurasi=${(item.directionAccuracy * 100).toFixed(2)}% resolved=${item.resolved} pending=${item.unresolved}`)
    .join('\n');
  const warningLines = report.calibration.warningAreas.map((item) => `- ${item}`).join('\n');

  return [
    '# Batch B Fase 2 — Shadow-Live Calibration Report',
    '',
    `Run ID: ${report.calibration.runId}`,
    `Generated At (UTC): ${report.calibration.generatedAt}`,
    '',
    '## Ringkasan Tracking',
    `- Total prediction: ${report.tracking.totalRecords}`,
    `- Resolved: ${report.tracking.resolvedRecords}`,
    `- Pending: ${report.tracking.pendingRecords}`,
    `- Expired: ${report.tracking.expiredRecords}`,
    `- Insufficient-data: ${report.tracking.insufficientDataRecords}`,
    '',
    '## Akurasi per Confidence Bucket',
    bucketLines || '- belum ada data',
    '',
    '## Drift & Calibration',
    `- Mean absolute confidence calibration gap: ${report.calibration.meanAbsoluteConfidenceCalibrationGap.toFixed(5)}`,
    `- Expected calibration error (ECE): ${report.calibration.expectedCalibrationError.toFixed(5)}`,
    `- Mean drift horizon: ${report.calibration.driftSummary.meanAbsoluteDriftMinutes.toFixed(2)} menit`,
    `- P95 drift horizon: ${report.calibration.driftSummary.p95AbsoluteDriftMinutes.toFixed(2)} menit`,
    `- Confidence mismatch count: ${report.calibration.driftSummary.confidenceMismatchCount}`,
    '',
    '## Rekomendasi Adjustment',
    `- ${report.calibration.conservativeAdjustmentRecommendation}`,
    '',
    '## Warning Area Prediction',
    warningLines || '- tidak ada warning aktif',
    '',
    '## Keterbatasan Pengujian',
    ...report.limitations.map((item) => `- ${item}`),
    '',
    '> Batas jujur: ini lapisan lanjutan shadow-live calibration prediction Batch B, bukan pengganti Batch F dan bukan market-real capital validation.',
    '',
  ].join('\n');
}

export interface BatchBPhase2ArtifactPaths {
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
  pdfPath: string;
}

export async function writeBatchBPhase2Artifacts(input: {
  report: BatchBPhase2CalibrationReport;
  outputDir: string;
}): Promise<BatchBPhase2ArtifactPaths> {
  const outputDir = path.resolve(process.cwd(), input.outputDir);
  await mkdir(outputDir, { recursive: true });

  const jsonPath = path.resolve(outputDir, 'batch_b_phase2_report.json');
  const markdownPath = path.resolve(outputDir, 'batch_b_phase2_report.md');
  const pdfPath = path.resolve(outputDir, 'batch_b_phase2_report.pdf');

  await writeFile(jsonPath, `${JSON.stringify({ report: input.report }, null, 2)}\n`, 'utf8');
  const markdown = markdownFromReport(input.report);
  await writeFile(markdownPath, markdown, 'utf8');

  const lines = markdown
    .split('\n')
    .map((line) => line.replace(/^#+\s*/g, '').trim())
    .filter((line) => line.length > 0);
  await writeFile(pdfPath, simplePdfFromText(lines));

  return { outputDir, jsonPath, markdownPath, pdfPath };
}
