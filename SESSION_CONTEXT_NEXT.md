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

## Verdict yang harus dipakai pada sesi berikutnya

- deploy-readiness source repo: **SIAP DEPLOY**
- live trading nyata: **BELUM SIAP LIVE**

## Blocker jujur yang masih tersisa

- jalur `submission_uncertain` sudah lebih aman di source tetapi belum terbukti end-to-end terhadap exchange nyata untuk seluruh edge case
- belum ada pembuktian exchange live shadow-run/non-destruktif dari repo ini
