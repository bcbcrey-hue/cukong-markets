# Mafiamarkets Refactor TIGA

Backend TypeScript untuk bot intelijen market Indodax dengan UI operasional utama di Telegram.

## Status repo saat ini

Runtime utama repo yang berlaku sekarang:

`tickers + depth -> MarketWatcher -> SignalEngine -> intelligence pipeline -> OpportunityAssessment -> Hotlist -> ExecutionEngine`

Yang sudah aktif dan terhubung:

- scanner market + hotlist berbasis `OpportunityAssessment`
- intelligence pipeline (microstructure, history, probability, edge validation, entry timing)
- worker runtime untuk feature/pattern/backtest
- backtest replay dari pair-history JSONL
- live execution hardening baseline (openOrders-first sync, getOrder -> history fallback, duplicate guard, aggressive BUY, TP default 15%)
- execution summary dan trade outcome summary ke Telegram/journal/log/persistence
- Telegram UI hierarkis 7 kategori
- mode history Indodax `v2_prefer | v2_only | legacy`
- callback server Indodax full env-driven
- nginx template + renderer untuk ganti domain/VPS cukup ubah `.env` lalu render ulang

## Arsitektur yang dipilih

Arsitektur yang dipakai sekarang adalah **callback server terpisah port**.

Alasannya:

- lebih stabil untuk operasional user awam
- traffic callback tidak bercampur dengan health/main runtime endpoint
- nginx bisa mengarahkan path callback ke port khusus tanpa mengganggu app utama
- saat ganti domain atau VPS, cukup ubah `.env` lalu render ulang config nginx

Port default:

- app utama: `APP_PORT=8787`
- callback server: `INDODAX_CALLBACK_PORT=8788`

## Telegram UI operasional

Main Menu sekarang **hanya** berisi 7 kategori:

1. `⚡ Execute Trade`
2. `🚨 Emergency Controls`
3. `📡 Monitoring / Laporan`
4. `📦 Positions / Orders / Manual Trade`
5. `⚙️ Settings`
6. `👤 Accounts`
7. `🧪 Backtest`

Semua submenu punya tombol `Kembali`, callback navigasi dipisah ke namespace `NAV`, dan callback aksi live lama tetap dipertahankan.

## Env wajib

Salin `.env.example` menjadi `.env`, lalu isi minimal:

- `PUBLIC_BASE_URL`
- `APP_PORT`
- `APP_BIND_HOST`
- `INDODAX_CALLBACK_PATH`
- `INDODAX_CALLBACK_PORT`
- `INDODAX_CALLBACK_BIND_HOST`
- `INDODAX_CALLBACK_ALLOWED_HOST`
- `INDODAX_ENABLE_CALLBACK_SERVER`
- `INDODAX_HISTORY_MODE`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`
- `DATA_DIR`
- `LOG_DIR`
- `TEMP_DIR`

## Cara set domain

1. Isi `PUBLIC_BASE_URL`, misalnya `https://bot.example.com`
2. Isi `INDODAX_CALLBACK_ALLOWED_HOST` dengan host yang sama, misalnya `bot.example.com`
3. Isi `INDODAX_CALLBACK_PATH`, misalnya `/hooks/indodax`
4. Render ulang nginx config

## Cara set callback path

Ubah di `.env`:

```bash
INDODAX_CALLBACK_PATH=/hooks/indodax
```

Callback URL publik akan diturunkan dari:

`PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`

## Cara set port

Ubah di `.env`:

```bash
APP_PORT=8787
INDODAX_CALLBACK_PORT=8788
APP_BIND_HOST=0.0.0.0
INDODAX_CALLBACK_BIND_HOST=0.0.0.0
```

## Cara render nginx config

Setelah `.env` siap, jalankan:

```bash
node scripts/render-nginx-conf.mjs
```

Output final akan ada di:

```bash
deploy/nginx/mafiamarkets.nginx.conf
```

## Saat ganti domain

Yang perlu diubah hanya:

- `PUBLIC_BASE_URL`
- `INDODAX_CALLBACK_ALLOWED_HOST`

Lalu render ulang config nginx:

```bash
node scripts/render-nginx-conf.mjs
```

## Saat ganti VPS

Yang perlu dipindahkan:

- source code repo
- file `.env`
- folder `data/` jika ingin membawa state/history/account lama

Lalu jalankan lagi:

```bash
yarn install
yarn build
node scripts/render-nginx-conf.mjs
yarn dev
```

## Cara cek callback aktif

Jika callback server aktif, cek:

```bash
curl http://127.0.0.1:${INDODAX_CALLBACK_PORT}/healthz
```

Health app utama:

```bash
curl http://127.0.0.1:${APP_PORT}/healthz
```

## Cara menjalankan app dan callback

```bash
yarn install
yarn lint
yarn build
yarn dev
```

Jika `INDODAX_ENABLE_CALLBACK_SERVER=true`, callback server ikut start saat app dijalankan.

## Mode history Indodax

Pilihan env:

- `INDODAX_HISTORY_MODE=v2_prefer` → coba v2 dulu, fallback ke legacy bila perlu
- `INDODAX_HISTORY_MODE=v2_only` → pakai v2 saja
- `INDODAX_HISTORY_MODE=legacy` → pakai history lama saja

Default repo sekarang: `v2_prefer`.

## Probe / regression penting

Sudah diverifikasi lulus:

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

## Data runtime yang dihasilkan

- `data/accounts/accounts.json`
- `data/state/runtime-state.json`
- `data/state/orders.json`
- `data/state/positions.json`
- `data/state/trades.json`
- `data/state/health.json`
- `data/state/indodax-callback-state.json`
- `data/state/journal.jsonl`
- `data/history/pair-history.jsonl`
- `data/history/anomaly-events.jsonl`
- `data/history/pattern-outcomes.jsonl`
- `data/history/execution-summaries.jsonl`
- `data/history/trade-outcomes.jsonl`
- `data/history/indodax-callback-events.jsonl`
- `data/backtest/*.json`

## Catatan jujur

- mode history v2, callback server, dan renderer nginx sudah nyata dan teruji via harness/probe lokal
- endpoint v2 Indodax belum divalidasi end-to-end ke environment live vendor pada sesi ini
- delivery callback live dari Indodax ke domain publik juga belum dibuktikan end-to-end pada sesi ini
- `recentTrades` di market intelligence masih inferred dari delta volume lokal, belum native trade feed exchange

Lihat `REFACTOR_LOG.md` untuk status final lengkap dan `SESSION_CONTEXT_NEXT.md` untuk handoff ringkas sesi berikutnya.
