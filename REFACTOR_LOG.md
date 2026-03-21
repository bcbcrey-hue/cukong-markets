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

### 5. Env contract / docs truthfulness

- `.env.example` sekarang benar-benar ada dan sinkron dengan env yang dibaca runtime
- `README.md` disesuaikan agar tidak lagi overclaim status live trading
- `test:probes` resmi sekarang memasukkan `bootstrap_observability_probe`, `worker_timeout_probe`, dan `buy_entry_price_guard_probe`

## Validasi yang benar-benar dijalankan

- `yarn install`
- `yarn lint`
- `yarn build`
- `yarn typecheck:probes`
- `yarn test:probes`
- rerun targeted:
  - `tests/app_lifecycle_servers_probe.ts`
  - `tests/worker_timeout_probe.ts`

## Status jujur saat ini

### SIAP DEPLOY

Ya, untuk scope source repo dan runtime startup/recovery/observability yang diaudit.

### SIAP LIVE

Belum.

Blocker utama yang masih tersisa:

- submit live order timeout/network masih belum punya pembuktian aman end-to-end jika exchange menerima order tetapi response tidak kembali lengkap
- belum ada pembuktian operasional nyata dari repo ini untuk live shadow-run/non-destruktif auth check exchange
