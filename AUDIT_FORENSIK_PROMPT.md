Gunakan repository source code aktual sebagai sumber kebenaran utama.

Repository:
https://github.com/masreykangtrade-oss/cukong-markets

Dokumen target cheklist/implementasi:
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/AUDIT_FORENSIK_PROMPT.md

Dokumentasi resmi WAJIB yang menjadi sumber kebenaran eksternal:
- https://github.com/btcid/indodax-official-api-docs/blob/master/INDODAX-TradeAPI-2.md
- https://github.com/btcid/indodax-official-api-docs/blob/master/Private-RestAPI.md

Dokumen referensi tambahan, BUKAN sumber kebenaran utama:
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/REFACTOR_LOG.md
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/SESSION_CONTEXT_NEXT.md
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/README.md
- https://github.com/masreykangtrade-oss/cukong-markets/blob/main/cukong-markets-blueprint.md

HIERARKI KEBENARAN WAJIB:
1. Source code repo saat ini = sumber kebenaran utama
2. Dokumentasi resmi Indodax = sumber kebenaran eksternal resmi
3. AUDIT_FORENSIK_PROMPT.md = target audit/implementasi, bukan pengganti source code runtime
4. REFACTOR_LOG.md, SESSION_CONTEXT_NEXT.md, README.md, blueprint = referensi tambahan
5. Jika dokumen bertentangan dengan source code aktual, menangkan source code
6. Jika source code bertentangan dengan dokumentasi resmi Indodax untuk endpoint API yang sedang dimigrasikan, ikuti dokumentasi resmi Indodax lalu perbaiki source code

TUJUAN UTAMA:
Lakukan audit keras source aktual lalu langsung implementasikan perbaikan nyata agar jalur execution/recovery TIDAK LAGI PARSIAL dalam konteks migrasi history/recovery Indodax.

DEFINISI TIDAK PARSIAL YANG DIMAKSUD:
- Jalur history/recovery/reconcile tidak boleh lagi hybrid legacy + V2
- Untuk history/recovery:
  - order history HARUS canonical ke GET /api/v2/order/histories
  - trade history HARUS canonical ke GET /api/v2/myTrades
- Runtime utama tidak boleh lagi fallback ke legacy orderHistory / tradeHistory
- Jangan overclaim “full migration semua private API” bila yang selesai hanya history/recovery

BATASAN WAJIB:
1. JANGAN refactor besar yang tidak perlu
2. JANGAN ubah Telegram UX/menu kecuali jika memang diperlukan untuk wiring status/config
3. JANGAN hapus method private API lain yang masih resmi dan masih didokumentasikan, seperti:
   - trade
   - openOrders
   - getOrder
   - cancelOrder
   kecuali ada bukti resmi lebih baru bahwa method itu juga harus dipindahkan
4. Fokuskan migrasi pada history/recovery/reconcile agar status parsial benar-benar hilang secara jujur
5. Jangan berhenti di audit; wajib implementasi nyata
6. Jangan buat placeholder, TODO, atau patch setengah jadi
7. Jangan minta konfirmasi lanjutan

FAKTA RESMI YANG WAJIB DIIKUTI:
- orderHistory legacy dipindah ke GET /api/v2/order/histories
- tradeHistory legacy dipindah ke GET /api/v2/myTrades
- docs resmi V2 order history mendukung parameter:
  symbol, startTime, endTime, limit, sort
- docs resmi V2 trade history mendukung parameter:
  symbol, orderId, startTime, endTime, limit, sort
- default range V2 adalah 24 jam terakhir bila startTime/endTime tidak dikirim
- maksimum range per request adalah 7 hari

MASALAH NYATA YANG HARUS DIAUDIT DAN DIPERBAIKI:
1. ExecutionEngine saat ini masih parsial karena recovery masih mempertahankan compatibility legacy + V2
2. orderHistoriesV2 harus menjadi jalur canonical untuk recovery order history
3. Jangan andalkan query default 24 jam untuk recovery
4. Karena V2 order history tidak mendukung orderId filter resmi, implementasikan pencarian yang benar:
   - symbol wajib
   - startTime/endTime windowed search
   - chunked search <= 7 hari
   - matching deterministik terhadap order target
5. myTradesV2 boleh memakai symbol + orderId sesuai docs resmi
6. Semua fallback runtime ke legacy tradeHistory / orderHistory harus dihapus dari jalur utama execution/recovery
7. Jika env history mode masih ada, pastikan default final tidak lagi hybrid

FILE YANG WAJIB DIAUDIT DAN DIPERBAIKI BILA PERLU:
- src/domain/trading/executionEngine.ts
- src/integrations/indodax/privateApi.ts
- src/config/env.ts
- src/services/healthService.ts
- README.md
- REFACTOR_LOG.md
- AUDIT_FORENSIK_PROMPT.md jika memang perlu diselaraskan
- test/probe terkait execution/recovery

HASIL IMPLEMENTASI YANG WAJIB ADA:
A. Private API wrapper
- orderHistoriesV2 mengikuti docs resmi V2 secara ketat
- myTradesV2 mengikuti docs resmi V2 secara ketat
- signing/header/query untuk V2 tetap benar
- response normalizer sesuai payload resmi V2

B. Execution / recovery
- loadTradeStats canonical ke V2
- loadOrderHistorySnapshot canonical ke V2
- fallback legacy history dihapus dari runtime path utama
- startup recovery, sync live order, callback-triggered reconcile, dan post-restart recovery tetap jalan
- partial fill, weighted average fill, fee, dan update posisi tetap benar

C. Windowed search order history V2
- jangan query hanya symbol + limit lalu berharap order lama ketemu
- gunakan pencarian berbasis waktu dari sekitar submit_time / createdAt lokal
- bila waktu tidak pasti, gunakan fallback pencarian bertahap yang bounded dan deterministic
- maksimum 7 hari per request
- hentikan pencarian saat order target ketemu
- beri logging/journal yang jelas bila order tidak ditemukan

D. Konfigurasi
- ubah default agar runtime history/recovery tidak lagi hybrid legacy+V2
- bila INDODAX_HISTORY_MODE masih dipertahankan:
  - default final harus non-parsial
  - mode legacy tidak lagi jadi jalur normal production
  - dokumentasi harus jujur menjelaskan status sebenarnya

E. Dokumentasi
- README.md dan dokumen terkait harus diperbarui secara jujur agar sinkron dengan source code terbaru.
- Source code tetap sumber kebenaran utama; dokumen hanya boleh merefleksikan kondisi source yang nyata, bukan klaim, rencana, atau asumsi.
- Jangan lagi menulis execution/recovery sebagai “implemented but partial” jika memang implementasi nyata sudah beres.
- Jika masih ada keterbatasan, tulis jujur, spesifik, dan jangan overclaim.

- Perbarui `REFACTOR_LOG.md` dan `SESSION_CONTEXT_NEXT.md` secara terarah agar:
  - sinkron dengan hasil implementasi nyata
  - mudah dipakai sebagai acuan sesi berikutnya
  - tidak berisi catatan lama yang bertabrakan dengan kondisi source terbaru

- Perbarui dan bersihkan `AUDIT_FORENSIK_PROMPT.md` hanya bila memang perlu diselaraskan dengan target/checklist yang benar; dokumen ini harus tetap dijaga sebagai target/checklist utama, bukan dump catatan sesi.
- Perbarui `cukong-markets-blueprint.md` hanya jika memang perlu, agar tetap jujur, tidak overclaim, dan tidak bertentangan dengan source code.
- Jangan menambahkan isi baru di atas isi lama yang bertabrakan; sinkronkan isi dokumen secara menyeluruh agar tetap konsisten dan mudah dipakai pada sesi berikutnya.
- Jangan mengubah dokumen hanya demi kosmetik. Semua perubahan dokumen harus faktual, relevan, dan mengikuti hasil implementasi nyata.

- Jelaskan secara eksplisit bahwa:
  - migrasi yang diselesaikan adalah history/recovery ke V2
  - method lain seperti `trade`, `openOrders`, `getOrder`, dan `cancelOrder` masih memakai jalur resmi yang masih didokumentasikan

F. Test / probe
Tambahkan atau perbaiki test/probe yang membuktikan:
- recovery order history V2 bekerja untuk order > 24 jam
- recovery order history V2 tetap bekerja untuk order > 7 hari melalui chunked lookup
- myTradesV2 + orderId dipakai benar
- startup recovery tidak lagi membutuhkan legacy orderHistory/tradeHistory
- callback reconcile tetap hidup
- compile/build/probe lulus

ATURAN EKSEKUSI:
- Audit keras source aktual dulu
- Langsung implementasikan perbaikan nyata
- Jangan berhenti di analisis
- Jangan membuat patch kosmetik
- Jika ada mismatch antara source dan docs resmi, ikuti docs resmi lalu perbaiki source
- Jika ada area yang memang belum bisa dimigrasikan penuh karena docs resmi belum menyediakan endpoint pengganti, tulis jujur dan jangan memaksa migrasi palsu

FORMAT OUTPUT YANG WAJIB:
1. Audit singkat tapi tegas: kenapa sebelumnya masih parsial
2. File apa saja yang diubah dan kenapa
3. Implementasi apa yang benar-benar diselesaikan
4. Bukti bahwa history/recovery sekarang non-parsial
5. Hal apa yang masih tetap memakai /tapi dan kenapa itu masih benar menurut docs resmi
6. Verdict final tegas, pilih satu:
   - NON-PARSIAL UNTUK HISTORY/RECOVERY DAN SIAP DIPAKAI
   - MASIH PARSIAL
