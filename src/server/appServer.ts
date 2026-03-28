import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { env } from '../config/env';
import { createChildLogger } from '../core/logger';
import { HealthService } from '../services/healthService';

const log = createChildLogger({ module: 'app-server' });

export class AppServer {
  private server: Server | null = null;
  private port = env.appPort;

  constructor(private readonly health: HealthService) {}

  private writeJson(
    response: ServerResponse,
    statusCode: number,
    payload: Record<string, unknown>,
  ): void {
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }

  private getPath(request: IncomingMessage): string {
    return new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const path = this.getPath(request);

    if (request.method !== 'GET') {
      this.writeJson(response, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }

    if (path === '/healthz') {
      const currentHealth = this.health.get();
      const live = this.health.isLive(currentHealth);
      const ready = this.health.isReady(currentHealth);

      this.writeJson(response, ready ? 200 : 503, {
        ok: ready,
        live,
        ready,
        app: env.appName,
        server: {
          host: env.appBindHost,
          port: this.port,
        },
        publicBaseUrl: env.publicBaseUrl || null,
        callback: {
          enabled: env.indodaxEnableCallbackServer,
          running: currentHealth.callbackServerRunning,
          path: env.indodaxCallbackPath,
          port: env.indodaxCallbackPort,
          bindHost: env.indodaxCallbackBindHost,
          url: env.indodaxCallbackUrl,
          allowedHost: env.indodaxCallbackAllowedHost || null,
          authMode: env.indodaxCallbackAuthMode,
        },
        telegram: {
          configured: currentHealth.telegramConfigured,
          running: currentHealth.telegramRunning,
          connection: currentHealth.telegramConnection,
        },
        readiness: {
          scannerReady: currentHealth.scannerRunning,
          telegramRequired: currentHealth.telegramConfigured,
          telegramReady: !currentHealth.telegramConfigured || currentHealth.telegramRunning,
          callbackRequired: env.indodaxEnableCallbackServer,
          callbackReady:
            !env.indodaxEnableCallbackServer || currentHealth.callbackServerRunning,
        },
        executionMode: currentHealth.executionMode,
        health: currentHealth,
      });
      return;
    }

    if (path === '/livez') {
      const currentHealth = this.health.get();
      const live = this.health.isLive(currentHealth);

      this.writeJson(response, live ? 200 : 503, {
        ok: live,
        live,
        runtimeStatus: currentHealth.runtimeStatus,
      });
      return;
    }

    if (path === '/') {
      this.writeJson(response, 200, {
        ok: true,
        app: env.appName,
        message: 'cukong-markets runtime server',
        healthz: '/healthz',
        callbackPath: env.indodaxCallbackPath,
      });
      return;
    }

    this.writeJson(response, 404, { ok: false, error: 'not_found' });
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        log.error({ error }, 'app server request failed');
        if (!response.headersSent) {
          this.writeJson(response, 500, { ok: false, error: 'internal_error' });
        } else {
          response.end();
        }
      });
    });
    this.server.on('error', (error) => {
      log.error({ error }, 'app server error');
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(env.appPort, env.appBindHost, () => resolve());
    });

    const address = this.server.address();
    if (address && typeof address === 'object') {
      this.port = (address as AddressInfo).port;
    }

    log.info({ host: env.appBindHost, port: this.port }, 'app server started');
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const activeServer = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    log.info({ host: env.appBindHost, port: this.port }, 'app server stopped');
  }

  getPort(): number {
    return this.port;
  }

  isRunning(): boolean {
    return this.server !== null;
  }
}
