import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createApp } from '../src/app';
import { env } from '../src/config/env';

async function main() {
  await mkdir(path.dirname(env.stateFile), { recursive: true });
  await writeFile(env.stateFile, '{"status":"RUNNING", invalid-json', 'utf8');

  await createApp();

  const repairedRaw = await readFile(env.stateFile, 'utf8');
  const repairedState = JSON.parse(repairedRaw) as { status: string; lastSignals: unknown[] };

  assert.equal(repairedState.status, 'IDLE', 'corrupted startup state must recover to fallback runtime state');
  assert.deepEqual(
    repairedState.lastSignals,
    [],
    'fallback runtime state must initialize canonical signal arrays after corrupted startup recovery',
  );

  const stateDirEntries = await readdir(path.dirname(env.stateFile));
  const quarantineFile = stateDirEntries.find((entry) =>
    entry.startsWith('runtime-state.json.corrupt-') && entry.endsWith('.json'),
  );

  assert.ok(
    quarantineFile,
    'startup recovery must quarantine corrupted state file for observability and forensic follow-up',
  );

  console.log('PASS startup_corrupted_state_probe');
}

main().catch((error) => {
  console.error('FAIL startup_corrupted_state_probe');
  console.error(error);
  process.exit(1);
});
