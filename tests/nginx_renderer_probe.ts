import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function main() {
  const outputPath = path.resolve('/app/deploy/nginx/cukong-markets.nginx.conf');

  await execFileAsync('node', ['/app/scripts/render-nginx-conf.mjs'], {
    cwd: '/app',
    env: {
      ...process.env,
      PUBLIC_BASE_URL: 'https://kangtrade.top',
      APP_BIND_HOST: '0.0.0.0',
      APP_PORT: '3000',
      INDODAX_CALLBACK_BIND_HOST: '0.0.0.0',
      INDODAX_CALLBACK_PORT: '3001',
      INDODAX_CALLBACK_PATH: '/indodax/callback',
      INDODAX_ENABLE_CALLBACK_SERVER: 'true',
    },
  });

  const rendered = await fs.readFile(outputPath, 'utf8');

  assert.match(rendered, /server_name kangtrade\.top;/, 'server_name must be derived from PUBLIC_BASE_URL');
  assert.match(rendered, /proxy_pass http:\/\/127\.0\.0\.1:3000\//, 'main upstream must proxy to app port from env');
  assert.match(rendered, /location = \/indodax\/callback/, 'callback path must come from env');
  assert.match(rendered, /proxy_pass http:\/\/127\.0\.0\.1:3001\/indodax\/callback;/, 'callback upstream must proxy to callback server port from env');
  assert.match(rendered, /proxy_set_header Host \$host;/, 'Host header must be forwarded');
  assert.match(rendered, /proxy_set_header X-Forwarded-Host \$host;/, 'X-Forwarded-Host header must be forwarded');
  assert.match(rendered, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/, 'X-Forwarded-For header must be forwarded');
  assert.match(rendered, /proxy_set_header X-Forwarded-Proto \$scheme;/, 'X-Forwarded-Proto header must be forwarded');
  assert.match(rendered, /proxy_set_header Upgrade \$http_upgrade;/, 'Upgrade header must be forwarded');
  assert.match(rendered, /proxy_set_header Connection \$connection_upgrade;/, 'Connection header must be forwarded');

  console.log('PASS nginx_renderer_probe');
}

main().catch((error) => {
  console.error('FAIL nginx_renderer_probe');
  console.error(error);
  process.exit(1);
});