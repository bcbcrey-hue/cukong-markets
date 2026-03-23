import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createApp } from '../src/app';
import { TelegramBot } from '../src/integrations/telegram/bot';

async function main(): Promise<void> {

  const originalStart = TelegramBot.prototype.start;
  const originalStop = TelegramBot.prototype.stop;

  TelegramBot.prototype.start = async function patchedStart() {
    const signalHolder = this as unknown as {
      signal: {
        configured: boolean;
        launched: boolean;
        running: boolean;
        connected: boolean;
        lastConnectionStatus: string;
      };
    };

    signalHolder.signal = {
      ...signalHolder.signal,
      configured: true,
      launched: true,
      running: true,
      connected: true,
      lastConnectionStatus: 'connected',
    };
  };

  TelegramBot.prototype.stop = async function patchedStop() {
    return;
  };

  const app = await createApp();

  const foreignProcess = spawn(process.execPath, ['-e', 'setInterval(() => {}, 60_000)'], {
    stdio: 'ignore',
    detached: false,
  });
  const foreignPid = foreignProcess.pid ?? NaN;

  try {
    await app.start();

    const appPort = Number(process.env.APP_PORT ?? '3000');
    const response = await fetch(`http://127.0.0.1:${appPort}/verifier/runtime-target`);
    assert.equal(response.status, 200, 'runtime verifier endpoint must respond 200');

    const payload = (await response.json()) as {
      ok: boolean;
      verifier: {
        contractVersion: string;
        target: {
          pid: number;
          ppid: number;
          processLive: boolean;
          app: string;
          bootId: string;
          bootedAt: string;
          bindHost: string;
          port: number;
          dataDir: string;
          stateFile: string;
          healthFile: string;
          argvHash: string;
        };
      };
    };

    assert.equal(payload.ok, true, 'runtime verifier contract must return ok=true');
    assert.equal(payload.verifier.contractVersion, 'runtime_target_v1');
    assert.equal(payload.verifier.target.pid, process.pid, 'verifier PID must map to active runtime process');
    assert.equal(payload.verifier.target.ppid, process.ppid, 'verifier PPID must map to active runtime process');
    assert.equal(payload.verifier.target.processLive, true, 'verifier must state active process is live');
    assert.equal(
      payload.verifier.target.app,
      process.env.APP_NAME ?? 'cukong-markets',
      'verifier app identity must match target app',
    );
    assert.equal(
      payload.verifier.target.bindHost,
      process.env.APP_BIND_HOST ?? '0.0.0.0',
      'bind host must match runtime target',
    );
    assert.equal(payload.verifier.target.port, appPort, 'verifier must report active app port');
    assert.ok(payload.verifier.target.dataDir.length > 0, 'verifier dataDir must be present');
    assert.ok(payload.verifier.target.stateFile.length > 0, 'verifier stateFile must be present');
    assert.ok(payload.verifier.target.healthFile.length > 0, 'verifier healthFile must be present');
    assert.ok(payload.verifier.target.bootId.length > 0, 'verifier bootId must be present');
    assert.ok(payload.verifier.target.bootedAt.length > 0, 'verifier bootedAt must be present');
    assert.ok(payload.verifier.target.argvHash.length > 0, 'verifier argvHash must be present');

    const serializedPayload = JSON.stringify(payload);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token) {
      assert.ok(!serializedPayload.includes(token), 'verifier output must not leak telegram token');
    }

    const previousHealthFile = await readFile(payload.verifier.target.healthFile, 'utf-8');
    await writeFile(
      payload.verifier.target.healthFile,
      JSON.stringify({ verifier: { target: { pid: 999999, app: 'fake-app' } } }, null, 2),
      'utf-8',
    );

    const responseAfterStaleOverwrite = await fetch(
      `http://127.0.0.1:${appPort}/verifier/runtime-target`,
    );
    assert.equal(responseAfterStaleOverwrite.status, 200);

    const payloadAfterStaleOverwrite = (await responseAfterStaleOverwrite.json()) as {
      verifier: { target: { pid: number; app: string } };
    };

    assert.equal(
      payloadAfterStaleOverwrite.verifier.target.pid,
      process.pid,
      'verifier PID must come from active runtime process, not stale file contents',
    );
    assert.equal(
      payloadAfterStaleOverwrite.verifier.target.app,
      process.env.APP_NAME ?? 'cukong-markets',
      'verifier app identity must come from active runtime process, not stale file contents',
    );

    await writeFile(payload.verifier.target.healthFile, previousHealthFile, 'utf-8');

    if (!Number.isNaN(foreignPid) && foreignPid > 0) {
      assert.notEqual(
        payloadAfterStaleOverwrite.verifier.target.pid,
        foreignPid,
        'verifier PID must not be confused with unrelated host process',
      );
    }

    console.log('PASS runtime_target_verifier_probe');
  } finally {
    await app.stop();
    TelegramBot.prototype.start = originalStart;
    TelegramBot.prototype.stop = originalStop;
    if (!Number.isNaN(foreignPid) && foreignPid > 0) {
      try {
        process.kill(foreignPid, 'SIGTERM');
      } catch {
        // ignore cleanup error
      }
    }
  }
}

main().catch((error) => {
  console.error('FAIL runtime_target_verifier_probe');
  console.error(error);
  process.exit(1);
});
