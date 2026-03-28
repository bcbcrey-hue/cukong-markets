import 'dotenv/config';
const persistenceModule = await import('../src/services/persistenceService.ts');
const phase1Module = await import('../src/domain/backtest/predictionValidationPhase1.ts');
const reportModule = await import('../src/services/predictionValidationReportService.ts');
const PersistenceService =
  persistenceModule.PersistenceService ?? persistenceModule.default?.PersistenceService;
const createDefaultSettings =
  persistenceModule.createDefaultSettings ?? persistenceModule.default?.createDefaultSettings;
const BatchBPredictionPhase1Validator =
  phase1Module.BatchBPredictionPhase1Validator ?? phase1Module.default?.BatchBPredictionPhase1Validator;
const buildBatchBPredictionPhase1Report =
  phase1Module.buildBatchBPredictionPhase1Report ?? phase1Module.default?.buildBatchBPredictionPhase1Report;
const writeBatchBPhase1Artifacts =
  reportModule.writeBatchBPhase1Artifacts ?? reportModule.default?.writeBatchBPhase1Artifacts;

if (
  !PersistenceService ||
  !createDefaultSettings ||
  !BatchBPredictionPhase1Validator ||
  !buildBatchBPredictionPhase1Report ||
  !writeBatchBPhase1Artifacts
) {
  throw new Error('Failed to load Batch B Phase 1 validation modules');
}

function numOrUndefined(value) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main() {
  const persistence = new PersistenceService();
  const settings = createDefaultSettings();
  const validator = new BatchBPredictionPhase1Validator(persistence);

  const config = {
    pair: process.env.BATCH_B_PHASE1_PAIR || undefined,
    startTime: numOrUndefined(process.env.BATCH_B_PHASE1_START_TIME),
    endTime: numOrUndefined(process.env.BATCH_B_PHASE1_END_TIME),
    maxEvents: numOrUndefined(process.env.BATCH_B_PHASE1_MAX_EVENTS),
  };

  const result = await validator.run(config, settings);
  const report = buildBatchBPredictionPhase1Report(result);
  const artifacts = await writeBatchBPhase1Artifacts({
    result,
    report,
    outputDir: process.env.BATCH_B_PHASE1_OUTPUT_DIR || 'test_reports/batch_b_phase1',
  });

  const summary = {
    runId: result.runId,
    snapshots: result.totalSnapshotsEvaluated,
    totalPredictions: result.metrics.totalPredictionCount,
    resolved: result.metrics.resolvedPredictionCount,
    unresolved: result.metrics.unresolvedOrSkippedCount,
    directionAccuracy: result.metrics.overallDirectionAccuracy,
    recommendation: result.metrics.conservativeThresholdRecommendation,
    artifacts,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
