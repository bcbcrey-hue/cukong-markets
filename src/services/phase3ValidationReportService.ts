import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Phase3ReadinessReport } from '../core/types';

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function simplePdfFromText(lines: string[]): Buffer {
  const pageSize = 52;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += pageSize) pages.push(lines.slice(i, i + pageSize));
  if (pages.length === 0) pages.push(['Laporan Fase 3 kosong.']);

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

function markdownFromReport(report: Phase3ReadinessReport): string {
  const sectionLines = report.sections
    .map((section) => {
      const checks = section.checks
        .map((check) => {
          const note = check.notes?.length ? ` | notes=${check.notes.join('; ')}` : '';
          return `- [${check.pass ? 'PASS' : 'FAIL'}] ${check.id} (${check.proofLevel}, ${check.automated ? 'otomatis' : 'manual'})${note}`;
        })
        .join('\n');

      return [
        `## ${section.name}`,
        section.summary,
        checks || '- belum ada check',
      ].join('\n');
    })
    .join('\n\n');

  const checklistLines = report.checklist
    .map((item) => `- ${item.id}: ${item.status} (${item.requiredProofLevel}) — ${item.description}`)
    .join('\n');

  return [
    '# Fase 3 — Market-Real Validation Report',
    '',
    `Run ID: ${report.runId}`,
    `Generated At (UTC): ${report.generatedAt}`,
    `Verdict readiness: ${report.readinessVerdict}`,
    '',
    sectionLines,
    '',
    '## Readiness Checklist',
    checklistLines || '- checklist kosong',
    '',
    '## Batas Bukti',
    `- Source/probe proof: ${report.boundaryNotes.sourceProbeProof}`,
    `- Shadow-live proof: ${report.boundaryNotes.shadowLiveProof}`,
    `- Market-real proof: ${report.boundaryNotes.marketRealProof}`,
    '',
    '## Limitations',
    ...report.limitations.map((item) => `- ${item}`),
    '',
    '> Kejujuran readiness: laporan ini tidak boleh mengklaim market-real pass tanpa environment exchange nyata.',
    '',
  ].join('\n');
}

export interface Phase3ArtifactPaths {
  outputDir: string;
  jsonPath: string;
  markdownPath: string;
  pdfPath: string;
}

export async function writePhase3ValidationArtifacts(input: {
  report: Phase3ReadinessReport;
  outputDir: string;
}): Promise<Phase3ArtifactPaths> {
  const outputDir = path.resolve(process.cwd(), input.outputDir);
  await mkdir(outputDir, { recursive: true });

  const jsonPath = path.resolve(outputDir, 'phase3_market_real_validation_report.json');
  const markdownPath = path.resolve(outputDir, 'phase3_market_real_validation_report.md');
  const pdfPath = path.resolve(outputDir, 'phase3_market_real_validation_report.pdf');

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
