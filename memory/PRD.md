# PRD - Audit Keras Runtime Cukong-Markets

## Original Problem Statement
Gunakan repository source code aktual sebagai sumber kebenaran utama. Audit keras source aktual lalu implementasikan perbaikan nyata agar jalur startup, execution, recovery, observability, dan deploy-readiness repo ini tidak lagi parsial, khususnya dalam konteks migrasi history/recovery Indodax. Wajib membedakan source bug vs deploy/config issue vs observability issue vs docs mismatch, lalu berikan verdict tegas SIAP DEPLOY / BELUM SIAP DEPLOY dan SIAP LIVE / BELUM SIAP LIVE.

## User Choice
- Format laporan akhir: rinci per file/modul

## Architecture Decisions
- Pertahankan arsitektur backend TypeScript existing; hindari refactor kosmetik besar
- Perkuat observability lewat phase-based startup logging di bootstrap dan app runtime
- Perbaiki error serialization di logger agar stack/cause tidak hilang
- Pertahankan recovery/history V2 existing; tambah hardening di input validation, worker path, timeout HTTP, dan probe coverage
- Dokumen harus mengikuti runtime truth, bukan klaim lama

## What's Implemented
- `src/bootstrap.ts`: dynamic runtime loading + bootstrap phases + fallback console error output dengan serialized stack/cause
- `src/app.ts`: startup phase logs untuk persistence, state load, worker, app server, callback server, recovery, posisi, Telegram, polling; set runtime ERROR saat startup gagal
- `src/core/logger.ts` + `src/core/error-utils.ts`: serializer `error/err` eksplisit agar root cause tidak lagi `{}`
- `src/core/scheduler.ts` dan `src/core/shutdown.ts`: log error operasional lebih jujur
- `src/services/workerPoolService.ts`: path worker build-safe, respawn/timeout logging, dan pembersihan false-positive exit logs saat shutdown normal
- `src/integrations/indodax/publicApi.ts` + `src/integrations/indodax/privateApi.ts` + `src/integrations/indodax/client.ts`: `INDODAX_TIMEOUT_MS` sekarang aktif dipakai oleh runtime
- `src/domain/trading/executionEngine.ts` + `src/domain/trading/riskEngine.ts`: guard harga/notional/quantity BUY invalid sebelum order tercipta; SELL invalid price diblok
- `.env.example`: dibuat sinkron dengan env runtime aktual
- `scripts/run-probes.mjs`: suite resmi kini mencakup `bootstrap_observability_probe`, `worker_timeout_probe`, dan `buy_entry_price_guard_probe`
- Docs diperbarui: `README.md`, `REFACTOR_LOG.md`, `SESSION_CONTEXT_NEXT.md`, `AUDIT_FORENSIK_PROMPT.md`

## Validation Actually Run
- `yarn install`
- `yarn lint`
- `yarn build`
- `yarn typecheck:probes`
- `yarn test:probes`
- targeted rerun: `tests/app_lifecycle_servers_probe.ts`, `tests/worker_timeout_probe.ts`
- testing agent report: `/app/test_reports/iteration_14.json`

## Prioritized Backlog
### P0
- Tangani ambiguous live order submission saat request trade timeout/network error agar tidak berbahaya bila exchange sebenarnya menerima order
- Tambah non-destructive auth/shadow-run validation untuk membuktikan live flow tanpa order nyata

### P1
- Pecah `src/domain/trading/executionEngine.ts` menjadi modul lebih kecil agar regression surface berkurang
- Tambah smoke test operasional untuk startup production path + health + callback + recovery sequence

### P2
- Tambah rate limiter eksplisit berbasis quota jika nanti kebutuhan exchange throughput meningkat
- Perluas probe untuk path live-failure ambiguity yang lebih granular

## Next Tasks
- Jika target berikutnya adalah live readiness, fokus berikutnya harus pada safe reconciliation untuk timeout/partial submit dan bukti operasional non-destruktif
