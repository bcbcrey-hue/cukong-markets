#!/usr/bin/env node
import dns from 'node:dns/promises';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TELEGRAM_HOST = 'api.telegram.org';
const TELEGRAM_PORT = 443;

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

function readFlag(name) {
  return process.argv.includes(name);
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return null;
  return value;
}

function tcpDial(host, port, family, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, family });
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ ok: true, error: null }));
    socket.once('timeout', () => finish({ ok: false, error: 'timeout' }));
    socket.once('error', (error) => finish({ ok: false, error: String(error?.message || error) }));
  });
}

function runCurlCheck(useNoProxy) {
  const args = ['-sS', '-o', '/dev/null', '-w', 'code=%{http_code} remote_ip=%{remote_ip} err=%{errormsg}', 'https://api.telegram.org'];
  if (useNoProxy) {
    args.unshift('*');
    args.unshift('--noproxy');
  }

  const result = spawnSync('curl', args, { encoding: 'utf8' });
  const combined = `${result.stdout || ''} ${result.stderr || ''}`.trim();

  return {
    ok: result.status === 0,
    exitCode: result.status,
    output: combined,
    classified: classifyError(combined),
  };
}

async function readRuntimeHealth(baseUrl) {
  const healthzUrl = `${baseUrl.replace(/\/+$/, '')}/healthz`;
  const livezUrl = `${baseUrl.replace(/\/+$/, '')}/livez`;

  const result = {
    checked: true,
    baseUrl,
    healthz: { ok: false, status: null, payload: null, error: null },
    livez: { ok: false, status: null, payload: null, error: null },
    alignment: {
      runtimeTargetMatches: {
        appNameMatches: null,
        appPortMatches: null,
      },
      tokenConfiguredMatches: null,
      allowedUsersCountMatches: null,
      botIdentityMatches: null,
    },
    botLaunch: {
      launchAttempted: null,
      launchSuccess: null,
      connected: null,
      lastConnectionStatus: null,
      lastLaunchErrorType: null,
      lastLaunchError: null,
    },
  };

  try {
    const healthRes = await fetchWithTimeout(healthzUrl, {}, 10000);
    result.healthz.status = healthRes.status;
    const payload = await healthRes.json().catch(() => null);
    result.healthz.ok = healthRes.ok;
    result.healthz.payload = payload;
  } catch (error) {
    result.healthz.error = String(error?.message || error);
  }

  try {
    const liveRes = await fetchWithTimeout(livezUrl, {}, 10000);
    result.livez.status = liveRes.status;
    const payload = await liveRes.json().catch(() => null);
    result.livez.ok = liveRes.ok;
    result.livez.payload = payload;
  } catch (error) {
    result.livez.error = String(error?.message || error);
  }

  return result;
}

function valueOrNull(value) {
  return value === undefined ? null : value;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const allowedUsers = (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const expectedAppName = process.env.APP_NAME?.trim() || 'cukong-markets';
  const expectedAppPort = Number(process.env.APP_PORT || '3000');

  const proxyEnv = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']
    .filter((key) => (process.env[key] || '').trim().length > 0);

  const includeRuntime = readFlag('--with-runtime');
  const runtimeBaseUrl =
    readArgValue('--runtime-base-url') ||
    process.env.TELEGRAM_RUNTIME_BASE_URL ||
    `http://127.0.0.1:${process.env.APP_PORT || '3000'}`;

  const summary = {
    timestamp: new Date().toISOString(),
    tokenConfigured: Boolean(token),
    tokenMasked: maskToken(token),
    allowedUsersCount: allowedUsers.length,
    proxyEnvConfigured: proxyEnv.length > 0,
    proxyEnvKeys: proxyEnv,
    dns: { ok: false, addresses: [], error: null },
    networkIsolation: {
      tcpIPv4: { ok: false, error: null },
      tcpIPv6: { ok: false, error: null },
      curlViaProxyEnv: { ok: false, exitCode: null, output: null, classified: null },
      curlDirectNoProxy: { ok: false, exitCode: null, output: null, classified: null },
      mostLikelyRootCause: null,
    },
    outboundApi: { ok: false, status: null, errorType: null, error: null },
    getMe: {
      attempted: Boolean(token),
      ok: false,
      status: null,
      errorType: null,
      error: null,
      bot: null,
    },
    runtime: {
      checked: false,
      skippedReason: includeRuntime ? null : 'use --with-runtime to validate live app runtime sync',
      baseUrl: includeRuntime ? runtimeBaseUrl : null,
      expectedTarget: includeRuntime
        ? { appName: expectedAppName, appPort: Number.isFinite(expectedAppPort) ? expectedAppPort : null }
        : null,
      healthz: { ok: false, status: null, payload: null, error: null },
      livez: { ok: false, status: null, payload: null, error: null },
      alignment: {
        runtimeTargetMatches: {
          appNameMatches: null,
          appPortMatches: null,
        },
        tokenConfiguredMatches: null,
        allowedUsersCountMatches: null,
        botIdentityMatches: null,
      },
      botLaunch: {
        launchAttempted: null,
        launchSuccess: null,
        connected: null,
        lastConnectionStatus: null,
        lastLaunchErrorType: null,
        lastLaunchError: null,
      },
    },
    verdict: 'BELUM_SELESAI',
  };

  let ipv4 = null;
  let ipv6 = null;

  try {
    const answers = await dns.lookup('api.telegram.org', { all: true });
    summary.dns.ok = true;
    summary.dns.addresses = answers.map((item) => {
      if (item.family === 4 && !ipv4) ipv4 = item.address;
      if (item.family === 6 && !ipv6) ipv6 = item.address;
      return `${item.family === 6 ? 'IPv6' : 'IPv4'}:${item.address}`;
    });
  } catch (error) {
    summary.dns.error = String(error?.message || error);
  }

  if (ipv4) {
    summary.networkIsolation.tcpIPv4 = await tcpDial(ipv4, TELEGRAM_PORT, 4);
  } else {
    summary.networkIsolation.tcpIPv4 = { ok: false, error: 'ipv4_not_resolved' };
  }

  if (ipv6) {
    summary.networkIsolation.tcpIPv6 = await tcpDial(ipv6, TELEGRAM_PORT, 6);
  } else {
    summary.networkIsolation.tcpIPv6 = { ok: false, error: 'ipv6_not_resolved' };
  }

  const curlProxy = runCurlCheck(false);
  const curlDirect = runCurlCheck(true);
  summary.networkIsolation.curlViaProxyEnv = {
    ok: curlProxy.ok,
    exitCode: curlProxy.exitCode,
    output: curlProxy.output,
    classified: curlProxy.classified,
  };
  summary.networkIsolation.curlDirectNoProxy = {
    ok: curlDirect.ok,
    exitCode: curlDirect.exitCode,
    output: curlDirect.output,
    classified: curlDirect.classified,
  };

  if (curlProxy.classified === 'proxy_blocked') {
    summary.networkIsolation.mostLikelyRootCause = 'proxy_connect_blocked';
  } else if (!summary.networkIsolation.tcpIPv4.ok && !summary.networkIsolation.tcpIPv6.ok) {
    summary.networkIsolation.mostLikelyRootCause = 'network_route_or_firewall_block';
  } else if (!summary.dns.ok) {
    summary.networkIsolation.mostLikelyRootCause = 'dns_resolution_failure';
  } else {
    summary.networkIsolation.mostLikelyRootCause = 'unknown';
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

  if (includeRuntime) {
    summary.runtime = {
      ...summary.runtime,
      ...(await readRuntimeHealth(runtimeBaseUrl)),
      expectedTarget: {
        appName: expectedAppName,
        appPort: Number.isFinite(expectedAppPort) ? expectedAppPort : null,
      },
    };

    const healthPayload = summary.runtime.healthz.payload;
    const connection = healthPayload?.telegram?.connection || null;

    if (healthPayload) {
      summary.runtime.alignment.runtimeTargetMatches.appNameMatches =
        valueOrNull(healthPayload?.app) === expectedAppName;
      summary.runtime.alignment.runtimeTargetMatches.appPortMatches =
        Number.isFinite(expectedAppPort) &&
        valueOrNull(healthPayload?.server?.port) === expectedAppPort;
      summary.runtime.alignment.tokenConfiguredMatches =
        healthPayload?.telegram?.configured === summary.tokenConfigured;
      summary.runtime.alignment.allowedUsersCountMatches =
        connection?.allowedUsersCount === summary.allowedUsersCount;

      summary.runtime.botLaunch.launchAttempted =
        typeof connection?.lastLaunchAt === 'string' && connection.lastLaunchAt.length > 0;
      summary.runtime.botLaunch.launchSuccess = Boolean(connection?.launched && connection?.running && connection?.connected);
      summary.runtime.botLaunch.connected = Boolean(connection?.connected);
      summary.runtime.botLaunch.lastConnectionStatus = connection?.lastConnectionStatus ?? null;
      summary.runtime.botLaunch.lastLaunchErrorType = connection?.lastLaunchErrorType ?? null;
      summary.runtime.botLaunch.lastLaunchError = connection?.lastLaunchError ?? null;

      if (summary.getMe.ok && summary.getMe.bot) {
        summary.runtime.alignment.botIdentityMatches =
          connection?.botId === summary.getMe.bot.id &&
          (connection?.botUsername ?? null) === (summary.getMe.bot.username ?? null);
      }
    }
  }

  const runtimeHealthyAndConnected = includeRuntime &&
    summary.runtime.healthz.ok &&
    summary.runtime.livez.ok &&
    summary.runtime.alignment.runtimeTargetMatches.appNameMatches === true &&
    summary.runtime.alignment.runtimeTargetMatches.appPortMatches === true &&
    summary.runtime.alignment.tokenConfiguredMatches === true &&
    summary.runtime.alignment.allowedUsersCountMatches === true &&
    summary.runtime.botLaunch.launchSuccess === true &&
    (!summary.getMe.ok || summary.runtime.alignment.botIdentityMatches === true);

  if (summary.tokenConfigured && summary.outboundApi.ok && summary.getMe.ok && runtimeHealthyAndConnected) {
    summary.verdict = 'SELESAI';
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
