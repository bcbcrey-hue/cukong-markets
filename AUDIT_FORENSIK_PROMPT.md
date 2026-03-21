
Gunakan repository source code aktual sebagai sumber kebenaran utama.

Repository project GitHub:
- https://github.com/masreykangtrade-oss/cukong-markets

Dokumen implamentasi target UTAMA:
https://github.com/masreykangtrade-oss/cukong-markets/blob/main/AUDIT_FORENSIK_PROMPT.md

dokumen sinkronisasi referensi, bukan setara source code:
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/REFACTOR_LOG.md
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/SESSION_CONTEXT_NEXT.md
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/README.md
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/cukong-markets-blueprint.md

HIERARKI KEBENARAN WAJIB:
-Source code repo saat ini = sumber kebenaran utama
-AUDIT_FORENSIK_PROMPT.md = target audit/implementasi
-REFACTOR_LOG.md, SESSION_CONTEXT_NEXT.md, README.md, blueprint = referensi tambahan
-Jika dokumen bertentangan dengan source code aktual, menangkan source code

Gunakan repository source code aktual sebagai sumber kebenaran utama.

Repository:
https://github.com/masreykangtrade-oss/cukong-markets

TUJUAN UTAMA:
Lakukan audit keras terhadap source code aktual lalu langsung implementasikan perbaikan nyata agar jalur startup, execution, recovery, observability, dan deploy-readiness repo ini tidak lagi parsial, khususnya dalam konteks migrasi history/recovery Indodax.

ATURAN WAJIB:
1. Audit source aktual dulu, lalu langsung implementasikan perbaikan yang memang diperlukan.
2. Jangan berhenti di analisis.
3. Jangan percaya README, catatan lama, atau klaim arsitektur jika bertentangan dengan source code aktual.
4. Source of truth utama adalah file yang benar-benar dipakai runtime saat ini.
5. Semua verdict harus berbasis wiring runtime nyata, bukan sekadar ada file/interface/helper.
6. Jangan lakukan refactor kosmetik besar jika tidak diperlukan untuk correctness, startup reliability, recovery completeness, atau deploy-readiness.
7. Jika menemukan mismatch docs vs source, perbaiki docs agar jujur mengikuti executable truth.
8. Jangan menganggap masalah deploy VPS sebagai bug source kecuali memang ada akar masalah di repo.

KONTEKS TEMUAN YANG SUDAH ADA:
- Pada VPS sempat muncul error `Cannot find module 'dotenv/config'` saat menjalankan `node dist/bootstrap.js`.
- Itu menunjukkan dependency runtime di server sempat belum terpasang lengkap, jadi jangan salah menyimpulkan itu sebagai bug source utama repo.
- Setelah install dependency dan build, app masih gagal bootstrap tetapi logging startup hanya menampilkan `error:{}` / `bootstrap failed`, sehingga root cause asli tertutup.
- Karena itu, observability startup/error handling bootstrap saat ini dianggap belum cukup baik untuk production debugging.
- Fokus audit harus membedakan dengan tegas:
  a. bug source code,
  b. bug konfigurasi/deploy,
  c. kelemahan observability,
  d. mismatch dokumentasi.

AREA PRIORITAS WAJIB DIAUDIT DAN DIPERBAIKI:
1. Startup/bootstrap path
   - audit `src/bootstrap.ts`, `src/app.ts`, config/env loading, dependency initialization
   - pastikan root cause startup error terlihat jelas di log production
   - jangan biarkan error bootstrap berakhir sebagai `{}` tanpa stack/cause yang berguna

2. Env contract & deploy-readiness
   - audit seluruh env wajib vs opsional
   - pastikan validasi env akurat, pesan error jelas, dan dokumentasi `.env.example` benar-benar ada, lengkap, dan sinkron
   - pastikan README setup env tidak bohong dan sesuai runtime truth

3. Execution/recovery Indodax
   - audit jalur order lifecycle, persistence, recovery state, history mode, callback/reconciliation flow
   - target utama: execution/recovery tidak lagi parsial
   - audit apakah migrasi history/recovery benar-benar lengkap, terutama pada startup/recovery setelah restart

4. Observability & production debugging
   - perbaiki logging agar error stack, cause, dan konteks penting terlihat
   - audit apakah logger/Pino sekarang menyembunyikan error object
   - tambahkan logging yang cukup untuk membedakan gagal di env validation, persistence init, port bind, callback server, recovery, Telegram launch, worker start, dan dependency init

5. Worker/runtime path correctness
   - audit worker thread path resolution
   - pastikan aman saat dijalankan dari hasil build production, bukan hanya dev mode

6. Trading safety & correctness
   - audit apakah entry price dari signal selalu tervalidasi sebelum execution
   - audit apakah error handling live trading masih parsial
   - audit retry/error flow agar tidak berbahaya di kondisi gagal parsial
   - audit risk guard yang penting agar order tidak lahir dari data invalid

7. Rate limiting / resilience
   - audit apakah ada rate limiting / throttling / concurrency guard yang memadai terhadap API yang dipakai
   - jika belum ada dan memang diperlukan untuk correctness/stability, implementasikan

8. Docs truthfulness
- Perbarui README.md dan dokumen terkait agar sinkron dengan source code terbaru. Source code tetap sumber kebenaran utama; dokumen hanya boleh merefleksikan kondisi source yang nyata.
- Perbarui dan bersihkan `AUDIT_FORENSIK_PROMPT.md`, `REFACTOR_LOG.md`, dan `SESSION_CONTEXT_NEXT.md` secara terarah agar sinkron dengan hasil kerja nyata dan mudah dijadikan acuan sesi berikutnya.
- JANGAN menambahkan isi baru di atas isi lama yang bertabrakan; sinkronkan setiap dokumen agar tetap konsisten dan mudah dipakai pada sesi selanjutnya.
- Acuan perbaikan sesi berikutnya harus terutama disinkronkan ke `REFACTOR_LOG.md` dan `SESSION_CONTEXT_NEXT.md`. `AUDIT_FORENSIK_PROMPT.md` harus tetap dijaga sebagai target/checklist utama, bukan dump catatan sesi.
- Perbarui `cukong-markets-blueprint.md` hanya jika memang perlu, agar tidak overclaim dan tetap jujur.
- Jangan mengubah dokumen hanya demi kosmetik. Semua perubahan dokumen harus jujur, faktual, dan sinkron dengan tindakan serta hasil implementasi nyata.

HAL YANG HARUS DIVERIFIKASI SECARA NYATA:
- build lolos
- lint lolos
- script verifikasi/probes yang memang ada di repo benar-benar jalan
- startup production path bisa memberikan error yang jelas bila gagal
- bila bootstrap gagal, log harus menunjuk akar masalah nyata, bukan hanya `error:{}`
- recovery path tidak parsial
- wiring execution/recovery benar-benar terhubung, bukan hanya blueprint

DELIVERABLE WAJIB:
1. Audit keras per-file / per-modul untuk bagian yang relevan.
2. Daftar bug nyata yang ditemukan, dipisahkan antara:
   - source bug
   - deploy/config issue
   - observability issue
   - docs mismatch
3. Implementasi langsung pada repo untuk bug source yang memang perlu diperbaiki.
4. Perbaikan docs/env example bila tidak sinkron.
5. Ringkasan file apa saja yang diubah dan kenapa.
6. Verdict final tegas:
   - SIAP DEPLOY / BELUM SIAP DEPLOY
   - SIAP LIVE / BELUM SIAP LIVE
   - jika belum, jelaskan blocker yang tersisa secara jujur dan spesifik

LARANGAN:
- jangan hanya memberi analisis tanpa implementasi
- jangan menutupi ketidakpastian
- jangan mengklaim “sudah aman” jika recovery/execution masih parsial
- jangan memakai dokumen lama sebagai kebenaran jika source aktual berbeda
- jangan mencampur bug VPS dependency install dengan bug source repo kecuali memang terbukti ada akar source issue

Boleh melakukan live test trade secara nyata, buy/sell, serta berintegrasi dengan market Gunakan secret/env yang tersedia ini dibawah ini sebagai acuan test live dan mendapatkan hasil yang maskimal.

Gunakan data nyata dari environment untuk verifikasi live-test jika tersedia:

NODE_ENV=production


PUBLIC_BASE_URL=https://kangtrade.top

TELEGRAM_BOT_TOKEN=8681519384:AAFZ_-Mc7AItvp8If-0VA0vdFQPBHtObTYs
TELEGRAM_ALLOWED_USER_IDS=8172360366

APP_PORT=3000
APP_BIND_HOST=0.0.0.0

INDODAX_CALLBACK_PATH=/indodax/callback
INDODAX_CALLBACK_PORT=3011
INDODAX_CALLBACK_BIND_HOST=0.0.0.0
INDODAX_CALLBACK_ALLOWED_HOST=kangtrade.top
INDODAX_ENABLE_CALLBACK_SERVER=true

INDODAX_HISTORY_MODE=v2_only

INDODAX_PUBLIC_BASE_URL=https://indodax.com/api
INDODAX_PRIVATE_BASE_URL=https://indodax.com/tapi
INDODAX_TRADE_API_V2_BASE_URL=https://tapi.indodax.com

DATA_DIR=./data
LOG_DIR=./logs
TEMP_DIR=./tmp

Tes akun:

INDODAX_API_KEY=IFI1RPGI-2UNDTEIU-TVGMROAN-K0VSNWKA-UL376GIL
INDODAX_API_SECRET=d07885fed6534a836901ccf2366cb1063d5834cbaa0db423b4fce24d1935218c24db357c601fc9bc

CATATAN: boleh melakukan live trading dll

ATURAN WAJIB
- Jangan pernah print token, API key, secret, atau credential penuh
- Jangan commit secret ke repo
- Jangan taruh secret ke README, .env.example, log, atau output final
- Gunakan secret hanya dari environment runtime
- Jangan overclaim jika live end-to-end belum benar-benar terbukti

Setelah implamentasi target UTAMA selesai:
1. daftar file yang diubah,harus berisi checklist final yang ringkas, faktual, dan siap dipakai sebagai konteks sesi berikutnya jika diperlukan.
2. hasil audit ulang singkat terhadap target Utama
3. alasan perubahan
4. hasil lint/build/probe
5. validasi operasional
6. verdict jujur live-test


##Agent asked a question:

**1. Live Trade — Apakah saya boleh mengeksekusi order real saat validasi akhir?**
- a) Ya, boleh lakukan live buy/sell untuk membuktikan flow, silahkan melakukan apapun sebagai sarana implementasi yang nyata saya mengizinkan order real, cek koneksi, market data, auth dan sebagainya
- jika integrasi live sudah selesai beri laporan apakah semua flow logic trade sudah berfungsi sesuai cukong-markets-blueprint.md yang tertera.


**2. Kredensial Sensitif — Bagaimana saya menangani secret yang Anda kirim?**
- a) Pakai hanya saat runtime/test lalu pastikan tidak tertulis ke file repo



Kerjakan sekarang tanpa konfirmasi tambahan.




