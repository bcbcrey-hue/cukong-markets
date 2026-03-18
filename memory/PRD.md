# PRD — Mafiamarkets P0 Indodax v2 / Callback / Nginx Final

## Original Problem Statement
User meminta P0 langsung pada repo mafiamarkets-refactor-tiga dengan konteks utama:
- REFACTOR_LOG.md
- SESSION_CONTEXT_NEXT.md
- README.md
- mafiamarkets-blueprint.md

Tugas P0 sekarang:
1. Migrasi endpoint history Indodax ke v2
2. Tambahkan callback server Indodax yang configurable penuh via .env
3. Tambahkan template nginx + renderer supaya saat ganti domain atau VPS cukup ubah .env lalu render config

Aturan wajib:
- audit singkat dulu, lalu langsung implementasi nyata
- jangan berhenti di penjelasan
- jangan buat placeholder palsu
- jangan merusak flow trading, execution, state, persistence, startup, shutdown, dan Telegram
- wiring antar modul harus benar-benar nyata
- verifikasi build, lint, dan probe/test harus dijalankan lalu dilaporkan jujur
- kalau ada blocker, tulis spesifik
- jangan overclaim live-ready bila live end-to-end belum terbukti

## Architecture Decisions
- Pertahankan arsitektur final `scanner -> signal -> intelligence -> execution` dan tidak membongkar flow trading yang sudah stabil.
- History Indodax ditambah mode env `v2_prefer | v2_only | legacy`, dengan default `v2_prefer` untuk migrasi aman bertahap.
- Response v2 dimap ke model internal legacy-compatible agar recovery, fill aggregation, fee accounting, order status, dan position state tetap memakai jalur core yang sama.
- Pilih arsitektur **callback server terpisah port** karena paling stabil untuk user awam: callback traffic tidak bercampur dengan health/main runtime endpoint, nginx lebih mudah dirender, dan domain/VPS bisa diganti cukup dari `.env`.
- Tambahkan `src/server/appServer.ts` untuk app health HTTP ringan (`/healthz`) dan `src/integrations/indodax/callbackServer.ts` untuk callback endpoint env-driven.
- Persist callback state + callback events ke disk agar aman saat restart.
- Tambahkan nginx template + renderer berbasis `.env` agar minim edit manual saat pindah domain/VPS.

## What’s Implemented
- Audit pemakaian history lama menemukan caller inti di `ExecutionEngine` pada jalur `orderHistory()` dan `tradeHistory()`.
- Tambah env baru di `src/config/env.ts`:
  - `PUBLIC_BASE_URL`
  - `APP_PORT`
  - `APP_BIND_HOST`
  - `INDODAX_HISTORY_MODE`
  - `INDODAX_CALLBACK_PATH`
  - `INDODAX_CALLBACK_PORT`
  - `INDODAX_CALLBACK_BIND_HOST`
  - `INDODAX_CALLBACK_ALLOWED_HOST`
  - `INDODAX_ENABLE_CALLBACK_SERVER`
- Tambah type callback persistence di `src/core/types.ts`.
- Tambah persistence baru di `src/services/persistenceService.ts`:
  - `data/state/indodax-callback-state.json`
  - `data/history/indodax-callback-events.jsonl`
- Tambah method v2 di `src/integrations/indodax/privateApi.ts`:
  - `orderHistoriesV2()` → `GET /api/v2/order/histories`
  - `myTradesV2()` → `GET /api/v2/myTrades`
- Mapping v2 sekarang dikonversi ke shape internal legacy-compatible untuk order/trade history.
- `src/domain/trading/executionEngine.ts` sekarang memilih mode history sesuai env dan menjaga fallback/recovery tanpa merusak flow lama.
- Tambah `src/server/appServer.ts` untuk `/healthz` app utama.
- Tambah `src/integrations/indodax/callbackServer.ts` untuk callback server terpisah port dengan:
  - callback path dari env
  - host allow-list dari env
  - response cepat `ok` / `fail`
  - `/healthz`
  - logging + journal
  - persist callback event/state ke disk
- `src/app.ts` sekarang mewiring app server + callback server ke lifecycle start/stop nyata.
- Tambah deployment helper:
  - `deploy/nginx/mafiamarkets.nginx.conf.template`
  - `scripts/render-nginx-conf.mjs`
- Update dokumen final:
  - `.env.example`
  - `README.md`
  - `REFACTOR_LOG.md`
  - `SESSION_CONTEXT_NEXT.md`

## Verification Executed
Lulus:
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
- testing agent iteration 9 backend audit pass

## Prioritized Backlog
### P0
- Validasi live vendor untuk endpoint v2 Indodax.
- Validasi live callback delivery dari Indodax ke domain publik nyata.
- Perkuat fallback accounting saat detail trade exchange tidak lengkap.
- Dalami edge-case recovery restart live order parsial/terminal.

### P1
- Pindahkan pattern matching live path ke worker runtime bila perlu offload konsisten.
- Upgrade `recentTrades` dari inferred flow ke native trade print bila ada sumber valid.
- Pecah `executionEngine.ts` menjadi modul lebih kecil setelah P0 aman.

### P2
- Verifikasi end-to-end Telegram live delivery saat validasi live diizinkan.
- Tambah runbook backup/restore folder `data/`.

## Honest Notes
- Endpoint v2 dan callback server belum dibuktikan end-to-end ke vendor/live domain pada sesi ini.
- Probe HTTP server dan nginx renderer memakai perilaku lokal nyata.
- Beberapa probe exchange/Telegram masih memakai fake harness by design.
