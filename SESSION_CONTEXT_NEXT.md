# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/masreykangtrade-oss/cukong-markets`

## Posisi project yang sekarang harus dianggap benar

- source code runtime tetap sumber kebenaran utama
- startup observability sudah diperkuat: bootstrap/app startup sekarang punya phase log yang jelas
- `.env.example` sekarang tersedia dan sinkron dengan env runtime aktual
- worker runtime path sudah aman untuk hasil build production
- official probe suite sekarang juga menjalankan bootstrap observability, worker timeout, buy-entry guard, `live_submission_uncertain`, dan `cancel_submission_uncertain`
- history/recovery Indodax tetap canonical ke V2 untuk scope migrasi yang memang di-claim source

## Temuan audit yang sudah ditutup

- error bootstrap yang tadinya bisa menutup root cause sekarang sudah memuat phase, stack, dan cause
- logger tidak lagi menyembunyikan object error penting sebagai `{}`
- request public/private API sekarang benar-benar memakai timeout runtime
- GET public/private API sekarang punya retry aman untuk failure retriable; POST trading tetap tidak di-retry agar tidak memicu duplicate order
- BUY tidak lagi boleh lahir dari reference/entry price yang invalid
- live submit yang ambigu sekarang masuk `submission_uncertain` lalu dicoba direkonsiliasi otomatis via `openOrders`/history sebelum dianggap final
- false alarm worker exit saat shutdown normal sudah dibersihkan dari log

## Status verifikasi terbaru

- `npm run lint` lulus
- `npm run build` lulus
- `npm run typecheck:probes` lulus
- `npm run test:probes` lulus
- suite resmi sudah mencakup probe safety untuk startup, worker timeout, buy-entry guard, dan submission-uncertain cancel safety

## Sinkronisasi testing terbaru — Telegram hotlist gating + runtime-safe output (2026-03-24 UTC)

- ✅ `npm run lint`
- ✅ `npm run build`
- ✅ `npm run typecheck:probes`
- ⚠️ `npx tsx tests/telegram_menu_navigation_probe.ts`
  - gagal awal karena `DATA_DIR` belum diset oleh environment lokal probe
- ✅ `DATA_DIR=/tmp/cukong-probe-nav npx tsx tests/telegram_menu_navigation_probe.ts`
- ✅ `npx tsx tests/telegram_message_chunking_probe.ts`
- ✅ `npm run verify`

## Finalisasi verifikasi (2026-03-22 UTC)

- Bukti literal terbaru tersedia di `test_reports/typecheck_probes_final.txt`, `test_reports/probe_list_final.txt`, `test_reports/probe_audit_final.txt`, `test_reports/test_probes_final.txt`, dan `test_reports/verify_final.txt`.
- Ringkasan sinkronisasi final: `test_reports/final_verification_sync.json`.
- Warning npm `Unknown env config "http-proxy"` tetap muncul sebagai warning environment non-blocking (exit code command tetap 0).

## Verdict yang harus dipakai pada sesi berikutnya

- deploy-readiness source repo: **SIAP DEPLOY**
- live trading nyata: **BELUM SIAP LIVE**

## Blocker jujur yang masih tersisa

- jalur `submission_uncertain` sudah lebih aman di source tetapi belum terbukti end-to-end terhadap exchange nyata untuk seluruh edge case
- belum ada pembuktian exchange live shadow-run/non-destruktif dari repo ini

## Tambahan konteks — Phase 2 Batch 3 (Runtime verifier contract)

- Command resmi baru: `npm run runtime:contract`.
- Dokumen canonical target proof VPS: `docs/runtime_vps_verifier_contract.md`.
- Scope batch ini hanya memaku kontrak target + evidence gate; belum memvalidasi VPS nyata.
- Status kejujuran tidak berubah: pembuktian Telegram live connected dan probe endpoint deploy nyata tetap harus dilakukan di VPS.

- `npm run runtime:contract` sekarang menulis artifact `test_reports/runtime_contract_batch3_current.json` secara otomatis dan nilainya diturunkan dari env canonical `src/config/env.ts`.
