# REFACTOR_LOG

Repository aktif: `https://github.com/masreykangtrade-oss/cukong-markets`

Dokumen ini hanya mencatat perubahan yang benar-benar masuk ke source aktual.

## Perubahan inti yang selesai

### 1. Startup / bootstrap observability

- `src/bootstrap.ts` sekarang memuat runtime secara bertahap dan menangkap error import/runtime start di dalam phase bootstrap
- failure log bootstrap sekarang memuat phase, stack, dan cause chain yang bisa dipakai untuk debugging production
- `src/app.ts` sekarang memberi phase log eksplisit untuk:
  - persistence bootstrap
  - runtime state load
  - worker pool start
  - app server start
  - callback server start
  - recovery live orders
  - evaluasi posisi
  - Telegram start
  - polling start

### 2. Logger / error serialization

- `src/core/logger.ts` sekarang men-serialize `error` dan `err`
- startup failure tidak lagi rawan tampil sebagai objek kosong `{}`
- `src/core/scheduler.ts` sekarang mengeluarkan log saat job gagal atau overlap
- `src/core/shutdown.ts` sekarang menyimpan error object penuh, bukan hanya message string

### 3. Worker runtime correctness

- `src/services/workerPoolService.ts` sekarang memprioritaskan path worker build (`dist/workers/*.js`) lalu fallback ke path dev
- worker path tidak lagi bergantung hanya pada `process.cwd()`
- false alarm log saat worker dihentikan secara sengaja sudah dibersihkan
- timeout worker sekarang tetap terlihat jelas tanpa mengotori log dengan exit-error palsu saat shutdown normal

### 4. Execution safety / resilience

- `src/domain/trading/executionEngine.ts` sekarang memvalidasi notional, reference price, entry price, dan quantity sebelum BUY dibuat
- SELL manual sekarang menolak exit price yang invalid
- `src/domain/trading/riskEngine.ts` sekarang memblok entry jika ukuran posisi atau reference price signal invalid
- `src/integrations/indodax/publicApi.ts` dan `src/integrations/indodax/privateApi.ts` sekarang memakai timeout request nyata via `INDODAX_TIMEOUT_MS`
- GET public/private API sekarang punya retry aman untuk failure retriable; POST trading/cancel tetap tidak di-retry agar tidak memicu duplicate live order
- live submit yang ambigu karena timeout/network tidak lagi langsung direject; runtime menandai `submission_uncertain`, mencoba reconcile via `openOrders`/history, dan `cancelAllOrders()` tidak lagi melakukan local cancel berbahaya untuk order tanpa `exchangeOrderId`

### 5. Env contract / docs truthfulness

- `.env.example` sekarang benar-benar ada dan sinkron dengan env yang dibaca runtime
- `README.md` disesuaikan agar tidak lagi overclaim status live trading
- `test:probes` resmi sekarang memasukkan `bootstrap_observability_probe`, `worker_timeout_probe`, `buy_entry_price_guard_probe`, `live_submission_uncertain_probe`, dan `cancel_submission_uncertain_probe`

## Validasi yang benar-benar dijalankan

- `npm ci`
- `npm run lint`
- `npm run build`
- `npm run typecheck:probes`
- `npm run test:probes`
- pada kondisi final, `npm run test:probes` sudah mencakup probe safety tambahan untuk `buy_entry_price_guard`, `live_submission_uncertain`, dan `cancel_submission_uncertain`

## Finalisasi verifikasi (2026-03-22 UTC)

- Bukti run literal terbaru disimpan di `test_reports/npm_ci_final.txt`, `test_reports/typecheck_probes_final.txt`, `test_reports/probe_list_final.txt`, `test_reports/probe_audit_final.txt`, `test_reports/test_probes_final.txt`, dan `test_reports/verify_final.txt`.
- Ringkasan sinkronisasi final disimpan di `test_reports/final_verification_sync.json`.
- Warning environment npm `Unknown env config "http-proxy"` tetap muncul pada run npm, dicatat sebagai non-blocking warning dan tidak disembunyikan.

## Status jujur saat ini

### SIAP DEPLOY

Ya, untuk scope source repo dan runtime startup/recovery/observability yang diaudit.

### SIAP LIVE

Belum.

Blocker utama yang masih tersisa:

- jalur `submission_uncertain` sudah dimitigasi di source, tetapi belum ada pembuktian exchange nyata untuk semua edge case identifikasi order pasca-timeout
- belum ada pembuktian operasional nyata dari repo ini untuk live shadow-run/non-destruktif auth check exchange

## Addendum — Phase 2 Batch 3 (Runtime Verifier Contract & Target Proof)

- Menambahkan kontrak verifier runtime VPS yang canonical di `docs/runtime_vps_verifier_contract.md`.
- Menambahkan helper `scripts/runtime-verifier-contract.mjs` untuk menampilkan target runtime proof dari env aktual (tanpa klaim VPS sudah tervalidasi).
- Menambahkan npm script `runtime:contract` agar kontrak target dapat dihasilkan konsisten via command resmi.
- README disinkronkan untuk menunjuk command + dokumen canonical batch ini.

Batas kejujuran tetap:

- dari repo hanya bisa memaku **target proof contract**,
- koneksi Telegram live, bind/listen aktual VPS, dan probe endpoint pada runtime deploy tetap harus dibuktikan di VPS nyata.

- Revisi helper batch ini agar membaca nilai canonical langsung dari `src/config/env.ts` dan command resmi `npm run runtime:contract` benar-benar menulis artefak ke `test_reports/runtime_contract_batch3_current.json`.
