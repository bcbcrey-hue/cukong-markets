Lakukan AUDIT FORENSIK ULANG terhadap repo ini, TANPA REFACTOR, TANPA IMPLEMENTASI, TANPA PATCH, TANPA MENGUBAH FILE.

Repository:
https://github.com/bcbcrey-hue/cukong-markets/tree/main

TUJUAN:
Saya ingin audit keras yang jujur untuk memverifikasi apakah klaim arsitektur dan fitur berikut benar-benar ADA dan benar-benar TERHUBUNG di source code saat ini, bukan sekadar ada file, interface, blueprint, README, atau kontrak yang terlihat bagus.

ATURAN WAJIB:
1. JANGAN refactor apa pun.
2. JANGAN mengubah file.
3. JANGAN memberi saran implementasi dulu.
4. Fokus hanya audit source code saat ini.
5. Audit harus PER-FILE dan PER-WIRING.
6. Jangan menganggap sesuatu “berfungsi” hanya karena ada file/module/class/function.
7. Sesuatu hanya boleh dianggap “terhubung” jika benar-benar:
   - diinstansiasi / diimport / dipanggil / dipakai dalam flow runtime nyata
   - punya jalur input-output yang jelas
   - tidak hanya berhenti di placeholder / contract / dead code
8. Jika ada method dipanggil tetapi implementasinya tidak ada, nyatakan sebagai MISMATCH.
9. Jika ada class/function ada tetapi tidak terbukti dipakai di flow runtime, nyatakan sebagai TIDAK TERBUKTI TERHUBUNG.
10. Jika ada klaim besar tetapi hanya sebagian yang nyata, tandai PARSIAL.
11. Jangan percaya README, blueprint, atau narasi. Semua klaim harus dibuktikan dari source code aktual.
12. Jika build/runtime path tampak mismatch, katakan jujur.
13. Jangan overclaim.
14. Jangan tulis asumsi seolah fakta.

CLAIM YANG HARUS DIAUDIT SATU PER SATU:
- market scanning
- scoring baseline
- microstructure heuristik
- probability & edge validation
- entry timing
- hotlist ranking
- execution hardening
- duplicate order guard
- fill reconciliation
- recovery startup
- Telegram ops UI
- backtest replay
- worker offloading
- persistence yang rapi

YANG HARUS DICEK SECARA KHUSUS:
A. Audit file utama runtime:
- src/bootstrap.ts
- src/app.ts

B. Audit wiring market/intelligence:
- src/domain/market/*
- src/domain/signals/*
- src/domain/intelligence/*
- src/domain/history/*
- src/domain/microstructure/*

C. Audit wiring trading/runtime:
- src/domain/trading/*
- src/services/*
- src/storage/*
- src/integrations/indodax/*

D. Audit wiring Telegram:
- src/integrations/telegram/*

E. Audit backtest/workers:
- src/domain/backtest/*
- src/workers/*
- src/services/workerPoolService.ts

F. Audit server/runtime ingress:
- src/server/*
- deploy/*
- scripts/*

METODE AUDIT YANG WAJIB:
Untuk setiap claim, lakukan:
1. Sebutkan file inti yang relevan.
2. Sebutkan function/class/method yang menjadi pusat claim itu.
3. Cek apakah function itu benar-benar dipanggil dari runtime utama.
4. Cek apakah data flow-nya nyambung end-to-end.
5. Cek apakah ada placeholder, dead path, mismatch nama method, contract yang tidak match, atau jalur yang putus.
6. Cek apakah claim itu:
   - BENAR
   - PARSIAL
   - SALAH
   - BELUM TERBUKTI
7. Beri alasan teknis singkat dan spesifik.
8. Wajib sertakan bukti file + method/function.

FORMAT OUTPUT WAJIB:

1. RINGKASAN EKSEKUTIF
- 1 paragraf singkat
- jelaskan repo ini secara jujur
- jangan promosi
- jangan pakai bahasa blueprint

2. CHECKLIST CLAIM
Gunakan format ini untuk SETIAP claim:

[CLAIM]
Status: BENAR / PARSIAL / SALAH / BELUM TERBUKTI

File inti:
- ...
- ...

Bukti nyata:
- ...
- ...

Wiring:
- Terhubung / Tidak terhubung / Parsial

Masalah / mismatch:
- ...
- ...

Verdict claim:
- 1-3 kalimat singkat, tegas, jujur

3. TEMUAN MISMATCH KONKRET
Buat section khusus berjudul:
TEMUAN MISMATCH / DEAD WIRING / KLAIM YANG TIDAK TERBUKTI

Isi dengan format:
- File:
- Method/function yang dipanggil:
- Masalah:
- Dampak ke claim:

4. AUDIT KHUSUS EXECUTION LAYER
Audit secara keras:
- apakah duplicate order guard benar-benar nyata
- apakah fill reconciliation benar-benar nyata
- apakah recovery startup benar-benar nyata
- apakah monitoring order aktif benar-benar nyata
- apakah evaluasi posisi terbuka benar-benar nyata
- apakah jalur buy/sell live benar-benar tersambung
- apakah partial fill aggregation benar-benar ada
- apakah restart safety benar-benar terbukti dari wiring

5. AUDIT KHUSUS TELEGRAM OPS UI
Audit:
- apakah menu hanya UI atau benar-benar memicu logic nyata
- apakah manual buy/sell benar-benar nyambung
- apakah emergency controls benar-benar nyambung
- apakah settings benar-benar mengubah runtime/settings yang dipakai

6. AUDIT KHUSUS BACKTEST / WORKERS / PERSISTENCE
Audit:
- apakah backtest benar-benar memakai data replay nyata
- apakah worker benar-benar dipakai runtime, bukan sekadar tersedia
- apakah persistence benar-benar jadi sumber state aktif, bukan dekorasi

7. FINAL VERDICT WAJIB
Berikan tabel/daftar final:

BENAR:
- ...

PARSIAL:
- ...

SALAH:
- ...

BELUM TERBUKTI:
- ...

8. KESIMPULAN TEGAS
Harus ada kalimat tegas seperti:
- “Claim developer tidak sepenuhnya benar”
atau
- “Claim developer sebagian benar, tetapi beberapa area penting belum terbukti terhubung”
atau
- “Claim developer mayoritas valid secara wiring”
Pilih sesuai hasil audit, jangan diplomatis.

LARANGAN KERAS:
- jangan refactor
- jangan kasih patch
- jangan kasih pseudo-fix
- jangan menyimpulkan “sudah kuat” kalau ada mismatch method / dead wiring / path tidak terbukti
- jangan pakai kalimat marketing
- jangan menyamakan ‘module exists’ dengan ‘runtime works’
- jangan menilai dari niat desain; nilai dari code yang benar-benar tersambung

TITIK KRITIS YANG HARUS DIVERIFIKASI SECARA KHUSUS:
Saya curiga ada klaim execution/recovery yang dioverclaim.
Verifikasi dengan keras apakah ada pemanggilan method di runtime utama yang implementasinya tidak ada atau tidak match, terutama di hubungan:
- src/app.ts
- src/domain/trading/executionEngine.ts

Kalau ada mismatch seperti method dipanggil tapi tidak ditemukan, itu wajib ditulis eksplisit dan dijadikan bukti bahwa claim terkait belum valid.

Saya tidak mau refactor.
Saya hanya mau AUDIT JUJUR PER-FILE, PER-WIRING, dan CHECKLIST FINAL mana yang benar-benar berfungsi dan mana yang belum.
