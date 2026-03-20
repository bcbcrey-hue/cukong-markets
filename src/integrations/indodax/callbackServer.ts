import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { env } from '../../config/env';
import type { IndodaxCallbackEvent, IndodaxCallbackState } from '../../core/types';
import { createChildLogger } from '../../core/logger';
import { JournalService } from '../../services/journalService';
import {
  PersistenceService,
  createDefaultIndodaxCallbackState,
} from '../../services/persistenceService';

const log = createChildLogger({ module: 'indodax-callback-server' });

function normalizeHost(input?: string | null): string {
  return (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

function stripPort(host: string): string {
  const [hostname] = host.split(':');
  return hostname ?? host;
}

function isLoopbackHost(host: string): boolean {
  const normalized = stripPort(normalizeHost(host));
  return ['127.0.0.1', 'localhost', '::1', '0.0.0.0', ''].includes(normalized);
}

function firstHeaderValue(header?: string | string[]): string {
  if (Array.isArray(header)) {
    return header[0] ?? '';
  }
  return header ?? '';
}

function extractHost(request: IncomingMessage): string {
  const directHost = normalizeHost(firstHeaderValue(request.headers.host));
  const forwardedHost = normalizeHost(firstHeaderValue(request.headers['x-forwarded-host']));

  if (directHost && !isLoopbackHost(directHost)) {
    return directHost;
  }

  return forwardedHost || directHost;
}

function headersToRecord(headers: IncomingMessage['headers']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : (value ?? '')]),
  );
}

export class IndodaxCallbackServer {
  private server: Server | null = null;
  private port = env.indodaxCallbackPort;
  private state: IndodaxCallbackState = createDefaultIndodaxCallbackState();

  constructor(
    private readonly persistence: PersistenceService,
    private readonly journal: JournalService,
    private readonly onAcceptedCallback?: (
      payload: Record<string, unknown> | null,
      meta: {
        eventId: string;
        host: string | null;
        path: string;
      },
    ) => Promise<void>,
  ) {}

  private async loadState(): Promise<void> {
    this.state = {
      ...(await this.persistence.readIndodaxCallbackState()),
      enabled: env.indodaxEnableCallbackServer,
      callbackPath: env.indodaxCallbackPath,
      callbackUrl: env.indodaxCallbackUrl,
      allowedHost: env.indodaxCallbackAllowedHost || null,
    };
    await this.persistence.saveIndodaxCallbackState(this.state);
  }

  private readBody(request: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      request.on('error', reject);
    });
  }

  private parseBody(contentType: string, bodyText: string): Record<string, unknown> | null {
    if (!bodyText.trim()) {
      return null;
    }

    if (contentType.includes('application/json')) {
      try {
        const parsed = JSON.parse(bodyText) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { value: parsed };
      } catch {
        return null;
      }
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(bodyText).entries());
    }

    return { raw: bodyText };
  }

  private isAllowedHost(host: string): boolean {
    if (!env.indodaxCallbackAllowedHost) {
      return true;
    }

    const allowedHost = normalizeHost(env.indodaxCallbackAllowedHost);
    return host === allowedHost || stripPort(host) === stripPort(allowedHost);
  }

  private async persistEvent(event: IndodaxCallbackEvent): Promise<void> {
    await this.persistence.appendIndodaxCallbackEvent(event);

    this.state = {
      ...this.state,
      lastReceivedAt: event.receivedAt,
      lastResponse: event.response,
      acceptedCount: this.state.acceptedCount + (event.accepted ? 1 : 0),
      rejectedCount: this.state.rejectedCount + (event.accepted ? 0 : 1),
      lastEventId: event.id,
      lastSourceHost: event.host,
    };

    await this.persistence.saveIndodaxCallbackState(this.state);

    if (event.accepted) {
      await this.journal.info('INDODAX_CALLBACK_RECEIVED', 'callback diterima', {
        eventId: event.id,
        path: event.path,
        host: event.host,
      });
    } else {
      await this.journal.warn('INDODAX_CALLBACK_REJECTED', event.reason ?? 'callback ditolak', {
        eventId: event.id,
        path: event.path,
        host: event.host,
      });
    }
  }

  private writePlainText(
    response: ServerResponse,
    statusCode: number,
    body: 'ok' | 'fail',
  ): void {
    response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(body);
  }

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

    if (path === '/healthz') {
      this.writeJson(response, 200, {
        ok: true,
        enabled: env.indodaxEnableCallbackServer,
        callbackPath: env.indodaxCallbackPath,
        callbackUrl: env.indodaxCallbackUrl,
        allowedHost: env.indodaxCallbackAllowedHost || null,
        acceptedCount: this.state.acceptedCount,
        rejectedCount: this.state.rejectedCount,
        lastReceivedAt: this.state.lastReceivedAt,
      });
      return;
    }

    if (path !== env.indodaxCallbackPath) {
      this.writePlainText(response, 404, 'fail');
      return;
    }

    const host = extractHost(request);
    if (request.method !== 'POST') {
      const event: IndodaxCallbackEvent = {
        id: randomUUID(),
        path,
        method: request.method ?? 'UNKNOWN',
        host: host || null,
        allowedHost: env.indodaxCallbackAllowedHost || null,
        accepted: false,
        response: 'fail',
        reason: 'method_not_allowed',
        query: Object.fromEntries(new URL(request.url ?? '/', 'http://localhost').searchParams.entries()),
        headers: headersToRecord(request.headers),
        bodyText: '',
        parsedBody: null,
        receivedAt: new Date().toISOString(),
      };
      await this.persistEvent(event);
      this.writePlainText(response, 405, 'fail');
      return;
    }

    const bodyText = await this.readBody(request);
    const parsedBody = this.parseBody(firstHeaderValue(request.headers['content-type']).toLowerCase(), bodyText);
    const accepted = this.isAllowedHost(host);
    const event: IndodaxCallbackEvent = {
      id: randomUUID(),
      path,
      method: request.method ?? 'POST',
      host: host || null,
      allowedHost: env.indodaxCallbackAllowedHost || null,
      accepted,
      response: accepted ? 'ok' : 'fail',
      reason: accepted ? undefined : 'host_not_allowed',
      query: Object.fromEntries(new URL(request.url ?? '/', 'http://localhost').searchParams.entries()),
      headers: headersToRecord(request.headers),
      bodyText,
      parsedBody,
      receivedAt: new Date().toISOString(),
    };

    await this.persistEvent(event);

    if (accepted && this.onAcceptedCallback) {
      try {
        await this.onAcceptedCallback(parsedBody, {
          eventId: event.id,
          host: event.host,
          path: event.path,
        });
      } catch (error) {
        await this.journal.warn(
          'INDODAX_CALLBACK_POST_PROCESS_FAILED',
          error instanceof Error ? error.message : 'callback post process failed',
          {
            eventId: event.id,
            host: event.host,
            path: event.path,
          },
        );
      }
    }

    this.writePlainText(response, accepted ? 200 : 403, accepted ? 'ok' : 'fail');
  }

  async start(): Promise<void> {
    await this.loadState();

    if (!env.indodaxEnableCallbackServer || this.server) {
      return;
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response).catch(async (error) => {
        log.error({ error }, 'callback server request failed');
        await this.journal.error(
          'INDODAX_CALLBACK_SERVER_ERROR',
          error instanceof Error ? error.message : 'callback server request failed',
        );
        if (!response.headersSent) {
          this.writePlainText(response, 500, 'fail');
        } else {
          response.end();
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(env.indodaxCallbackPort, env.indodaxCallbackBindHost, () => resolve());
    });

    const address = this.server.address();
    if (address && typeof address === 'object') {
      this.port = (address as AddressInfo).port;
    }

    log.info(
      {
        host: env.indodaxCallbackBindHost,
        port: this.port,
        path: env.indodaxCallbackPath,
        callbackUrl: env.indodaxCallbackUrl,
        allowedHost: env.indodaxCallbackAllowedHost || null,
      },
      'indodax callback server started',
    );
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

    log.info({ host: env.indodaxCallbackBindHost, port: this.port }, 'indodax callback server stopped');
  }

  getPort(): number {
    return this.port;
  }
}
