# REFACTOR_LOG

Repository aktif: `https://github.com/bcbcrey-hue/cukong-markets`

Dokumen ini adalah **sumber kebenaran final** untuk status repo setelah audit implementasi aktual, migrasi history Indodax v2, callback server env-driven, renderer nginx, perapian Telegram UX, dan sinkronisasi dokumen.

---

## 1. Status repo setelah audit final

Validasi yang **sudah diverifikasi langsung** pada repo lokal:

- `yarn install` selesai
- `yarn lint` lulus
- `yarn build` lulus
- `tests/runtime_backend_regression.ts` lulus
- `tests/worker_timeout_probe.ts` lulus
- `tests/live_execution_hardening_probe.ts` lulus
- `tests/execution_summary_failed_probe.ts` lulus
- `tests/telegram_menu_navigation_probe.ts` lulus
- `tests/telegram_slippage_confirmation_probe.ts` lulus
- `tests/indodax_history_v2_probe.ts` lulus
- `tests/private_api_v2_mapping_probe.ts` lulus
- `tests/http_servers_probe.ts` lulus
- `tests/nginx_renderer_probe.ts` lulus
- `tests/app_lifecycle_servers_probe.ts` lulus
- testing agent iteration 8 sebelumnya juga pass tanpa issue blocking pada scope Telegram backend
- testing agent iteration 9 pass tanpa issue blocking pada scope P0 backend

Jalur runtime aktual yang berlaku sekarang:

`tickers + depth -> MarketWatcher -> SignalEngine -> FeaturePipeline/HistoricalContext/Probability/EdgeValidation/EntryTiming -> OpportunityAssessment -> Hotlist -> ExecutionEngine`

Status final yang benar saat ini:

- runtime utama sudah sinkron pada arsitektur `scanner -> signal -> intelligence -> execution`
- `OpportunityAssessment` tetap contract final sebelum execution
- persistence JSON + JSONL aktif untuk state, order, position, trade, journal, pair history, anomaly event, pattern outcome, backtest, execution summary, trade outcome summary, callback state, dan callback event log
- Telegram button UI tetap menjadi UI operasional utama dengan menu hierarkis 7 kategori
- mode history Indodax sekarang mendukung `v2_prefer | v2_only | legacy`
- callback server Indodax sudah nyata, full env-driven, punya `/healthz`, path configurable, host allow-list configurable, startup/shutdown nyata, dan persist event ke disk
- app utama sekarang punya HTTP server ringan untuk `/healthz`
- probe lifecycle `createApp().start()/stop()` juga sudah memverifikasi app server + callback server benar-benar ikut start/stop bersama runtime
- template nginx + renderer sudah ada dan bisa dirender ulang hanya dari `.env`

Hal yang **belum final** dan jangan di-overclaim:

- endpoint history Indodax v2 dan callback server **belum divalidasi end-to-end ke vendor/live domain** pada sesi ini
- fallback accounting saat detail trade exchange tidak lengkap masih punya backlog
- recovery restart live order untuk edge-case tertentu masih punya backlog lanjutan
- `recentTrades` pada market intelligence masih **inferred flow** dari delta volume lokal, belum native trade print exchange
- probe backend memakai fake exchange client / fake callback harness / render harness, bukan validasi live exchange atau live delivery callback

---

## 2. Peta struktur repo yang aktif dan relevan

Root aktif:

- `package.json`
- `README.md`
- `.env.example`
- `src/app.ts`
- `src/bootstrap.ts`
- `src/config/env.ts`
- `deploy/nginx/mafiamarkets.nginx.conf.template`
- `scripts/render-nginx-conf.mjs`
- `REFACTOR_LOG.md`
- `SESSION_CONTEXT_NEXT.md`
- `mafiamarkets-blueprint.md`
- probe di `tests/*`

Layer inti yang terdampak langsung:

- `src/config/env.ts`
- `src/core/types.ts`
- `src/services/persistenceService.ts`
- `src/integrations/indodax/privateApi.ts`
- `src/integrations/indodax/callbackServer.ts`
- `src/server/appServer.ts`
- `src/domain/trading/executionEngine.ts`
- `src/app.ts`

---

## 3. Hasil audit implementasi per flow inti

### 3.1 Environment, startup/shutdown, HTTP server, dan persistence

- `src/config/env.ts` sekarang memegang contract baru untuk:
  - `PUBLIC_BASE_URL`
  - `APP_PORT`
  - `APP_BIND_HOST`
  - `INDODAX_HISTORY_MODE`
  - `INDODAX_CALLBACK_PATH`
  - `INDODAX_CALLBACK_PORT`
  - `INDODAX_CALLBACK_BIND_HOST`
  - `INDODAX_CALLBACK_ALLOWED_HOST`
  - `INDODAX_ENABLE_CALLBACK_SERVER`
- callback URL publik sekarang diturunkan dari `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- `src/services/persistenceService.ts` sekarang menambah persistence untuk:
  - `data/state/indodax-callback-state.json`
  - `data/history/indodax-callback-events.jsonl`
- `src/server/appServer.ts` menambah HTTP server ringan untuk app utama dengan endpoint `/healthz`
- `src/integrations/indodax/callbackServer.ts` menambah callback server terpisah port dengan startup/shutdown nyata
- `src/app.ts` sekarang mewiring app server + callback server ke lifecycle start/stop aplikasi tanpa memutus polling, Telegram, worker, atau execution

### 3.2 Market flow

- `PairUniverse` tetap membawa `high24h` / `low24h` dari ticker exchange
- `MarketWatcher` tetap menarik ticker + depth, menyimpan history lokal, dan menginfer trade flow dari delta volume
- tidak ada perubahan yang merusak alur scanner/hotlist existing

### 3.3 Signal + intelligence + history flow

- `SignalEngine`, `FeaturePipeline`, `HistoricalContext`, `Probability`, `EdgeValidation`, dan `OpportunityEngine` tetap terhubung seperti sebelumnya
- perubahan P0 kali ini tidak mengubah contract intelligence final

### 3.4 Trading + execution + Indodax history v2

- audit semua pemakaian history lama menunjukkan caller inti berada di `ExecutionEngine` pada jalur:
  - recovery order terminal via `orderHistory()`
  - fee / fill reconciliation via `tradeHistory()`
- `src/integrations/indodax/privateApi.ts` sekarang menambah method v2:
  - `orderHistoriesV2()` → `GET /api/v2/order/histories`
  - `myTradesV2()` → `GET /api/v2/myTrades`
- response v2 dipetakan ke model internal legacy-compatible agar caller utama tidak perlu dirombak total
- `ExecutionEngine` sekarang memilih mode sesuai env:
  - `v2_prefer` → coba v2 dulu, fallback ke legacy bila v2 gagal/kosong
  - `v2_only` → hanya v2, tidak fallback
  - `legacy` → hanya history lama
- default repo sekarang adalah `v2_prefer`
- order recovery, restart recovery, fill aggregation, realized pnl, fee accounting, position state, dan order status tetap dijaga dengan contract internal yang sama

### 3.5 Callback server Indodax

- callback path dibaca dari env, tidak hardcoded
- host allow-list dibaca dari env, tidak hardcoded
- endpoint callback membalas cepat `ok` atau `fail`
- `/healthz` tersedia di callback server
- setiap callback yang diterima/ditolak dipersist ke JSONL dan state snapshot agar tidak hilang saat restart
- logging callback jelas ke logger + journal
- arsitektur yang dipilih adalah **callback server terpisah port** karena paling stabil dan paling mudah dioperasikan user awam melalui nginx

### 3.6 Telegram flow

- Telegram button UI tetap UI utama
- whitelist `TELEGRAM_ALLOWED_USER_IDS` tetap aktif
- menu hierarkis 7 kategori yang sudah masuk pada batch sebelumnya tetap dipertahankan
- perubahan P0 kali ini tidak memutus callback, upload legacy JSON, accounts, backtest, emergency, atau control runtime

### 3.7 Worker + backtest flow

- `WorkerPoolService` tetap aktif dengan worker `feature`, `pattern`, dan `backtest`
- `BacktestEngine` tetap replay dari pair-history JSONL dan persist hasil JSON
- tidak ada regresi yang terdeteksi pada probe runtime existing

---

## 4. Keputusan arsitektur dan contract final yang wajib dipertahankan

Keputusan final yang tetap berlaku:

- Telegram button UI tetap UI utama
- whitelist user tetap berbasis `TELEGRAM_ALLOWED_USER_IDS`
- legacy upload account JSON tetap didukung dalam format lama
- storage account tetap di `data/accounts/accounts.json`
- mode trading tetap `OFF | ALERT_ONLY | SEMI_AUTO | FULL_AUTO`
- `src/app.ts` tetap wiring utama runtime
- arsitektur final tetap `scanner -> signal -> intelligence -> execution`

Keputusan baru P0 yang aktif sekarang:

- history Indodax default pindah ke `v2_prefer`
- callback server memakai port terpisah dan dikontrol penuh via env
- nginx config dirender dari template + `.env`, bukan edit manual banyak file

Contract aktif yang wajib dipertahankan:

- `SignalCandidate`
- `OpportunityAssessment`
- `OrderRecord`
- `PositionRecord`
- `ExecutionSummary`
- `TradeOutcomeSummary`
- `IndodaxCallbackState`
- `IndodaxCallbackEvent`

---

## 5. Bug / mismatch penting yang sudah tertutup dan tervalidasi

Sudah tertutup dan jangan dianggap backlog lagi:

- compile blocker TypeScript/support files
- mismatch contract app ↔ persistence ↔ state ↔ hotlist ↔ report ↔ Telegram ↔ execution
- timeout deadlock / starvation pada worker pool
- baseline live order sync / cancel / duplicate-guard
- merge partial BUY fill ke satu posisi logis per pair/account
- aggressive BUY policy + timeout cancel untuk stale buy
- dashboard Telegram flat lama sudah diganti dengan menu hierarkis 7 kategori
- tombol `Kembali` dan reachability callback submenu sudah diproteksi probe
- migrasi default/max buy slippage ke `60/150` + warning/confirm flow Telegram sudah diproteksi probe
- history mode Indodax sekarang punya guardrail `v2_prefer | v2_only | legacy`
- callback path / allowed host / enable flag sekarang benar-benar env-driven
- nginx config sekarang dirender dari template + env

---

## 6. Backlog aktif yang benar-benar tersisa

### P0 — hardening live execution lanjutan

- validasi live vendor untuk endpoint `GET /api/v2/order/histories` dan `GET /api/v2/myTrades` pada akun/domain nyata
- validasi live callback delivery dari Indodax ke domain publik nyata
- recovery restart order live yang lebih lengkap untuk edge-case partial fill / cancel / close saat detail exchange parsial
- fallback accounting saat detail fee / executed trade exchange tidak tersedia penuh

### P1 — penguatan runtime/intelligence

- pindahkan pattern matching live path ke worker runtime bila butuh offload konsisten
- upgrade `recentTrades` dari inferred flow ke native trade print bila ada sumber yang valid
- pecah `executionEngine.ts` menjadi modul lebih kecil agar risiko regresi turun tanpa mengubah perilaku inti

### P2 — operasional lanjutan

- verifikasi end-to-end Telegram live delivery saat kredensial/live validation memang diizinkan
- tambah runbook ops singkat untuk backup/restore folder `data/`

---

## 7. Next target paling logis

1. validasi live vendor untuk history v2 + callback publik
2. perdalam edge-case recovery restart order live parsial/terminal
3. perkuat fallback accounting saat exchange mengembalikan detail parsial
4. kecilkan `executionEngine.ts` setelah P0 aman

---

## 8. Ringkasan final satu paragraf

Repo aktif `https://github.com/bcbcrey-hue/cukong-markets` sekarang berada pada status backend refactor yang nyata dan saling terhubung dari env/core/persistence, market watcher, signal engine, intelligence/history, worker runtime, backtest, Telegram operational hooks, sampai execution hardening live. Sumber kebenaran terbaru adalah: runtime utama sudah memakai `OpportunityAssessment` sebelum execution, BUY baseline sudah aggressive limit dengan slippage terukur, repeated partial BUY fill digabung ke satu posisi logis per pair/account, startup recovery + openOrders-first reconciliation aktif, Telegram UI sudah dirapikan menjadi menu hierarkis 7 kategori, history Indodax sekarang mendukung mode `v2_prefer | v2_only | legacy` dengan default `v2_prefer`, callback server env-driven + `/healthz` + persistence event/state sudah terpasang nyata, dan nginx config kini bisa dirender dari `.env`; backlog yang tersisa kini terpusat pada validasi live vendor dan pendalaman edge-case recovery/accounting.
