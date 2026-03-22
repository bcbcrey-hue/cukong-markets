# REFACTOR_LOG

Repository aktif: `https://github.com/masreykangtrade-oss/cukong-markets`

Dokumen ini mencatat perubahan yang benar-benar masuk ke source aktual, sekaligus membedakan progres historis vs status HEAD saat ini.

## Perubahan inti yang selesai (historis perubahan source)

### 1. Startup / bootstrap observability

- `src/bootstrap.ts` memuat runtime bertahap dan membungkus error per phase bootstrap.
- failure log bootstrap memuat phase, stack, dan cause chain untuk debugging.
- `src/app.ts` memuat phase log eksplisit untuk startup runtime utama.

### 2. Logger / error serialization

- `src/core/logger.ts` men-serialize `error` dan `err`.
- `src/core/scheduler.ts` mengeluarkan log saat job gagal/overlap.
- `src/core/shutdown.ts` menyimpan error object penuh.

### 3. Worker runtime correctness (historis)

- Resolver worker memprioritaskan artifact build (`dist/workers/*.js`) lalu fallback dev path.
- Worker path tidak bergantung hanya pada `process.cwd()`.
- Noise log worker exit saat shutdown normal sudah dibersihkan.

### 4. Execution safety / resilience

- BUY divalidasi untuk notional/reference/entry/quantity sebelum order dibuat.
- SELL manual menolak exit price invalid.
- Retry GET public/private API ditambah untuk failure retriable; POST trading/cancel tetap non-retry.
- Jalur `submission_uncertain` ditambah mitigasi reconcile sebelum finalisasi.

### 5. Env contract / docs truthfulness

- `.env.example` tersedia dan sinkron dengan env runtime.
- README sudah diarahkan agar tidak overclaim live readiness.
- Runner probe resmi mencakup probe safety tambahan (bootstrap/worker timeout/buy guard/submission-uncertain).

## Riwayat validasi yang pernah dijalankan

- `npm ci`
- `npm run lint`
- `npm run build`
- `npm run typecheck:probes`
- `npm run test:probes`

Catatan: daftar di atas adalah riwayat eksekusi yang pernah dilakukan pada tahap sebelumnya, **bukan jaminan status hijau HEAD saat ini**.

## Status HEAD saat ini (sinkron audit 2026-03-22)

- `npm run typecheck:probes` lulus.
- `npm run verify` / `npm run test:probes` belum green penuh karena gagal di `tests/runtime_backend_regression.ts` (assertion worker path).
- Verdict live trading tetap: **BELUM SIAP LIVE**.

## Batas jujur yang masih tersisa

- Jalur `submission_uncertain` sudah dimitigasi di source, tetapi belum terbukti end-to-end terhadap exchange nyata untuk semua edge case.
- Belum ada bukti submit live trading end-to-end dalam jalur verifikasi default repo.
