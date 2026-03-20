import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const probes = [
  'tests/private_api_v2_mapping_probe.ts',
  'tests/nginx_renderer_probe.ts',
  'tests/http_servers_probe.ts',
  'tests/telegram_menu_navigation_probe.ts',
  'tests/telegram_slippage_confirmation_probe.ts',
  'tests/runtime_backend_regression.ts',
  'tests/live_execution_hardening_probe.ts',
  'tests/execution_summary_failed_probe.ts',
  'tests/indodax_history_v2_probe.ts',
  'tests/app_lifecycle_servers_probe.ts',
  'tests/callback_reconciliation_probe.ts',
];

async function runProbe(probe, index) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), `cukong-probe-${index}-`));
  const appPort = String(3800 + index * 2);
  const callbackPort = String(3900 + index * 2);

  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    APP_NAME: process.env.APP_NAME || 'cukong-markets',
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'https://kangtrade.top',
    APP_BIND_HOST: process.env.APP_BIND_HOST || '127.0.0.1',
    APP_PORT: process.env.APP_PORT || appPort,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token',
    TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS || '1',
    INDODAX_CALLBACK_PATH: process.env.INDODAX_CALLBACK_PATH || '/indodax/callback',
    INDODAX_CALLBACK_PORT: process.env.INDODAX_CALLBACK_PORT || callbackPort,
    INDODAX_CALLBACK_BIND_HOST: process.env.INDODAX_CALLBACK_BIND_HOST || '127.0.0.1',
    INDODAX_CALLBACK_ALLOWED_HOST: process.env.INDODAX_CALLBACK_ALLOWED_HOST || 'kangtrade.top',
    INDODAX_ENABLE_CALLBACK_SERVER: process.env.INDODAX_ENABLE_CALLBACK_SERVER || 'true',
    INDODAX_PUBLIC_BASE_URL: process.env.INDODAX_PUBLIC_BASE_URL || 'https://indodax.com/api',
    INDODAX_PRIVATE_BASE_URL: process.env.INDODAX_PRIVATE_BASE_URL || 'https://indodax.com/tapi',
    INDODAX_TRADE_API_V2_BASE_URL: process.env.INDODAX_TRADE_API_V2_BASE_URL || 'https://tapi.indodax.com',
    DATA_DIR: dataDir,
    LOG_DIR: path.join(dataDir, 'logs'),
    TEMP_DIR: path.join(dataDir, 'tmp'),
  };

  process.stdout.write(`\n[probe] ${probe}\n`);
  const { stdout, stderr } = await execFileAsync(
    './node_modules/.bin/tsx',
    [probe],
    { cwd: '/app', env },
  );

  if (stdout.trim()) {
    process.stdout.write(stdout);
    if (!stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  if (stderr.trim()) {
    process.stderr.write(stderr);
    if (!stderr.endsWith('\n')) {
      process.stderr.write('\n');
    }
  }
}

async function main() {
  for (const [index, probe] of probes.entries()) {
    await runProbe(probe, index + 1);
  }

  console.log('\nAll probes passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});