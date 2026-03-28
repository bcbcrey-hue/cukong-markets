ROADMAP_VERIFICATION_UPGRADE_NORMALIZED_FOR_REPO.txt

ROADMAP NORMALISASI UNTUK REWRITE `ROADMAP_VERIFICATION_UPGRADE.md`
Repository source of truth:
https://github.com/masreykangtrade-oss/cukong-markets

TUJUAN FILE INI
- BUKAN implementasi kode.
- Ini adalah arah rewrite roadmap repo agar sinkron dengan source aktual DAN sinkron dengan dokumen lampiran operator.
- Setelah roadmap repo ditulis ulang dengan arah ini, baru implementasi per fase boleh dilanjutkan.

======================================================================
A. AUDIT KERAS SINGKAT TERHADAP SOURCE REPO AKTUAL
======================================================================

1. Repo saat ini SUDAH melewati level “source deploy ready” biasa.
   - Prediction Batch B sudah hidup.
   - Capital/portfolio Batch C sudah hidup.
   - Strict shadow-live baseline sudah hidup.
   - Backtest engine sudah ada.
   - Command validasi fase 1/2/3 sudah ada.
   - Shadow run Telegram sudah ada.

2. Karena itu, dokumen operator yang menulis beberapa area sebagai “file baru dari nol”
   TIDAK bisa dipindahkan mentah ke repo.

3. Konflik paling nyata dengan source aktual:
   - `src/domain/backtest/backtestEngine.ts` sudah ada, jadi tidak boleh lagi ditulis
     sebagai file baru dari nol.
   - Shadow run lama / strict shadow-live sudah ada, jadi Fase 2 tidak boleh ditulis
     seolah shadow-live belum ada sama sekali.
   - Repo sudah punya command:
     - validate:batch-b:phase1
     - validate:batch-b:phase2
     - validate:phase3
     - validate:phase3:shadow-proof
     - validate:phase3:market-real-check
     Maka roadmap baru harus mengakui ini sebagai baseline existing, bukan nol total.
   - Telegram sudah punya menu shadow run.
     Maka Fase 2 harus dibangun di atas itu, bukan sistem shadow baru yang terpisah total.

4. Masalah arah saat ini:
   - Implementasi validasi fase 1/2/3 yang sekarang sudah ada berguna sebagai SUPPORT LAYER,
     tetapi belum boleh diperlakukan otomatis sebagai bentuk final roadmap operator.
   - Fase 3 terutama masih cenderung berupa readiness/validation layer yang reuse evidence existing,
     bukan suite end-to-end exchange penuh seperti yang diinginkan dokumen operator.

5. Kesimpulan audit:
   - Arah implementasi verifikasi yang berjalan sekarang tidak boleh diteruskan tanpa rewrite roadmap.
   - Langkah benar pertama adalah rewrite `ROADMAP_VERIFICATION_UPGRADE.md`.
   - Setelah roadmap sinkron, implementasi per fase dilanjutkan secara bertahap.

======================================================================
B. PRINSIP NORMALISASI ROADMAP BARU
======================================================================

Roadmap repo yang baru WAJIB mengikuti prinsip ini:

1. Source code aktual tetap sumber kebenaran utama.
2. Dokumen operator menjadi target arah verifikasi, tetapi harus dinormalisasi ke source aktual.
3. Jangan tulis komponen existing sebagai “belum ada sama sekali” bila sebenarnya sudah hidup.
4. Bedakan tegas:
   - baseline source/runtime yang SUDAH ADA
   - validation uplift yang MASIH KURANG
5. Jangan membangun ulang A–F.
6. Jangan memindahkan otak kembali dari policy ke execution.
7. Jangan menulis “READY FOR LIVE TRADING” sebagai status otomatis.
   Itu hanya boleh muncul sebagai target akhir SETELAH seluruh bukti minimum benar-benar ada.
8. Setiap fase wajib punya:
   - command
   - artifact JSON
   - ringkasan operator / Markdown
   - PDF Bahasa Indonesia
   - probe/test
   - batas jujur

======================================================================
C. STRUKTUR ROADMAP BARU YANG HARUS DITULIS KE REPO
======================================================================

Roadmap repo baru harus tetap memakai 3 fase utama operator:

1. FASE 1 — BACKTEST KUANTITATIF
2. FASE 2 — SHADOW-LIVE KALIBRASI
3. FASE 3 — END-TO-END EXCHANGE EVIDENCE

Tetapi posisi tiap fase harus diubah menjadi:

- Fase 1 = perluasan kuantitatif atas backtest/prediction tooling yang SUDAH ADA.
- Fase 2 = kalibrasi prediction live di atas strict shadow-live yang SUDAH ADA.
- Fase 3 = pembuktian end-to-end exchange yang lebih keras dan operasional di atas execution/capital/
           reconciliation path yang SUDAH ADA.

======================================================================
D. RANCANGAN ISI ROADMAP REPO BARU
======================================================================

----------------------------------------------------------------------
D1. PEMBUKA ROADMAP
----------------------------------------------------------------------

Tulisan pembuka roadmap repo baru harus menegaskan:

- Repo saat ini SUDAH punya:
  - prediction layer Batch B di runtime
  - capital layer Batch C di runtime
  - strict shadow-live baseline
  - backtest engine existing
  - validation commands existing
- Tetapi repo BELUM punya pembuktian operator yang sinkron penuh dengan target:
  - backtest kuantitatif mendalam
  - shadow-live kalibrasi prediction yang benar-benar operator-facing
  - end-to-end exchange evidence yang lengkap
- Maka roadmap ini adalah:
  - VALIDATION UPLIFT / OPERATIONAL PROOF UPLIFT
  - bukan rebuild total
  - bukan reset A–F

----------------------------------------------------------------------
D2. FASE 1 — BACKTEST KUANTITATIF
----------------------------------------------------------------------

POSISI YANG BENAR
- Fase 1 bukan membuat `BacktestEngine` dari nol.
- Fase 1 adalah memperluas `BacktestEngine` existing agar benar-benar bisa dipakai untuk validasi
  prediction kuantitatif seperti yang diminta operator.

TUJUAN
- Membuktikan akurasi prediction Batch B secara historis dengan metrik yang keras dan terbaca.

BASELINE EXISTING YANG HARUS DIAKUI
- `src/domain/backtest/backtestEngine.ts` sudah ada.
- `ReplayLoader` dan `metrics` existing sudah ada.
- Runner validasi fase 1 existing boleh dipakai sebagai fondasi, bukan dianggap final.

DELIVERABLE NORMALIZED
1. Historical Data Collector
   - file baru:
     - `src/domain/backtest/historicalDataCollector.ts`
   - fungsi:
     - collect historical candles/trades
     - metadata dataset
     - sinkron ke format replay yang dipakai repo

2. Existing Backtest Engine Extension
   - SENTUH:
     - `src/domain/backtest/backtestEngine.ts`
     - `src/domain/backtest/replayLoader.ts`
     - `src/domain/backtest/metrics.ts`
   - JANGAN buat `backtestEngine.ts` baru dari nol
   - tambah jalur khusus prediction validation:
     - direction accuracy
     - confidence calibration
     - expected move error
     - regime breakdown
     - pair-class breakdown
     - strength breakdown

3. Metrics Calculator / Validation Layer
   - file baru:
     - `src/domain/backtest/metricsCalculator.ts`
   - jika lebih masuk akal, boleh memakai nama lain yang menyatu dengan source aktual,
     asalkan fungsi metrik kuantitatif operator tetap tercapai.

4. Report Generator
   - file baru:
     - `src/domain/backtest/reportGenerator.ts`
   - output wajib:
     - JSON
     - Markdown
     - PDF Bahasa Indonesia
   - HTML dashboard opsional, bukan prioritas utama

5. Runner / Command
   - file baru:
     - `scripts/run-backtest.ts`
   - command target:
     - `npm run backtest`
     - `npm run backtest:report`
   - command lama fase 1 boleh dipertahankan sebagai support path, tetapi roadmap utama
     harus mengarah ke runner yang eksplisit dan operator-friendly.

6. Probe/Test
   - file baru:
     - `tests/backtest_engine_probe.ts`

7. Retention
   - raw JSON: 7–14 hari
   - log detail: 24–48 jam
   - PDF final: permanen
   - aggregate metrics: permanen

ACCEPTANCE CRITERIA NORMALIZED
- minimal 6 bulan dataset
- minimal 5 pair aktif
- total prediction count signifikan
- ada calibration summary operator-friendly
- PDF final terbentuk
- hasil bisa diturunkan menjadi rekomendasi threshold konservatif

CATATAN JUJUR FASE 1
- Fase 1 bukan bukti siap live trading
- Fase 1 hanya membuktikan prediction historis secara kuantitatif

----------------------------------------------------------------------
D3. FASE 2 — SHADOW-LIVE KALIBRASI
----------------------------------------------------------------------

POSISI YANG BENAR
- Fase 2 bukan membuat shadow-live dari nol.
- Fase 2 adalah layer prediction-calibration di atas strict shadow-live lama yang sudah hidup.

TUJUAN
- Mengkalibrasi prediction Batch B di market real tanpa order live destruktif.

BASELINE EXISTING YANG HARUS DIAKUI
- strict shadow-live existing sudah ada
- menu Telegram shadow run existing sudah ada
- evidence shadow run existing sudah ada
- validasi batch-b phase2 existing boleh diperlakukan sebagai partial support layer,
  bukan final target operator

DELIVERABLE NORMALIZED
1. Shadow Mode Runner / Orchestration
   - jangan bangun dunia shadow baru yang terpisah total
   - jika perlu file baru:
     - `src/services/shadowModeRunner.ts`
   - file ini harus:
     - menempel ke strict shadow-live existing
     - reuse runtime/live data path existing
     - bukan runner paralel liar

2. Prediction Tracker
   - file baru:
     - `src/services/predictionTracker.ts`
   - catat:
     - pair
     - timestamp
     - direction
     - confidence
     - expectedMovePct
     - strength
     - calibrationTag
     - context market
     - actual outcome
     - status pending/resolved/expired

3. Calibration Engine
   - file baru:
     - `src/domain/calibration/calibrationEngine.ts`
   - hitung:
     - calibration error
     - confidence drift
     - reliability curve
     - recommendation adjustment

4. Shadow Mode Dashboard / Operator Summary
   - file baru:
     - `src/services/shadowModeDashboard.ts`
   - output operator:
     - jumlah prediksi
     - resolved vs pending
     - akurasi per confidence bucket
     - drift warning
     - threshold recommendation
   - dashboard ini WAJIB masuk ke Telegram, karena itu target operator dari dokumen lampiran

5. Persistence
   - file baru:
     - `src/storage/shadowModeStore.ts`
   - boleh diadaptasi ke persistenceService existing asalkan fungsinya sama:
     - prediction log per hari
     - metrics harian
     - calibration state
     - recommendations

6. Probe/Test
   - file baru:
     - `tests/shadow_mode_probe.ts`

7. Command
   - target command operator:
     - `npm run shadow:start`
     - `npm run shadow:stop`
     - `npm run shadow:status`
     - `npm run shadow:report`
   - command existing `validate:batch-b:phase2` boleh dipertahankan sebagai partial support,
     tetapi roadmap repo harus mengarah ke command shadow yang lebih operator-native.

8. Telegram Integration
   - ini WAJIB tertulis eksplisit di roadmap baru:
     - menu shadow lama dipertahankan
     - lalu diperluas untuk:
       - start shadow calibration
       - stop shadow calibration
       - lihat status
       - lihat summary/report singkat
   - jangan paksa operator selalu buka VPS untuk Fase 2

ACCEPTANCE CRITERIA NORMALIZED
- minimal 7 hari runtime kontinu
- prediction resolve rate tinggi
- calibration drift bisa terdeteksi
- operator summary tampil jelas
- PDF final Fase 2 terbentuk
- Telegram update ada

CATATAN JUJUR FASE 2
- ini bukan market-real capital validation
- ini fokus prediction calibration
- strict shadow-live lama tetap fondasi

----------------------------------------------------------------------
D4. FASE 3 — END-TO-END EXCHANGE EVIDENCE
----------------------------------------------------------------------

POSISI YANG BENAR
- Fase 3 bukan sekadar readiness report seeded.
- Fase 3 harus mendorong repo menuju bukti operasional exchange yang lebih keras.

TUJUAN
- Membuktikan bahwa jalur exchange nyata benar-benar bekerja end-to-end,
  termasuk edge cases penting.

BASELINE EXISTING YANG HARUS DIAKUI
- execution/risk/capital/reconciliation path existing sudah ada
- strict shadow-live existing sudah ada
- phase3 validation service existing boleh dipakai sebagai support layer
- tetapi itu BELUM cukup untuk target operator “end-to-end exchange evidence”

DELIVERABLE NORMALIZED
1. Exchange Test Suite
   - file baru:
     - `tests/exchange/e2eExchangeTestSuite.ts`
   - fokus:
     - connectivity
     - auth
     - balance query
     - order creation
     - order cancellation
     - orderbook query
     - trade history query
     - rate limiting
     - timeout handling
     - error recovery

2. Small Amount Live Test
   - file baru:
     - `tests/exchange/smallAmountLiveTest.ts`
   - gunakan amount kecil nyata
   - fokus pada proof order masuk/cancel/reconcile

3. Emergency Exit Test
   - file baru:
     - `tests/exchange/emergencyExitTest.ts`

4. Network Resilience Test
   - file baru:
     - `tests/exchange/networkResilienceTest.ts`

5. Reconciliation Test
   - file baru:
     - `tests/exchange/reconciliationTest.ts`

6. Readiness Checklist + Runbook
   - file baru:
     - `docs/production_readiness_checklist.md`
     - `docs/runbook.md`

7. Phase 3 Support Layer Reuse
   - service existing seperti `Phase3ValidationService` boleh dipakai
   - tetapi harus diposisikan sebagai aggregator/report layer,
     BUKAN bukti final tunggal
   - seeded/source proof, shadow-live proof, dan manual market-real proof
     harus tetap dipisah tegas

8. Command
   - target command:
     - `npm run test:e2e`
     - `npm run test:e2e:small`
     - `npm run test:e2e:emergency`
     - `npm run test:e2e:network`
     - `npm run test:e2e:reconcile`
   - command existing:
     - `validate:phase3`
     - `validate:phase3:shadow-proof`
     - `validate:phase3:market-real-check`
     tetap boleh dipertahankan sebagai support layer / report ingestion layer

9. PDF Final Fase 3
   - wajib Bahasa Indonesia
   - isi:
     - exchange API verification
     - order flow verification
     - emergency exit verification
     - network resilience verification
     - reconciliation verification
     - limitations
     - readiness verdict jujur

ACCEPTANCE CRITERIA NORMALIZED
- evidence nyata untuk:
  - API auth
  - order create/cancel
  - emergency exit
  - network resilience
  - reconciliation
- report final jujur
- checklist readiness grounded
- TIDAK overclaim otomatis “siap live full-auto”

CATATAN JUJUR FASE 3
- target akhir operator memang menuju ready for live trading
- tetapi roadmap repo harus menulis itu sebagai HASIL JIKA bukti lengkap sudah terkumpul,
  bukan status bawaan

======================================================================
E. DATA LIFECYCLE & RETENTION POLICY YANG HARUS MASUK KE ROADMAP BARU
======================================================================

Roadmap repo baru harus menulis eksplisit:

1. Semua fase wajib hasilkan:
   - JSON
   - Markdown / operator summary
   - PDF Bahasa Indonesia

2. Retention policy:
   - raw JSON: 7–14 hari
   - log detail: 24–48 jam
   - PDF draft/intermediate: 30–90 hari
   - PDF final: permanen
   - aggregate metrics: permanen

3. Cleanup:
   - otomatis untuk raw/log/draft
   - manual operator untuk PDF final
   - manual cleanup command harus ada

4. Jangan letakkan retention sebagai catatan tambahan kecil.
   Retention harus jadi layer operasional resmi roadmap.

======================================================================
F. HAL YANG HARUS DIHAPUS / DIREVISI DARI ROADMAP REPO LAMA
======================================================================

1. Hapus kalimat yang terdengar seperti roadmap saat ini sudah cukup final
   padahal arah implementasinya belum sinkron dengan target operator.

2. Hapus/ubah bagian yang menulis:
   - Batch B/C/F seolah belum ada total
   - shadow-live seolah belum ada total
   - exchange proof seolah nol total

3. Ubah semua “file baru” yang bentrok dengan source aktual menjadi:
   - “perluasan atas file existing”
   atau
   - “file baru pendamping”
   sesuai kondisi repo nyata.

4. Ubah bagian Fase 3 yang sekarang terlalu ringan bila hanya berupa
   readiness report seeded menjadi roadmap yang benar-benar menargetkan
   exchange E2E evidence.

======================================================================
G. HAL YANG TIDAK BOLEH DILAKUKAN SETELAH REWRITE ROADMAP
======================================================================

1. Jangan lanjut implementasi fase berikutnya sebelum roadmap repo selesai ditulis ulang.
2. Jangan treat phase1/phase2/phase3 existing support layer sebagai final completion otomatis.
3. Jangan redesign ulang engine policy/execution/capital dari nol.
4. Jangan memecah shadow-live menjadi sistem baru yang tidak reuse baseline lama.
5. Jangan memaksa operator mengandalkan VPS shell terus-menerus untuk semua kontrol operasional
   bila target operator sebenarnya Telegram-first.
6. Jangan tulis verdict final roadmap seolah pasti “READY FOR LIVE TRADING”
   tanpa bukti operasional minimum.

======================================================================
H. LANGKAH IMPLEMENTASI SETELAH ROADMAP DIREWRITE
======================================================================

URUTAN WAJIB:

LANGKAH 1
- Rewrite `ROADMAP_VERIFICATION_UPGRADE.md` berdasarkan file normalisasi ini.

LANGKAH 2
- Audit ulang roadmap hasil rewrite terhadap source repo.
- Pastikan tidak ada konflik file existing vs file target.

LANGKAH 3
- Implementasi Fase 1 normalized:
  - extend backtest existing
  - historical collector
  - metrics calculator
  - report generator
  - command + PDF + retention

LANGKAH 4
- Implementasi Fase 2 normalized:
  - prediction tracker
  - calibration engine
  - Telegram dashboard
  - reuse strict shadow baseline
  - command/operator flow + persistence + PDF

LANGKAH 5
- Implementasi Fase 3 normalized:
  - exchange e2e suite
  - small amount live test
  - emergency test
  - network resilience
  - reconciliation
  - readiness checklist
  - runbook
  - PDF final

======================================================================
I. VERDICT AUDIT
======================================================================

VERDICT:
- Dokumen lampiran operator VALID sebagai arah besar 3 fase.
- Tetapi dokumen lampiran HARUS dinormalisasi dulu ke source repo aktual.
- Roadmap repo saat ini HARUS direwrite dulu sebelum implementasi lanjut.
- Langkah pertama yang benar memang:
  REWRITE ROADMAP REPO DULU, BARU IMPLEMENTASI PER FASE.
