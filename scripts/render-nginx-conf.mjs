import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const templatePath = path.resolve(process.cwd(), 'deploy/nginx/mafiamarkets.nginx.conf.template');
const outputPath = path.resolve(process.cwd(), 'deploy/nginx/mafiamarkets.nginx.conf');

function readRequired(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function readOptional(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function normalizePath(value, fallback) {
  const candidate = (value || fallback).trim();
  const withLeadingSlash = candidate.startsWith('/') ? candidate : `/${candidate}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash;
}

function readStablePath(name, stablePath) {
  const normalized = normalizePath(readOptional(name, stablePath), stablePath);
  if (normalized !== stablePath) {
    throw new Error(`${name} must remain ${stablePath} to keep internal route stable`);
  }
  return normalized;
}

function normalizeProxyHost(value) {
  if (!value || value === '0.0.0.0' || value === '::') {
    return '127.0.0.1';
  }
  return value;
}

function deriveServerName(publicBaseUrl) {
  const url = new URL(publicBaseUrl);
  return url.host;
}

function buildCallbackBlock({ enabled, callbackPath, callbackUpstream }) {
  if (!enabled) {
    return `  location = ${callbackPath} {\n    return 404;\n  }`;
  }

  return [
    `  location = ${callbackPath} {`,
    `    proxy_pass http://${callbackUpstream}${callbackPath};`,
    '    proxy_http_version 1.1;',
    '    proxy_set_header Host $host;',
    '    proxy_set_header X-Forwarded-Host $host;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Proto $scheme;',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
  ].join('\n');
}

async function main() {
  const publicBaseUrl = readRequired('PUBLIC_BASE_URL');
  const appBindHost = normalizeProxyHost(readOptional('APP_BIND_HOST', '0.0.0.0'));
  const appPort = readOptional('APP_PORT', '3000');
  const callbackBindHost = normalizeProxyHost(readOptional('INDODAX_CALLBACK_BIND_HOST', '0.0.0.0'));
  const callbackPort = readOptional('INDODAX_CALLBACK_PORT', '3001');
  const callbackPath = readStablePath('INDODAX_CALLBACK_PATH', '/indodax/callback');
  const enableCallbackServer = ['1', 'true', 'yes', 'on'].includes(
    readOptional('INDODAX_ENABLE_CALLBACK_SERVER', 'false').toLowerCase(),
  );

  const template = await readFile(templatePath, 'utf8');
  const rendered = template
    .replaceAll('{{SERVER_NAME}}', deriveServerName(publicBaseUrl))
    .replaceAll('{{APP_UPSTREAM}}', `${appBindHost}:${appPort}`)
    .replaceAll(
      '{{CALLBACK_LOCATION_BLOCK}}',
      buildCallbackBlock({
        enabled: enableCallbackServer,
        callbackPath,
        callbackUpstream: `${callbackBindHost}:${callbackPort}`,
      }),
    );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered, 'utf8');

  console.log(`Rendered nginx config: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});