# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/masreykangtrade-oss/cukong-markets`

## Posisi project yang harus dianggap benar (HEAD audit 2026-03-22)

- Source code runtime tetap sumber kebenaran utama.
- Startup observability sudah diperkuat (phase bootstrap/app jelas).
- `.env.example` tersedia dan sinkron dengan env runtime.
- Probe suite resmi mencakup bootstrap observability, worker timeout, buy-entry guard, dan jalur submission-uncertain.
- History/recovery Indodax tetap canonical ke V2 untuk scope yang di-claim source.

## Status verifikasi HEAD terbaru

- `npm run lint` lulus.
- `npm run build` lulus.
- `npm run typecheck:probes` lulus.
- `npm run verify` / `npm run test:probes` **belum lulus penuh** (gagal di `tests/runtime_backend_regression.ts` assertion worker path).

## Verdict yang harus dipakai pada sesi berikutnya

- source verification chain HEAD: **BELUM GREEN PENUH**.
- deploy-readiness: **BELUM bisa diklaim hijau penuh** selama verify chain resmi belum green.
- live trading nyata: **BELUM SIAP LIVE**.

## Blocker jujur yang masih tersisa

- Proof-chain verifikasi resmi belum bersih/reproducible penuh karena 1 probe runtime masih gagal.
- Secret handling akun masih membutuhkan penguatan operasional untuk live production.
- Belum ada pembuktian live trading end-to-end terhadap exchange nyata dalam jalur verify default.
