const [{ PersistenceService }, { BatchBPhase2CalibrationService }, { writeBatchBPhase2Artifacts }] = await Promise.all([
  import('../src/services/persistenceService.ts'),
  import('../src/services/batchBPhase2CalibrationService.ts'),
  import('../src/services/batchBPhase2ReportService.ts'),
]);

async function main() {
  const runId = process.env.BATCH_B_PHASE2_RUN_ID;
  if (!runId) {
    throw new Error('BATCH_B_PHASE2_RUN_ID wajib diisi agar kalibrasi menempel ke run shadow-live existing.');
  }

  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const service = new BatchBPhase2CalibrationService(persistence);
  const report = await service.runPhase2ForRunId(runId);

  const outputDir = process.env.BATCH_B_PHASE2_OUTPUT_DIR || 'test_reports/batch_b_phase2';
  const artifacts = await writeBatchBPhase2Artifacts({ report, outputDir });

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        runId,
        tracking: report.tracking,
        artifacts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
