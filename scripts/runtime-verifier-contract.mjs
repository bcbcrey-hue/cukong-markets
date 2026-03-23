import 'dotenv/config';
import path from 'node:path';

function read(name, fallback = '') {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return fallback;
  }
  return value.trim();
}

function readBoolean(name, fallback = false) {
  const raw = read(name);
  if (!raw) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean in env ${name}: ${raw}`);
}

function readNumber(name, fallback) {
  const raw = read(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number in env ${name}: ${raw}`);
  }
  return parsed;
}

function maskSecret(raw) {
  if (!raw) {
    return null;
  }

  if (raw.length <= 8) {
    return `${raw.slice(0, 2)}***`;
  }

  return `${raw.slice(0, 4)}***${raw.slice(-2)}`;
}

const appPort = readNumber('APP_PORT', 3000);
const appBindHost = read('APP_BIND_HOST', '0.0.0.0');
const callbackEnabled = readBoolean('INDODAX_ENABLE_CALLBACK_SERVER', false);
const callbackPort = readNumber('INDODAX_CALLBACK_PORT', 3001);
const callbackBindHost = read('INDODAX_CALLBACK_BIND_HOST', '0.0.0.0');
const callbackPath = read('INDODAX_CALLBACK_PATH', '/indodax/callback') || '/indodax/callback';

const runtimeContract = {
  generatedAtUtc: new Date().toISOString(),
  verifierContractVersion: 'phase2-batch3-v1',
  sourceOfTruth: {
    repository: 'https://github.com/masreykangtrade-oss/cukong-markets',
    roadmap: 'https://github.com/masreykangtrade-oss/cukong-markets/blob/main/ROADMAP.md',
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
      bindHost: appBindHost,
      port: appPort,
      baseUrlFromVps: `http://127.0.0.1:${appPort}`,
      endpoints: ['/', '/healthz', '/livez'],
    },
    callbackServer: {
      enabled: callbackEnabled,
      bindHost: callbackBindHost,
      port: callbackPort,
      healthzPath: '/healthz',
      callbackPath,
      callbackAllowedHost: read('INDODAX_CALLBACK_ALLOWED_HOST', ''),
      callbackAuthMode: read('INDODAX_CALLBACK_AUTH_MODE', 'required'),
    },
  },
  runtimeDirectories: {
    dataDir: path.resolve(read('DATA_DIR', path.resolve(process.cwd(), 'data'))),
    logDir: path.resolve(read('LOG_DIR', path.resolve(process.cwd(), 'logs'))),
    tempDir: path.resolve(read('TEMP_DIR', path.resolve(process.cwd(), 'tmp'))),
  },
  telegramRuntimeTarget: {
    configuredByToken: Boolean(read('TELEGRAM_BOT_TOKEN', '')),
    allowedUsersCount: read('TELEGRAM_ALLOWED_USER_IDS', '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean).length,
    tokenMasked: maskSecret(read('TELEGRAM_BOT_TOKEN', '')),
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
      'Kontrak env + target probe endpoint + target startup phase log',
      'Worker build path target pada artifact dist',
    ],
    notProvableFromRepoOnly: [
      'Telegram live connected ke server Telegram pada VPS nyata',
      'Bind/listen aktual process di host VPS setelah deploy',
      'Endpoint probe dari jaringan VPS target (post-deploy runtime)',
    ],
  },
};

console.log(JSON.stringify(runtimeContract, null, 2));
