# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga`

Gunakan file ini sebagai konteks cepat yang **sinkron penuh** dengan `REFACTOR_LOG.md`.

---

## 1. Posisi project yang harus dianggap benar

Status aktual repo:

- refactor backend **sudah terimplementasi**, bukan draft
- `yarn lint` lulus
- `yarn build` lulus
- probe runtime, Telegram, history v2, callback server, dan nginx renderer lulus
- `tests/app_lifecycle_servers_probe.ts` juga lulus
- runtime utama tetap:
  `tickers + depth -> MarketWatcher -> SignalEngine -> intelligence pipeline -> OpportunityAssessment -> Hotlist -> ExecutionEngine`
- worker runtime untuk `feature`, `pattern`, dan `backtest` sudah ada
- dokumen `README.md`, `.env.example`, `REFACTOR_LOG.md`, dan file ini sudah sinkron

---

## 2. Truth penting per modul

### Trading / execution / history

- live buy / sell / cancel baseline tetap ada
- order live menyimpan `exchangeOrderId` dan disinkronkan lewat `openOrders()` lalu fallback ke `getOrder()` dan history layer
- mode history sekarang:
  - `v2_prefer`
  - `v2_only`
  - `legacy`
- default repo sekarang `v2_prefer`
- method v2 yang sudah ada di integrasi Indodax:
  - `GET /api/v2/order/histories`
  - `GET /api/v2/myTrades`
- response v2 dipetakan ke model internal legacy-compatible supaya recovery/fill accounting tidak perlu dibongkar besar
- `SettingsService` tetap memigrasikan slippage legacy `25/80` ke `60/150`

### Callback / HTTP / deployment helpers

- app utama sekarang punya HTTP server ringan dengan `/healthz`
- callback server Indodax sekarang modul terpisah, env-driven, dan bisa hidup di port berbeda
- callback path dibaca dari env (`INDODAX_CALLBACK_PATH`)
- callback host allow-list dibaca dari env (`INDODAX_CALLBACK_ALLOWED_HOST`)
- callback event dipersist ke:
  - `data/history/indodax-callback-events.jsonl`
  - `data/state/indodax-callback-state.json`
- renderer nginx aktif di `scripts/render-nginx-conf.mjs`
- template nginx aktif di `deploy/nginx/mafiamarkets.nginx.conf.template`
- lifecycle `createApp().start()/stop()` sudah diverifikasi ikut menyalakan dan mematikan app server + callback server
- target operasional saat ganti domain/VPS sekarang: cukup ubah `.env`, lalu render ulang config nginx

### Telegram

- Telegram button UI tetap UI utama
- main menu flat lama tetap sudah diganti 7 kategori hierarkis
- callback navigasi `NAV` tetap terpisah dari callback aksi live
- `Buy Slippage X bps` tetap berada di submenu `Positions / Orders / Manual Trade`

---

## 3. Hal yang sudah ditutup, jangan diulang

- compile blocker TypeScript/support files
- mismatch contract app ↔ persistence ↔ state ↔ hotlist ↔ report ↔ Telegram ↔ execution
- dashboard Telegram flat lama
- callback reachability + tombol `Kembali`
- migrasi slippage Telegram `60/150`
- history mode env-driven `v2_prefer | v2_only | legacy`
- callback server env-driven + `/healthz`
- nginx template + renderer env-driven

---

## 4. Backlog aktif yang nyata

### P0

- validasi live vendor untuk endpoint v2 Indodax
- validasi callback delivery live dari Indodax ke domain publik nyata
- fallback accounting saat detail trade exchange tidak tersedia penuh
- recovery restart untuk skenario partial fill / cancel / close yang lebih lengkap

### P1

- pindahkan pattern matching live path ke worker runtime jika perlu offload konsisten
- upgrade trade-flow bila ada sumber trade print native
- pecah `executionEngine.ts` menjadi modul lebih kecil setelah P0 aman

### P2

- verifikasi end-to-end Telegram live delivery saat validasi live diizinkan
- tambah runbook backup/restore folder `data/`

---

## 5. Next target paling logis

1. validasi live vendor untuk history v2 dan callback publik
2. hardening edge-case recovery restart order live
3. fallback accounting untuk detail fee/executed trade yang parsial
4. baru setelah itu refactor modular `executionEngine.ts`

---

## 6. Rule kerja sesi berikutnya

- jangan mengulang batch lama yang sudah selesai
- jangan campur status lama dengan status implementasi terbaru
- jika ada mismatch baru, utamakan implementasi aktual repo + blueprint
- jangan overclaim live execution/history/callback sudah terbukti penuh bila live end-to-end belum dijalankan
- gunakan `REFACTOR_LOG.md` sebagai sumber detail dan file ini sebagai ringkasan cepat

---

## 7. Validasi cepat yang bisa dipakai ulang

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
