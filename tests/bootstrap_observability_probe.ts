import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

async function main() {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'cukong-bootstrap-observe-'));
  const occupiedPort = 3987;

  const blocker = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('occupied');
  });

  await new Promise<void>((resolve) => {
    blocker.listen(occupiedPort, '127.0.0.1', () => resolve());
  });

  try {
    await execFileAsync('node', ['dist/bootstrap.js'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        APP_NAME: 'cukong-markets',
        PUBLIC_BASE_URL: 'https://kangtrade.top',
        APP_BIND_HOST: '127.0.0.1',
        APP_PORT: String(occupiedPort),
        TELEGRAM_BOT_TOKEN: 'test-telegram-token',
        TELEGRAM_ALLOWED_USER_IDS: '1',
        INDODAX_CALLBACK_PATH: '/indodax/callback',
        INDODAX_CALLBACK_PORT: '3988',
        INDODAX_CALLBACK_BIND_HOST: '127.0.0.1',
        INDODAX_CALLBACK_ALLOWED_HOST: 'kangtrade.top',
        INDODAX_ENABLE_CALLBACK_SERVER: 'false',
        INDODAX_PUBLIC_BASE_URL: 'https://indodax.com/api',
        INDODAX_PRIVATE_BASE_URL: 'https://indodax.com/tapi',
        INDODAX_TRADE_API_V2_BASE_URL: 'https://tapi.indodax.com',
        DATA_DIR: tempDataDir,
        LOG_DIR: path.join(tempDataDir, 'logs'),
        TEMP_DIR: path.join(tempDataDir, 'tmp'),
        WORKER_ENABLED: 'false',
      },
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    });

    assert.fail('bootstrap should fail when APP_PORT is already occupied');
  } catch (error) {
    const failure = error as Error & {
      stdout?: string;
      stderr?: string;
    };
    const combinedOutput = `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`;

    assert.match(
      combinedOutput,
      /bootstrap phase failed|startup failed/i,
      'bootstrap failure log must contain startup failure marker',
    );
    assert.match(
      combinedOutput,
      /app-server\.start|start-app/i,
      'bootstrap failure log must reveal app server startup phase',
    );
    assert.match(
      combinedOutput,
      /EADDRINUSE|address already in use/i,
      'bootstrap failure log must preserve port bind root cause',
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      blocker.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve();
      });
    });
  }

  console.log('PASS bootstrap_observability_probe');
}

main().catch((error) => {
  console.error('FAIL bootstrap_observability_probe');
  console.error(error);
  process.exit(1);
});
