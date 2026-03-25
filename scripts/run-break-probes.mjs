import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const breakProbes = [
  'tests/break_startup_corrupted_state_probe.ts',
  'tests/break_state_atomicity_probe.ts',
  'tests/break_scheduler_overlap_guard_probe.ts',
];

async function runProbe(probe, index) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), `cukong-break-${index}-`));
  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    DATA_DIR: dataDir,
    LOG_DIR: path.join(dataDir, 'logs'),
    TEMP_DIR: path.join(dataDir, 'tmp'),
    APP_PORT: String(4300 + index),
    INDODAX_CALLBACK_PORT: String(5300 + index),
    APP_BIND_HOST: '127.0.0.1',
    INDODAX_CALLBACK_BIND_HOST: '127.0.0.1',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'test-token',
    TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS || '1',
  };

  try {
    const { stdout, stderr } = await execFileAsync('npm', ['exec', '--', 'tsx', probe], {
      cwd: repoRoot,
      env,
    });

    return {
      probe,
      status: 'PASS',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const failure = error;
    return {
      probe,
      status: 'FAIL',
      stdout: typeof failure.stdout === 'string' ? failure.stdout.trim() : '',
      stderr: typeof failure.stderr === 'string' ? failure.stderr.trim() : '',
      exitCode: typeof failure.code === 'number' ? failure.code : null,
    };
  }
}

async function main() {
  const results = [];

  for (const [index, probe] of breakProbes.entries()) {
    process.stdout.write(`\n[break-probe] ${probe}\n`);
    const result = await runProbe(probe, index + 1);
    results.push(result);

    if (result.stdout) {
      process.stdout.write(`${result.stdout}\n`);
    }
    if (result.stderr) {
      process.stderr.write(`${result.stderr}\n`);
    }

    process.stdout.write(`[break-probe-result] ${result.status}: ${probe}\n`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((item) => item.status === 'PASS').length,
    failed: results.filter((item) => item.status === 'FAIL').length,
    results,
  };

  const reportsDir = path.join(repoRoot, 'test_reports');
  await mkdir(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'break_test_latest.json');
  await writeFile(outputPath, JSON.stringify(summary, null, 2), 'utf8');

  process.stdout.write(`\nBreak test report written to ${outputPath}\n`);
  process.stdout.write(`Break probes passed=${summary.passed} failed=${summary.failed}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
