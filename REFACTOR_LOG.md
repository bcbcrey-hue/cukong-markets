# REFACTOR_LOG

Repository aktif: `https://github.com/bcbcrey-hue/cukong-markets`

Dokumen ini adalah log final yang harus dipakai sebagai source of truth untuk arsitektur config repo saat ini.

Branding/package naming final yang dipakai sekarang: `cukong-markets`.

---

## 1. Kesimpulan desain saat ini

Desain repo **hampir sesuai** dengan target arsitektur env-driven yang diminta.

Yang sudah tercapai:

- domain publik dibentuk dari `PUBLIC_BASE_URL`
- callback final dibentuk dari `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- route internal inti dipertahankan stabil:
  - `/healthz`
  - `/indodax/callback`
- nginx hanya menjadi wiring/proxy
- Telegram tetap dipisahkan sebagai UI/panel utama via long polling
- contract vendor Indodax V2 sudah dipisahkan dari config domain publik

Yang masih menjadi blocker operasional:

- runtime/domain publik aktif `kangtrade.top` belum terbukti memakai wiring repo ini secara end-to-end

---

## 2. Pemisahan concern yang berlaku sekarang

### 2.1 Yang sengaja tetap statis

- route health internal: `/healthz`
- route callback internal: `/indodax/callback`

Keduanya sengaja stabil agar ganti domain tidak memaksa refactor route bisnis.

### 2.2 Yang menjadi source of truth dari env

- `PUBLIC_BASE_URL`
- `APP_PORT`
- `APP_BIND_HOST`
- `INDODAX_CALLBACK_PATH` → sekarang divalidasi agar tetap `/indodax/callback`
- `INDODAX_CALLBACK_PORT`
- `INDODAX_CALLBACK_BIND_HOST`
- `INDODAX_CALLBACK_ALLOWED_HOST`
- `INDODAX_ENABLE_CALLBACK_SERVER`
- `INDODAX_HISTORY_MODE`
- `INDODAX_PUBLIC_BASE_URL`
- `INDODAX_PRIVATE_BASE_URL`
- `INDODAX_TRADE_API_V2_BASE_URL`
- `TELEGRAM_ALLOWED_USER_IDS`

### 2.3 Yang cukup dirender dari template

- `server_name` nginx dari `PUBLIC_BASE_URL`
- upstream app internal dari `APP_BIND_HOST + APP_PORT`
- upstream callback internal dari `INDODAX_CALLBACK_BIND_HOST + INDODAX_CALLBACK_PORT`

---

## 3. Status contract Indodax

Status final: **campur legacy dan V2**, tetapi sekarang pemisahannya sudah jelas dan rapi.

### Legacy `/tapi` yang masih dipertahankan dengan sengaja

- `getInfo`
- `trade`
- `cancelOrder`
- `openOrders`
- `orderHistory`
- `tradeHistory`
- `getOrder`

Legacy ini tetap ada karena masih dipakai sebagai compatibility/recovery path.

### Trade API 2.0 yang sudah dipisahkan dengan jelas

- `GET /api/v2/order/histories`
- `GET /api/v2/myTrades`

Contract V2 yang sudah diterapkan:

- base endpoint: `INDODAX_TRADE_API_V2_BASE_URL` (default resmi `https://tapi.indodax.com`)
- header auth: `X-APIKEY`
- signature: HMAC SHA512 atas query string
- param signed: `symbol`, `timestamp`, `recvWindow`, plus filter V2 terkait

---

## 4. Hardcode yang memang boleh vs yang sudah dibersihkan

### Boleh tetap hardcoded

- `/healthz`
- `/indodax/callback`
- route callback menu Telegram / long polling behavior

### Sudah dibersihkan / dipisahkan

- domain publik tidak lagi menjadi logic bisnis di code path utama
- base URL V2 Indodax tidak lagi dicampur dengan callback publik/domain publik
- nginx server name/upstream tidak lagi diedit manual banyak file; cukup render dari env

### Hardcode / contoh yang masih tersisa dan sifatnya non-bisnis

- contoh domain `kangtrade.top` di `.env.example`, `README.md`, dan log audit sebagai contoh target runtime saat ini
- base vendor default resmi di env/config sebagai fallback dokumentatif
- nama file artefak tertentu seperti `deploy/nginx/mafiamarkets.nginx.conf` masih dipertahankan untuk compatibility operasional dan tidak memengaruhi source of truth config

---

## 5. File yang diubah agar desain lebih rapi

- `.env.example`
- `README.md`
- `REFACTOR_LOG.md`
- `SESSION_CONTEXT_NEXT.md`
- `package.json`
- `src/config/env.ts`
- `src/integrations/indodax/client.ts`
- `src/integrations/indodax/privateApi.ts`
- `src/integrations/indodax/callbackServer.ts`
- `scripts/render-nginx-conf.mjs`
- `deploy/nginx/mafiamarkets.nginx.conf.template`
- `deploy/nginx/mafiamarkets.nginx.conf`
- `tests/http_servers_probe.ts`
- `tests/nginx_renderer_probe.ts`
- `tests/private_api_v2_mapping_probe.ts`

---

## 6. Validasi yang sudah benar-benar dilakukan

- `yarn lint`
- `yarn build`
- `tests/runtime_backend_regression.ts`
- `tests/worker_timeout_probe.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/execution_summary_failed_probe.ts`
- `tests/telegram_menu_navigation_probe.ts`
- `tests/telegram_slippage_confirmation_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/private_api_v2_mapping_probe.ts`
- `tests/http_servers_probe.ts`
- `tests/nginx_renderer_probe.ts`
- `tests/app_lifecycle_servers_probe.ts`
- smoke test real read-only Telegram (`getMe`, `getWebhookInfo`)
- smoke test real read-only Indodax (`getInfo`, `GET /api/v2/order/histories`, `GET /api/v2/myTrades`)

---

## 7. Blocker jujur yang masih tersisa

### P0

- `https://kangtrade.top/healthz` publik belum terbukti mengarah ke runtime repo ini
- `https://kangtrade.top/indodax/callback` publik belum terbukti dilayani callback server repo ini
- karena dua jalur publik inti itu belum sinkron, arsitektur repo sudah rapi tetapi wiring domain publik aktif belum terbukti sama dengan repo

### P1

- execution/recovery masih membawa compatibility layer legacy + V2 sehingga kompleksitas masih ada, walau sekarang sudah lebih jelas pemisahannya

---

## 8. Ringkasan singkat

Source of truth untuk domain/callback sekarang sudah dipusatkan di env dan template renderer, sementara route internal inti tetap stabil. Kontrak vendor Indodax juga sudah dipisahkan lebih jelas dari config domain publik. Sisa masalah terbesar saat ini bukan desain repo, melainkan pembuktian bahwa domain publik aktif benar-benar memakai wiring repo yang sudah dibersihkan ini.
