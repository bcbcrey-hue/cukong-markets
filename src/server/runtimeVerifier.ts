import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env';

const verifierBootId = randomUUID();
const verifierBootedAt = new Date().toISOString();

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function isPidLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface RuntimeVerifierContract {
  contractVersion: 'runtime_target_v1';
  target: {
    app: string;
    pid: number;
    ppid: number;
    processLive: boolean;
    bootId: string;
    bootedAt: string;
    nodeVersion: string;
    execPath: string;
    argvHash: string;
    cwd: string;
    bindHost: string;
    port: number;
    healthzPath: '/healthz';
    livezPath: '/livez';
    dataDir: string;
    stateFile: string;
    healthFile: string;
  };
  evidence: {
    source: 'live_process';
    generatedAt: string;
  };
}

export function buildRuntimeVerifierContract(appPort: number): RuntimeVerifierContract {
  return {
    contractVersion: 'runtime_target_v1',
    target: {
      app: env.appName,
      pid: process.pid,
      ppid: process.ppid,
      processLive: isPidLive(process.pid),
      bootId: verifierBootId,
      bootedAt: verifierBootedAt,
      nodeVersion: process.version,
      execPath: process.execPath,
      argvHash: shortHash(process.argv.join('\u0000')),
      cwd: process.cwd(),
      bindHost: env.appBindHost,
      port: appPort,
      healthzPath: '/healthz',
      livezPath: '/livez',
      dataDir: env.dataDir,
      stateFile: env.stateFile,
      healthFile: env.healthFile,
    },
    evidence: {
      source: 'live_process',
      generatedAt: new Date().toISOString(),
    },
  };
}
