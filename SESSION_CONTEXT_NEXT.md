# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/bcbcrey-hue/cukong-markets`

Gunakan file ini sebagai ringkasan cepat yang sinkron penuh dengan `REFACTOR_LOG.md`, `README.md`, `.env.example`, dan `package.json`.

Branding/package naming final yang sekarang berlaku: `cukong-markets`.

---

## 1. Posisi project yang harus dianggap benar

- desain repo sekarang **hampir env-driven** dan sudah jauh lebih rapi
- package/app naming utama sudah diseragamkan ke `cukong-markets`
- source of truth domain publik ada di `PUBLIC_BASE_URL`
- callback final dibentuk dari `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- route internal inti tetap stabil:
  - `/healthz`
  - `/indodax/callback`
- `INDODAX_CALLBACK_PATH` tetap ada di env contract, tetapi sekarang divalidasi agar tidak mengubah route internal inti

---

## 2. Pemisahan concern yang berlaku

### Domain / callback publik

- `PUBLIC_BASE_URL`
- `INDODAX_CALLBACK_PATH`
- hasil final callback URL = keduanya digabung

### Route internal stabil

- app health = `/healthz`
- callback listener = `/indodax/callback`

### Vendor outbound Indodax

- public market API = `INDODAX_PUBLIC_BASE_URL`
- legacy private `/tapi` = `INDODAX_PRIVATE_BASE_URL`
- Trade API 2.0 = `INDODAX_TRADE_API_V2_BASE_URL`

### Telegram

- tetap panel/UI utama
- tetap long polling
- tidak dipaksa webhook

---

## 3. Status contract Indodax

Status saat ini: **campur legacy dan V2**, tetapi pemisahannya sekarang sudah jelas.

- legacy `/tapi` masih dipakai untuk compatibility/recovery tertentu
- history baru sudah diarahkan ke Trade API 2.0:
  - `GET /api/v2/order/histories`
  - `GET /api/v2/myTrades`
- contract V2 yang berlaku sekarang:
  - base `https://tapi.indodax.com`
  - header `X-APIKEY`
  - signature query string
  - param signed `symbol`, `timestamp`, `recvWindow`

---

## 4. Hal yang sudah ditutup

- hardcode target lama `8787/8788`, `bot.example.com`, `/hooks/indodax`
- implementasi V2 lama yang salah base/header/signature
- callback server yang terlalu percaya `X-Forwarded-Host`
- ketiadaan `.env.example`
- belum adanya script `render:nginx` di `package.json`

---

## 5. Blocker yang masih tersisa

### P0

- domain publik aktif belum terbukti memakai wiring repo ini
- `/healthz` publik belum terbukti mengarah ke app server repo
- `/indodax/callback` publik belum terbukti mengarah ke callback server repo

### P1

- execution/recovery masih membawa compatibility layer legacy + V2 sehingga kompleksitas tetap ada

---

## 6. Validasi cepat yang bisa dipakai ulang

- `yarn lint`
- `yarn build`
- `yarn render:nginx`
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
