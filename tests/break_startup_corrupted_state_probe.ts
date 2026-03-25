import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { env } from '../src/config/env';

async function main() {
  const dataDir = process.env.DATA_DIR;
  assert.ok(dataDir, 'DATA_DIR wajib di-set untuk isolasi break probe');

  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(dataDir), { recursive: true });
  await fs.mkdir(path.dirname(env.stateFile), { recursive: true });

  await fs.writeFile(env.stateFile, '{"status":"RUNNING",,,,', 'utf8');

  const { createApp } = await import('../src/app');

  let startupError: unknown = null;
  try {
    await createApp();
  } catch (error) {
    startupError = error;
  }

  assert.equal(
    startupError,
    null,
    [
      'Startup harus punya recovery path saat state file rusak.',
      'Saat ini createApp gagal total jika state JSON korup (single-point startup failure).',
    ].join(' '),
  );

  console.log('PASS break_startup_corrupted_state_probe');
}

main().catch((error) => {
  console.error('FAIL break_startup_corrupted_state_probe');
  console.error(error);
  process.exit(1);
});
