import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
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
  const redactedKeys = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    env.indodaxCallbackSignatureHeader.toLowerCase(),
  ]);

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      redactedKeys.has(key.toLowerCase()) ? '[redacted]' : (Array.isArray(value) ? value.join(',') : (value ?? '')),
    ]),
  );
}

function resolveHeaderValue(request: IncomingMessage, key: string): string {
  return firstHeaderValue(request.headers[key.toLowerCase()]).trim();
}

function parseTimestampMs(raw: string): number | null {
  if (!raw) {
    return null;
  }

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (!Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
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
    const loaded = await this.persistence.readIndodaxCallbackState();
    this.state = {
      ...loaded,
      enabled: env.indodaxEnableCallbackServer,
      callbackPath: env.indodaxCallbackPath,
      callbackUrl: env.indodaxCallbackUrl,
      allowedHost: env.indodaxCallbackAllowedHost || null,
      lastVerificationAt: loaded.lastVerificationAt ?? null,
      nonceHistory: Array.isArray(loaded.nonceHistory) ? loaded.nonceHistory : [],
    };
    await this.persistence.saveIndodaxCallbackState(this.state);
  }

  private readBody(request: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => resolve(Buffer.concat(chunks)));
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
      lastVerificationAt: event.verification.verified ? event.receivedAt : this.state.lastVerificationAt,
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
    const rawHeaders = headersToRecord(request.headers);
    const query = Object.fromEntries(new URL(request.url ?? '/', 'http://localhost').searchParams.entries());

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
        query,
        headers: rawHeaders,
        bodyText: '',
        parsedBody: null,
        verification: {
          mode: env.indodaxCallbackAuthMode,
          verified: false,
          signatureHeaderPresent: false,
          timestampHeaderPresent: false,
          nonceHeaderPresent: false,
          timestampAgeMs: null,
          nonceReused: false,
        },
        receivedAt: new Date().toISOString(),
      };
      await this.persistEvent(event);
      this.writePlainText(response, 405, 'fail');
      return;
    }

    const bodyBuffer = await this.readBody(request);
    const bodyText = bodyBuffer.toString('utf8');
    const parsedBody = this.parseBody(firstHeaderValue(request.headers['content-type']).toLowerCase(), bodyText);
    const authMode = env.indodaxCallbackAuthMode;
    const signatureHeader = resolveHeaderValue(request, env.indodaxCallbackSignatureHeader);
    const timestampHeader = resolveHeaderValue(request, env.indodaxCallbackTimestampHeader);
    const nonceHeader = resolveHeaderValue(request, env.indodaxCallbackNonceHeader);

    const timestampMs = parseTimestampMs(timestampHeader);
    const nowMs = Date.now();
    const timestampAgeMs = timestampMs === null ? null : nowMs - timestampMs;
    const timestampExpired = timestampAgeMs === null || timestampAgeMs > env.indodaxCallbackReplayWindowMs;
    const timestampSkewExceeded = timestampAgeMs === null || Math.abs(timestampAgeMs) > env.indodaxCallbackMaxSkewMs;

    const nonceHistory = this.state.nonceHistory.filter(
      (entry) => nowMs - Date.parse(entry.seenAt) <= env.indodaxCallbackReplayWindowMs,
    );
    const nonceReused = nonceHeader.length > 0 && nonceHistory.some((entry) => entry.nonce === nonceHeader);

    const hostAllowed = this.isAllowedHost(host);
    const signaturePresent = signatureHeader.length > 0;
    const timestampPresent = timestampHeader.length > 0;
    const noncePresent = nonceHeader.length > 0;

    const expectedSignature = env.indodaxCallbackSignatureSecret
      ? createHmac('sha256', env.indodaxCallbackSignatureSecret)
          .update(timestampHeader)
          .update('.')
          .update(nonceHeader)
          .update('.')
          .update(bodyBuffer)
          .digest('hex')
      : '';
    const signatureValid = Boolean(expectedSignature && signaturePresent && safeEqual(signatureHeader, expectedSignature));

    let accepted = hostAllowed;
    let reason: string | undefined;

    if (!hostAllowed) {
      accepted = false;
      reason = 'host_not_allowed';
    } else if (authMode === 'required') {
      if (!env.indodaxCallbackSignatureSecret) {
        accepted = false;
        reason = 'signature_secret_missing';
      } else if (!signaturePresent || !timestampPresent || !noncePresent) {
        accepted = false;
        reason = 'auth_header_missing';
      } else if (timestampExpired) {
        accepted = false;
        reason = 'timestamp_expired';
      } else if (timestampSkewExceeded) {
        accepted = false;
        reason = 'timestamp_skew_exceeded';
      } else if (nonceReused) {
        accepted = false;
        reason = 'nonce_reused';
      } else if (!signatureValid) {
        accepted = false;
        reason = 'signature_invalid';
      }
    }

    if (accepted && authMode === 'required') {
      nonceHistory.push({
        nonce: nonceHeader,
        seenAt: new Date(nowMs).toISOString(),
      });
    }
    this.state = {
      ...this.state,
      nonceHistory,
    };

    const event: IndodaxCallbackEvent = {
      id: randomUUID(),
      path,
      method: request.method ?? 'POST',
      host: host || null,
      allowedHost: env.indodaxCallbackAllowedHost || null,
      accepted,
      response: accepted ? 'ok' : 'fail',
      reason,
      query,
      headers: rawHeaders,
      bodyText,
      parsedBody,
      verification: {
        mode: authMode,
        verified: accepted && authMode === 'required',
        signatureHeaderPresent: signaturePresent,
        timestampHeaderPresent: timestampPresent,
        nonceHeaderPresent: noncePresent,
        timestampAgeMs,
        nonceReused,
      },
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

  isRunning(): boolean {
    return this.server !== null;
  }
}
