# Cukong-Markets

Backend TypeScript untuk bot operasional market Indodax dengan UI utama di Telegram.

## Hierarki kebenaran

- source code runtime saat ini = sumber kebenaran utama
- `AUDIT_FORENSIK_PROMPT.md` = status audit keras terbaru
- `REFACTOR_LOG.md` = ringkasan implementasi/perubahan yang benar-benar masuk
- `SESSION_CONTEXT_NEXT.md` = handoff singkat untuk sesi berikutnya

Jika dokumen berbeda dengan wiring runtime, menangkan source code.

## Status source yang sudah diverifikasi

Yang benar-benar sudah terbukti lewat build/lint/probe:

- bootstrap/startup sekarang mengeluarkan phase error yang jelas, termasuk stack dan cause chain
- `src/bootstrap.ts` tidak lagi kehilangan error saat env import/runtime start gagal
- `src/app.ts` sekarang membedakan phase startup penting: persistence, worker, app server, callback server, recovery, evaluasi posisi, Telegram, polling
- logger Pino sekarang men-serialize `error` dan `err` secara eksplisit, jadi tidak lagi rawan berakhir sebagai `{}`
- path worker aman untuk runtime build production (`dist/workers/*.js`) dan dev runtime
- `test:probes` resmi sekarang juga menjalankan `bootstrap_observability_probe`, `worker_timeout_probe`, `buy_entry_price_guard_probe`, `live_submission_uncertain_probe`, dan `cancel_submission_uncertain_probe`
- `.env.example` sekarang benar-benar ada dan sinkron dengan kontrak env runtime yang dipakai source
- `INDODAX_TIMEOUT_MS` sekarang benar-benar dipakai untuk request public/private API
- GET public/private API sekarang punya retry aman untuk status/transport failure yang retriable, sementara POST trading **tidak** di-retry agar tidak berbahaya di kondisi gagal parsial
- validasi harga entry BUY tidak lagi membiarkan order lahir dari reference/entry price yang invalid
- submit live order yang gagal ambigu karena timeout/network sekarang masuk state `submission_uncertain` dan dicoba direkonsiliasi otomatis via `openOrders`/history sebelum dianggap final
- jalur history/recovery Indodax tetap canonical ke V2 untuk scope migrasi yang memang di-claim repo

## Status yang masih harus jujur

### Deploy readiness

Untuk scope source repo, status sekarang: **SIAP DEPLOY**.

Dasarnya:

- `yarn lint` lulus
- `yarn build` lulus
- `yarn typecheck:probes` lulus
- `yarn test:probes` lulus
- probe startup, callback, recovery, worker timeout, buy-entry guard, submission-uncertain safety, dan history V2 lulus

### Live trading

Untuk live trading nyata, status sekarang: **BELUM SIAP LIVE**.

Blocker jujur yang masih tersisa:

- submit live order ke exchange belum punya pembuktian end-to-end non-destruktif di repo ini
- jalur `submission_uncertain` sekarang sudah lebih aman, tetapi masih belum terbukti terhadap exchange nyata untuk semua edge case ketika order diterima namun belum bisa diidentifikasi unik dari side exchange
- tidak ada bukti operasional nyata dari repo ini bahwa auth check exchange dan live shadow-run sudah tervalidasi aman

## Env contract runtime

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
- `INDODAX_TIMEOUT_MS`
- `INDODAX_PUBLIC_MIN_INTERVAL_MS`
- `INDODAX_PRIVATE_MIN_INTERVAL_MS`
- `INDODAX_PRIVATE_LIVE_MIN_INTERVAL_MS`
- `INDODAX_PRIVATE_RECONCILE_MIN_INTERVAL_MS`
- `INDODAX_PRIVATE_BACKGROUND_MIN_INTERVAL_MS`
- `DATA_DIR`
- `LOG_DIR`
- `TEMP_DIR`

Catatan penting:

- `INDODAX_HISTORY_MODE` default final runtime = `v2_only`
- `legacy` tetap tersedia hanya sebagai jalur eksplisit/manual
- `v2_prefer` tetap dipetakan sebagai alias kompatibilitas ke `v2_only`
- `INDODAX_CALLBACK_PATH` harus tetap `/indodax/callback`

## Menjalankan lokal

```bash
yarn install
cp .env.example .env
yarn lint
yarn build
yarn dev
```

Jika `INDODAX_ENABLE_CALLBACK_SERVER=true`, callback server ikut start saat app dijalankan.

## Validasi resmi repo

```bash
yarn lint
yarn typecheck:probes
yarn build
yarn test:probes
```

Probe yang sekarang masuk jalur resmi:

- `tests/private_api_v2_mapping_probe.ts`
- `tests/nginx_renderer_probe.ts`
- `tests/http_servers_probe.ts`
- `tests/telegram_menu_navigation_probe.ts`
- `tests/telegram_slippage_confirmation_probe.ts`
- `tests/runtime_backend_regression.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/execution_summary_failed_probe.ts`
- `tests/buy_entry_price_guard_probe.ts`
- `tests/live_submission_uncertain_probe.ts`
- `tests/cancel_submission_uncertain_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/app_lifecycle_servers_probe.ts`
- `tests/bootstrap_observability_probe.ts`
- `tests/callback_reconciliation_probe.ts`
- `tests/worker_timeout_probe.ts`

## File referensi status

- `AUDIT_FORENSIK_PROMPT.md` = hasil audit keras terbaru
- `REFACTOR_LOG.md` = daftar perubahan source yang benar-benar masuk
- `SESSION_CONTEXT_NEXT.md` = ringkasan singkat untuk lanjut sesi berikutnya
