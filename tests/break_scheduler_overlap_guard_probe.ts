import assert from 'node:assert/strict';

import { LightScheduler } from '../src/core/scheduler';

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const scheduler = new LightScheduler();
  let runCount = 0;

  scheduler.add({
    name: 'overlap-test',
    intervalMs: 1_000,
    run: async () => {
      runCount += 1;
      await delay(40);
    },
  });

  const firstRun = scheduler.runNow('overlap-test');
  await delay(5);
  const secondRun = scheduler.runNow('overlap-test');

  await Promise.all([firstRun, secondRun]);

  const status = scheduler.get('overlap-test');
  assert.ok(status, 'job status wajib tersedia');
  assert.equal(runCount, 1, 'scheduler harus skip overlap agar job tidak berjalan bersamaan');
  assert.equal(status?.runs, 1, 'counter run harus tetap 1 saat overlap dipaksa');

  console.log('PASS break_scheduler_overlap_guard_probe');
}

main().catch((error) => {
  console.error('FAIL break_scheduler_overlap_guard_probe');
  console.error(error);
  process.exit(1);
});
