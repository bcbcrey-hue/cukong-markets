
---
# ROADMAP VERIFICATION UPGRADE — CUKONG-MARKETS

> Dokumen ini adalah roadmap **verifikasi lanjutan** setelah roadmap logic upgrade A–F selesai di level source/probe/build dan Batch F menutup proof wiring + strict shadow-live proof.
>
> Repository source of truth:
> `https://github.com/masreykangtrade-oss/cukong-markets`

---

## 1. STATUS AKTUAL REPO YANG HARUS DIPEGANG

Roadmap logic upgrade A–F **sudah tertutup** untuk scope berikut:

* wiring source aktual,
* probe resmi repo,
* build/typecheck/verify path,
* runtime contract artifact,
* strict VPS shadow-live proof Batch F.

Artinya, repo saat ini **bukan** berada pada kondisi “Batch B/C/F belum ada”.

Yang sudah ada dan hidup di repo:

* **Batch B** prediction layer sudah masuk ke runtime dan policy sebagai context tambahan.
* **Batch C** capital/portfolio layer sudah masuk ke runtime auto-entry.
* **Batch F** validation sudah membuktikan policy final hidup, dan strict shadow-live terbaru sudah punya bukti PASS pada runtime VPS.

Tetapi masih ada **gap verifikasi lanjutan** yang belum tertutup penuh:

1. belum ada **backtest kuantitatif horizon panjang** khusus untuk memvalidasi prediction Batch B,
2. belum ada **shadow-live khusus kalibrasi prediction Batch B**,
3. belum ada **shadow-live / market-real validation khusus exposure & capital behavior Batch C**,
4. belum ada **suite verifikasi exchange E2E lanjutan** yang lebih lengkap untuk operational proof.

---

## 2. TUJUAN DOKUMEN INI

Dokumen ini **bukan** untuk membangun ulang brain baru.

Dokumen ini dibuat untuk:

* memperdalam pembuktian terhadap layer yang **sudah hidup** di repo,
* mengubah status dari:

  * **source/probe-ready**
    menjadi
  * **quantitatively and operationally better-validated**,
* tanpa mengulang roadmap A–F,
* tanpa memalsukan klaim “belum ada sama sekali” pada hal yang sebenarnya sudah terimplementasi.

---

## 3. PRINSIP WAJIB

1. Source code repo aktual tetap sumber kebenaran utama.
2. Roadmap ini adalah **lanjutan setelah A–F**, bukan pengganti A–F.
3. Jangan menulis status “BELUM ADA” untuk komponen yang sebenarnya sudah hidup di repo.
4. Bedakan tegas:

   * implementasi source/runtime yang sudah ada,
   * pembuktian verifikasi lanjutan yang belum ada.
5. Jangan overclaim “ready for live trading” hanya karena roadmap ini tertulis.
6. Semua fase harus menghasilkan bukti nyata:

   * artifact,
   * report,
   * probe/test,
   * dan status yang jujur.

---

## 4. DEFINISI GAP YANG MEMANG BELUM TERTUTUP

### 4.1 Gap Batch B — Quantitative Validation

Yang belum ada saat ini:

* backtest kuantitatif horizon panjang,
* metrik akurasi prediksi lintas dataset/regime/pair class,
* calibration report historis untuk confidence prediction.

### 4.2 Gap Batch B — Shadow-Live Calibration

Yang belum ada saat ini:

* tracking khusus prediction vs actual outcome per horizon,
* calibration drift monitoring khusus prediction Batch B,
* rekomendasi penyesuaian threshold/confidence berbasis hasil shadow-live prediction.

### 4.3 Gap Batch C — Market-Real Capital Validation

Yang belum ada saat ini:

* pembuktian market-real untuk exposure cap,
* pembuktian market-real untuk allocated notional behavior,
* pembuktian khusus bahwa capital layer tetap aman pada kondisi market nyata.

### 4.4 Gap Exchange/Operational Proof Lanjutan

Yang belum ada saat ini:

* suite verifikasi exchange E2E yang lebih lengkap,
* reconciliation & resilience suite yang dedicated,
* operational readiness evidence yang lebih sistematis.

---

## 5. STRUKTUR ROADMAP BARU YANG BENAR

Roadmap verifikasi ini dibagi menjadi 3 fase:

### Fase 1 — Quantitative Validation for Existing Prediction Layer

Fokus:

* validasi kuantitatif prediction Batch B secara historis.

### Fase 2 — Shadow-Live Calibration for Prediction Layer

Fokus:

* kalibrasi prediction Batch B di market real tanpa trading live destruktif.

### Fase 3 — Market-Real Validation for Capital and Exchange Operations

Fokus:

* validasi lebih dalam untuk Batch C dan exchange/ops behavior di lingkungan real.

---

## 6. FASE 1 — QUANTITATIVE VALIDATION FOR EXISTING PREDICTION LAYER

### 6.1 Tujuan

Membuktikan secara historis bahwa prediction layer Batch B:

* punya akurasi yang terukur,
* punya calibration yang bisa dibaca,
* dan punya batas kepercayaan yang jelas.

### 6.2 Status source yang harus diakui

* Prediction layer **sudah hidup** di repo.
* Backtest engine **sudah ada** di repo.
* Yang belum ada adalah **ekstensi kuantitatif khusus untuk validasi Batch B**.

### 6.3 Arah implementasi

Roadmap ini **tidak** membuat `BacktestEngine` dari nol.

Yang dilakukan adalah:

* memperluas engine/backtest tooling yang sudah ada,
* menambahkan dataset runner yang lebih cocok untuk prediction validation,
* menambahkan metrics calculator & report generator khusus Batch B.

### 6.4 Deliverables inti

#### A. Historical Validation Runner

Tujuan:

* menjalankan prediction layer terhadap data historis yang direkonstruksi.

Output minimum:

* total prediction count,
* direction accuracy,
* confidence calibration,
* horizon error,
* regime breakdown,
* pair-class breakdown.

#### B. Metrics Calculator

Output minimum:

* overall direction accuracy,
* confidence bucket accuracy,
* calibration error,
* expected move error,
* regime-conditioned performance,
* prediction strength performance.

#### C. Validation Report

Format minimum:

* JSON,
* Markdown,
* operator summary.

Isi minimum:

* executive summary,
* calibration summary,
* failure zones,
* recommendation threshold yang konservatif.

### 6.5 Acceptance criteria

Fase 1 dianggap selesai bila sudah ada:

* runner validation historis yang benar-benar jalan,
* report kuantitatif yang bisa dibaca,
* baseline threshold/rekomendasi prediction yang diturunkan dari hasil nyata,
* probe/test yang memastikan pipeline validation tidak rusak.

### 6.6 Catatan jujur

Fase 1 **bukan** bukti siap live trading.
Fase 1 hanya menutup gap “prediction ini sudah ada, tapi belum punya validation historis yang cukup dalam”.

---

## 7. FASE 2 — SHADOW-LIVE CALIBRATION FOR PREDICTION LAYER

### 7.1 Tujuan

Menguji prediction Batch B di market real-time tanpa mengubah repo menjadi trading live destruktif.

### 7.2 Status source yang harus diakui

* strict shadow-live **sudah ada** untuk Batch F,
* strict shadow-live **bukan nol total**,
* yang belum ada adalah **shadow-live yang fokus khusus pada prediction calibration**.

### 7.3 Posisi fase ini terhadap Batch F

Fase ini **bukan pengganti** `npm run verify:shadow-live`.

Fase ini adalah **lapisan lanjutan** di atas proof Batch F, dengan fokus baru:

* catat prediction,
* tunggu outcome,
* ukur calibration,
* evaluasi drift.

### 7.4 Deliverables inti

#### A. Prediction Tracking Store

Mencatat:

* pair,
* timestamp,
* horizon,
* direction,
* confidence,
* prediction strength,
* market context,
* actual outcome.

#### B. Calibration Engine

Menghasilkan:

* calibration error,
* confidence drift,
* reliability curve,
* rekomendasi adjustment konservatif.

#### C. Shadow-Live Prediction Dashboard / Summary

Operator-facing summary minimum:

* jumlah prediction,
* resolved vs pending,
* akurasi per confidence bucket,
* drift warning,
* recommendation threshold.

### 7.5 Acceptance criteria

Fase 2 dianggap selesai bila:

* prediction tracking hidup kontinu,
* outcome resolution berjalan,
* calibration report terbentuk,
* drift bisa dideteksi,
* operator bisa melihat status prediction calibration secara jelas.

### 7.6 Catatan jujur

Fase 2 **tidak** berarti semua market-real validation selesai.
Fase 2 hanya menutup gap “prediction sudah masuk ke policy, tetapi belum punya calibration shadow-live khusus”.

---

## 8. FASE 3 — MARKET-REAL VALIDATION FOR CAPITAL AND EXCHANGE OPERATIONS

### 8.1 Tujuan

Menutup gap verifikasi market-real yang belum disentuh khusus oleh Batch F.

Fokus utamanya:

* capital/exposure behavior Batch C,
* resilience exchange operations,
* reconciliation & emergency handling.

### 8.2 Status source yang harus diakui

* Batch C sudah hidup di runtime,
* strict shadow-live proof sudah ada,
* tetapi belum ada proof khusus untuk capital/exposure behavior di market real,
* dan belum ada suite verifikasi E2E lanjutan yang terpisah dan sistematis.

### 8.3 Deliverables inti

#### A. Capital/Exposure Real Validation Suite

Tujuan:

* menguji bahwa allocator/cap tidak berperilaku liar pada market real.

Bukti minimum:

* allocated notional tetap bounded,
* exposure cap tetap dihormati,
* pair/bucket limits tetap berjalan,
* risk/policy/capital boundary tetap konsisten.

#### B. Exchange Resilience Suite

Fokus:

* auth,
* order flow,
* cancellation,
* timeout/retry,
* rate limit handling,
* reconciliation checks.

#### C. Emergency / Recovery Validation

Fokus:

* emergency exit path,
* error recovery,
* consistency checks pasca failure.

### 8.4 Acceptance criteria

Fase 3 dianggap selesai bila:

* ada evidence market-real yang cukup untuk capital behavior,
* ada evidence operasional exchange yang sistematis,
* ada checklist readiness yang grounded,
* dan semua itu terdokumentasi tanpa overclaim.

### 8.5 Catatan jujur

Fase 3 tetap **bukan jaminan mutlak** bebas risiko production.
Fase 3 hanya menaikkan level pembuktian operasional jauh di atas source/probe proof yang sekarang sudah ada.

---

## 9. FILE/AREA YANG BOLEH DISENTUH

### Fase 1

* area backtest yang **sudah ada**
* report/metrics tambahan
* runner khusus validation

### Fase 2

* tracker/store prediction shadow-live
* calibration/report/dashboard
* persistence evidence

### Fase 3

* test suite exchange/resilience/reconciliation
* report/checklist readiness
* evidence storage

### Larangan

* jangan redesign ulang A–F
* jangan memindahkan otak kembali dari policy ke execution
* jangan menulis roadmap ini seolah membangun ulang Batch B/C dari nol
* jangan menghapus batas jujur antara source proof vs market-real proof

---

## 10. STATUS TARGET PER FASE

### Setelah Fase 1

Status:

* prediction Batch B sudah punya validation historis kuantitatif.

### Setelah Fase 2

Status:

* prediction Batch B sudah punya calibration shadow-live yang bisa dibaca operator.

### Setelah Fase 3

Status:

* Batch C + exchange ops punya level bukti market-real yang lebih tinggi.

### Bukan otomatis berarti

* “pasti aman live full-auto”
* “semua risiko production hilang”
* “roadmap verifikasi selesai berarti tidak butuh observability lagi”

---

## 11. FINAL VERDICT DOKUMEN INI

Dokumen verifikasi ini **valid sebagai roadmap lanjutan** bila ditulis dengan posisi yang benar:

* **bukan** karena repo belum punya Batch B/C/F,
* tetapi karena repo **sudah punya** Batch B/C/F dan sekarang butuh **verifikasi lanjutan yang lebih dalam**.

### Rumus status yang benar

Bukan:

* “belum ada apa-apa”

Melainkan:

* “implementasi sudah ada, tetapi pembuktian kuantitatif dan operasional lanjutannya belum lengkap”

### Keputusan akhir

Roadmap verifikasi ini harus dipakai sebagai:

* **roadmap setelah A–F**,
* **roadmap untuk menutup incomplete testing yang tersisa**,
* **roadmap untuk validation uplift**,
* bukan roadmap yang memutar ulang implementasi yang sebenarnya sudah hidup.

---

## Audit koreksi singkat atas file lama

Yang **valid** dari file lama:

* struktur 3 fase,
* arah verifikasi menuju pembuktian lebih dalam,
* fokus pada backtest, shadow-live, dan exchange evidence. 

Yang **harus dikoreksi**:

* status awal “BELUM ADA” harus diganti menjadi “BELUM ADA SEBAGAI VERIFIKASI LANJUTAN KHUSUS”
* `BacktestEngine` tidak boleh ditulis sebagai file baru dari nol
* shadow-live tidak boleh ditulis seolah belum ada sama sekali
* exchange proof tidak boleh ditulis seolah nol total
* final verdict tidak boleh terdengar seperti audit status saat ini; harus diposisikan sebagai target setelah roadmap ini dikerjakan.

Kalau Anda mau, berikut langkah paling tepat setelah ini: saya bisa langsung buatkan **prompt implementasi sempit untuk merevisi file `ROADMAP_VERIFICATION_UPGRADE.md` di repo** supaya agent mengubah file itu persis ke versi sinkron ini, tanpa keluar jalur.
