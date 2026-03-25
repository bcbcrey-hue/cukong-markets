import assert from 'node:assert/strict';

import { LightScheduler } from '../src/core/scheduler';

async function main() {
  const scheduler = new LightScheduler();

  let startedRuns = 0;
  let releaseRun: () => void = () => {
    throw new Error('releaseRun not initialized');
  };
  let releaseInitialized = false;

  const firstRunStarted = new Promise<void>((resolve) => {
    scheduler.add({
      name: 'overlap-guard-probe',
      intervalMs: 1_000,
      run: async () => {
        startedRuns += 1;
        resolve();
        await new Promise<void>((resume) => {
          releaseRun = resume;
          releaseInitialized = true;
        });
      },
    });
  });

  const firstExecution = scheduler.runNow('overlap-guard-probe');
  await firstRunStarted;

  await scheduler.runNow('overlap-guard-probe');

  assert.equal(
    startedRuns,
    1,
    'second forced concurrent run must be skipped while first run is still active',
  );

  const statusDuringRun = scheduler.get('overlap-guard-probe');
  assert.ok(statusDuringRun, 'probe job status should be available while running');
  assert.equal(statusDuringRun?.running, true, 'job must stay marked running while first execution is unresolved');
  assert.equal(statusDuringRun?.runs, 0, 'run counter must not increment before first execution finishes');

  if (!releaseInitialized) {
    throw new Error('probe harness must capture release function for first run');
  }
  releaseRun();
  await firstExecution;

  const statusAfterRun = scheduler.get('overlap-guard-probe');
  assert.ok(statusAfterRun, 'probe job status should remain queryable after run completion');
  assert.equal(statusAfterRun?.running, false, 'job must clear running flag after completion');
  assert.equal(statusAfterRun?.runs, 1, 'exactly one execution should be committed after overlap skip');

  console.log('PASS scheduler_overlap_guard_probe');
}

main().catch((error) => {
  console.error('FAIL scheduler_overlap_guard_probe');
  console.error(error);
  process.exit(1);
});
