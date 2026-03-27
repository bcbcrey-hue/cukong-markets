import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const runtimeEnvModule = await import('../src/config/env.ts');
const env = runtimeEnvModule.env ?? runtimeEnvModule.default?.env;

if (!env) {
  throw new Error('Failed to load canonical runtime env from src/config/env.ts');
}

const CONTRACT_OUTPUT_PATH = path.resolve(
  process.cwd(),
  'test_reports/runtime_contract_batch_f_current.json',
);

function maskSecret(raw) {
  if (!raw) {
    return null;
  }

  if (raw.length <= 8) {
    return `${raw.slice(0, 2)}***`;
  }

  return `${raw.slice(0, 4)}***${raw.slice(-2)}`;
}

const runtimeContract = {
  generatedAtUtc: new Date().toISOString(),
  verifierContractVersion: 'phase2-batch-f-v1',
  sourceOfTruth: {
    repository: 'https://github.com/masreykangtrade-oss/cukong-markets',
    roadmap:
      'https://github.com/masreykangtrade-oss/cukong-markets/blob/main/ROADMAP_LOGIC_UPGRADE.md',
    runtimeEnvModule: 'src/config/env.ts',
  },
  processStart: {
    startCommand: 'npm run start',
    runtimeEntrypoint: 'dist/bootstrap.js',
    bootstrapPhasesExpected: [
      'load-runtime-modules',
      'ensure-runtime-dirs',
      'create-app',
      'start-app',
    ],
    appStartupPhasesExpected: [
      'persistence.bootstrap',
      'runtime.state.load',
      'worker-pool.start',
      'app-server.start',
      'callback-server.start',
      'execution.recover-live-orders',
      'execution.evaluate-open-positions',
      'telegram.start',
      'polling.start',
    ],
  },
  httpProbeTargets: {
    appServer: {
      bindHost: env.appBindHost,
      port: env.appPort,
      baseUrlFromVps: `http://127.0.0.1:${env.appPort}`,
      endpoints: ['/', '/healthz', '/livez'],
    },
    callbackServer: {
      enabled: env.indodaxEnableCallbackServer,
      bindHost: env.indodaxCallbackBindHost,
      port: env.indodaxCallbackPort,
      healthzPath: '/healthz',
      callbackPath: env.indodaxCallbackPath,
      callbackAllowedHost: env.indodaxCallbackAllowedHost,
      callbackAuthMode: env.indodaxCallbackAuthMode,
      callbackUrl: env.indodaxCallbackUrl,
    },
  },
  runtimeDirectories: {
    dataDir: env.dataDir,
    logDir: env.logDir,
    tempDir: env.tempDir,
  },
  telegramRuntimeTarget: {
    configuredByToken: Boolean(env.telegramToken),
    allowedUsersCount: env.telegramAllowedUserIds.length,
    tokenMasked: maskSecret(env.telegramToken),
    startupEvidenceMarker: 'telegram bot launched and connected',
    note: 'Status connected hanya bisa dibuktikan dari runtime VPS nyata.',
  },
  workerBuildPathTarget: {
    expectedFeatureWorkerPathSuffix: path.join('dist', 'workers', 'featureWorker.js'),
    expectedPatternWorkerPathSuffix: path.join('dist', 'workers', 'patternWorker.js'),
    expectedBacktestWorkerPathSuffix: path.join('dist', 'workers', 'backtestWorker.js'),
    recommendedEnv: {
      CUKONG_PREFER_DIST_WORKERS: '1',
    },
  },
  repoVsVpsProofBoundary: {
    provableFromRepo: [
      'Kontrak env canonical dari src/config/env.ts + target probe endpoint + target startup phase log',
      'Worker build path target pada artifact dist',
    ],
    notProvableFromRepoOnly: [
      'Telegram live connected ke server Telegram pada VPS nyata',
      'Bind/listen aktual process di host VPS setelah deploy',
      'Endpoint probe dari jaringan VPS target (post-deploy runtime)',
    ],
  },
  artifact: {
    path: CONTRACT_OUTPUT_PATH,
    generatedByCommand: 'npm run runtime:contract',
  },
};

async function main() {
  await mkdir(path.dirname(CONTRACT_OUTPUT_PATH), { recursive: true });
  const content = `${JSON.stringify(runtimeContract, null, 2)}\n`;
  await writeFile(CONTRACT_OUTPUT_PATH, content, 'utf8');

  process.stdout.write(content);
  process.stderr.write(`[runtime:contract] artifact written: ${CONTRACT_OUTPUT_PATH}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
