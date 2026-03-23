#!/usr/bin/env node
import dns from 'node:dns/promises';

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function maskToken(token) {
  if (!token) return null;
  const clean = token.trim();
  if (!clean) return null;
  if (clean.length <= 8) return `${clean.slice(0, 2)}***`;
  return `${clean.slice(0, 4)}***${clean.slice(-4)}`;
}

function classifyError(error) {
  const message = String(error?.message || error || '').toLowerCase();

  if (message.includes('401') || message.includes('unauthorized')) {
    return 'token_invalid';
  }
  if (message.includes('connect tunnel failed') || message.includes('proxy') || message.includes('http 403')) {
    return 'proxy_blocked';
  }
  if (
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('dns') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('failed to connect') ||
    message.includes('fetch failed')
  ) {
    return 'network_egress_or_dns';
  }

  return 'unknown';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const proxyEnv = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']
    .filter((key) => (process.env[key] || '').trim().length > 0);

  const summary = {
    timestamp: new Date().toISOString(),
    tokenConfigured: Boolean(token),
    tokenMasked: maskToken(token),
    allowedUsersCount: allowedUsers.length,
    proxyEnvConfigured: proxyEnv.length > 0,
    proxyEnvKeys: proxyEnv,
    dns: { ok: false, addresses: [], error: null },
    outboundApi: { ok: false, status: null, errorType: null, error: null },
    getMe: {
      attempted: Boolean(token),
      ok: false,
      status: null,
      errorType: null,
      error: null,
      bot: null,
    },
    verdict: 'BELUM_SELESAI',
  };

  try {
    const answers = await dns.lookup('api.telegram.org', { all: true });
    summary.dns.ok = true;
    summary.dns.addresses = answers.map((item) => `${item.family === 6 ? 'IPv6' : 'IPv4'}:${item.address}`);
  } catch (error) {
    summary.dns.error = String(error?.message || error);
  }

  try {
    const response = await fetchWithTimeout(TELEGRAM_API_BASE, {}, 12000);
    summary.outboundApi.status = response.status;
    summary.outboundApi.ok = response.ok;
    if (!response.ok) {
      summary.outboundApi.errorType = response.status === 403 && summary.proxyEnvConfigured
        ? 'proxy_blocked'
        : 'network_egress_or_dns';
      summary.outboundApi.error = `HTTP ${response.status}`;
    }
  } catch (error) {
    summary.outboundApi.errorType = classifyError(error);
    summary.outboundApi.error = String(error?.message || error);
  }

  if (token) {
    try {
      const response = await fetchWithTimeout(`${TELEGRAM_API_BASE}/bot${token}/getMe`, {}, 12000);
      summary.getMe.status = response.status;
      const payload = await response.json().catch(() => ({}));

      if (response.ok && payload?.ok) {
        summary.getMe.ok = true;
        summary.getMe.bot = {
          id: payload.result?.id ?? null,
          username: payload.result?.username ?? null,
          firstName: payload.result?.first_name ?? null,
          isBot: payload.result?.is_bot ?? null,
        };
      } else {
        const description = payload?.description || `HTTP ${response.status}`;
        summary.getMe.error = description;
        summary.getMe.errorType = /unauthorized/i.test(description) || response.status === 401
          ? 'token_invalid'
          : response.status === 403 && summary.proxyEnvConfigured
            ? 'proxy_blocked'
            : 'network_egress_or_dns';
      }
    } catch (error) {
      summary.getMe.error = String(error?.message || error);
      summary.getMe.errorType = classifyError(error);
    }
  } else {
    summary.getMe.error = 'TELEGRAM_BOT_TOKEN missing';
    summary.getMe.errorType = 'token_missing';
  }

  if (summary.tokenConfigured && summary.outboundApi.ok && summary.getMe.ok) {
    summary.verdict = 'READY_FOR_LAUNCH_VALIDATION';
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    fatal: true,
    error: String(error?.message || error),
  }, null, 2));
  process.exit(1);
});
