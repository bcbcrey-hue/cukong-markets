# Cukong-Markets

Backend TypeScript untuk bot operasional market Indodax dengan UI utama di Telegram.

Package/app naming final yang dipakai sekarang: `cukong-markets`.

## Status jujur repo saat ini

### Sudah beres dan sinkron di source

- `MarketWatcher -> SignalEngine -> OpportunityEngine -> Hotlist -> ExecutionEngine` benar-benar terhubung.
- `executionMode` live vs simulated tampil tegas di `/healthz`, Telegram status, dan log startup.
- startup recovery, sync live order, callback-triggered reconcile, partial fill, fee, weighted average fill, dan update posisi tetap jalan.
- callback server Indodax env-driven, persist event/state, dan callback accepted tetap memicu reconcile berdasarkan `order_id / orderId / id`.
- jalur validasi resmi repo tersedia dan lulus: `yarn lint`, `yarn typecheck:probes`, `yarn build`, `yarn test:probes`.

### Status migrasi history/recovery Indodax

Untuk scope migrasi history/recovery, status sekarang adalah **non-parsial**:

- order history canonical ke `GET /api/v2/order/histories`
- trade history canonical ke `GET /api/v2/myTrades`
- runtime V2 utama **tidak lagi fallback** ke legacy `orderHistory` / `tradeHistory`
- recovery order history V2 memakai **explicit `startTime/endTime`**, tidak mengandalkan default 24 jam
- recovery order history V2 memakai **windowed search bounded <= 7 hari per request** dan **chunked lookup deterministik** sampai order target ketemu atau pencarian habis
- `myTradesV2` memakai `symbol + orderId` sesuai docs resmi

### Yang tetap memakai `/tapi` dan memang masih benar menurut docs resmi

Method berikut **sengaja tetap** memakai jalur private API resmi lama karena dokumentasi resmi masih menyatakannya valid:

- `trade`
- `openOrders`
- `getOrder`
- `cancelOrder`
- `getInfo`

Repo ini **tidak overclaim full migration semua private API**. Yang diselesaikan di sesi ini adalah **history/recovery ke V2**.

### Tidak boleh dioverclaim

- runtime publik `https://kangtrade.top` **bukan bukti** bahwa repo ini sudah live sesuai source saat ini
- verifikasi publik terakhir masih menunjukkan domain aktif belum terbukti mengarah ke runtime repo ini

## Kontrak arsitektur yang berlaku

- domain publik dibentuk dari `PUBLIC_BASE_URL`
- callback publik final dibentuk dari `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- route internal inti tetap stabil:
  - app health: `/healthz`
  - callback listener: `/indodax/callback`
- vendor outbound dipisahkan dari domain publik:
  - `INDODAX_PUBLIC_BASE_URL`
  - `INDODAX_PRIVATE_BASE_URL`
  - `INDODAX_TRADE_API_V2_BASE_URL`
- nginx hanya wiring/proxy
- Telegram tetap UI/panel utama via long polling

Contoh contract target:

```bash
PUBLIC_BASE_URL=https://kangtrade.top
INDODAX_CALLBACK_PATH=/indodax/callback
```

Hasil callback URL:

```bash
https://kangtrade.top/indodax/callback
```

## Telegram UI operasional

Menu utama operasional tetap 7 kategori:

1. `⚡ Execute Trade`
2. `🚨 Emergency Controls`
3. `📡 Monitoring`
4. `📦 Positions`
5. `⚙️ Settings`
6. `👤 Accounts`
7. `🧪 Backtest`

Jalur resmi operator untuk mengubah mode eksekusi tetap:

- `Settings -> Strategy Settings -> Execution Simulated`
- `Settings -> Strategy Settings -> Execution Live`

Whitelist Telegram tetap ketat lewat `TELEGRAM_ALLOWED_USER_IDS`.

## Storage dan persistence yang dipakai nyata

- akun: `data/accounts/accounts.json`
- meta akun: `data/accounts/accounts-meta.json`
- runtime state: `data/state/runtime-state.json`
- orders: `data/state/orders.json`
- positions: `data/state/positions.json`
- trades: `data/state/trades.json`
- callback events: `data/history/indodax-callback-events.jsonl`
- pair history: `data/history/pair-history.jsonl`
- anomaly events: `data/history/anomaly-events.jsonl`
- pattern outcomes: `data/history/pattern-outcomes.jsonl`
- execution summaries: `data/history/execution-summaries.jsonl`
- trade outcomes: `data/history/trade-outcomes.jsonl`
- backtest results: `data/backtest/*.json`

## Env contract

Salin `.env.example` menjadi `.env`, lalu isi minimal:

- `PUBLIC_BASE_URL`
- `APP_PORT`
- `APP_BIND_HOST`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`
- `INDODAX_CALLBACK_PATH`
- `INDODAX_CALLBACK_PORT`
- `INDODAX_CALLBACK_BIND_HOST`
- `INDODAX_CALLBACK_ALLOWED_HOST`
- `INDODAX_ENABLE_CALLBACK_SERVER`
- `INDODAX_HISTORY_MODE`
- `INDODAX_PUBLIC_BASE_URL`
- `INDODAX_PRIVATE_BASE_URL`
- `INDODAX_TRADE_API_V2_BASE_URL`
- `DATA_DIR`
- `LOG_DIR`
- `TEMP_DIR`

Catatan penting untuk `INDODAX_HISTORY_MODE`:

- default final: `v2_only`
- `legacy` masih tersedia hanya sebagai jalur eksplisit kompatibilitas/manual
- `v2_prefer` diperlakukan sebagai alias kompatibilitas ke `v2_only`, jadi tidak lagi menghasilkan runtime hybrid

Path turunan seperti file accounts/state/history **tidak** diisi manual di env karena dibentuk otomatis dari `DATA_DIR`.

## Instalasi dan menjalankan lokal

```bash
yarn install
cp .env.example .env
yarn lint
yarn build
yarn dev
```

Jika `INDODAX_ENABLE_CALLBACK_SERVER=true`, callback server ikut start saat app dijalankan.

## Render nginx

```bash
yarn render:nginx
```

Output final:

```bash
deploy/nginx/cukong-markets.nginx.conf
```

## Verifikasi lokal cepat

Health app:

```bash
curl http://127.0.0.1:${APP_PORT}/healthz
```

Health callback:

```bash
curl http://127.0.0.1:${INDODAX_CALLBACK_PORT}/healthz
```

## Test / probe yang tersedia nyata

Script resmi repo:

- `yarn lint`
- `yarn typecheck:probes`
- `yarn test:probes`
- `yarn verify`
- `yarn build`
- `yarn dev`
- `yarn start`
- `yarn render:nginx`

Probe penting:

- `tests/private_api_v2_mapping_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/callback_reconciliation_probe.ts`
- `tests/runtime_backend_regression.ts`
- `tests/http_servers_probe.ts`
- `tests/app_lifecycle_servers_probe.ts`
- `tests/telegram_menu_navigation_probe.ts`
- `tests/telegram_slippage_confirmation_probe.ts`
- `tests/execution_summary_failed_probe.ts`
- `tests/nginx_renderer_probe.ts`
- `tests/worker_timeout_probe.ts`

## Catatan jujur

- repo internal saat ini sudah sinkron dan tervalidasi lewat `yarn lint`, `yarn typecheck:probes`, `yarn build`, dan `yarn test:probes`
- history/recovery Indodax sekarang non-hybrid untuk scope migrasi yang ditargetkan
- repo ini siap dipakai sebagai source of truth internal
- untuk audit teknis final dan rincian status komponen, lihat `REFACTOR_LOG.md`
- untuk ringkasan cepat sesi berikutnya, lihat `SESSION_CONTEXT_NEXT.md`
