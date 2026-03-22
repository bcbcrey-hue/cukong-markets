# AUDIT KETAT HEAD REPO (2026-03-22)

Repo acuan: `masreykangtrade-oss/cukong-markets` (HEAD lokal saat audit: `c07ddd8`, branch `work`).

## 1) VERDICT GLOBAL

**BELUM SIAP LIVE**

Alasan utama:
1. Jalur verifikasi resmi `npm run verify` **gagal di HEAD saat ini** pada probe runtime backend regression, jadi proof-chain internal belum stabil/reproducible penuh.
2. Bukti runtime live yang ada masih dominan **non-destruktif/read-model** (`shadow run`, auth, openOrders/history), bukan bukti submit order live end-to-end di exchange nyata.
3. Secret account (`apiKey/apiSecret`) masih tersimpan plaintext di file data runtime.

---

## 2) RINGKASAN EKSEKUTIF

### Yang kuat
- Kontrak env cukup ketat: route callback dipaksa tetap `/indodax/callback`, validasi production callback auth cukup tegas.
- Callback server punya verifikasi host/signature/timestamp/nonce + replay window.
- Runtime punya lifecycle jelas: bootstrap → load state → start server/callback/telegram/polling + heartbeat health.
- Probe suite cukup luas (HTTP, callback security, worker timeout, uncertain submission, history v2, dll).

### Yang lemah
- Chain verifikasi resmi tidak konsisten dengan kondisi aktual HEAD: `npm run verify` fail.
- Dokumen status/progres menyatakan `test:probes` lulus, tetapi pada HEAD audit ini tidak lulus.
- Health default awal langsung `status: healthy` sebelum runtime real terbangun penuh.
- Perhitungan posisi saat additional BUY mengubah `currentPrice` dengan `Math.max(...)`, berpotensi menggeser mark/reference tidak sesuai market mark real.

### Yang belum terbukti
- Belum ada bukti submit order live ke exchange nyata yang benar-benar dieksekusi end-to-end dalam jalur verifikasi resmi.
- Probe `real_exchange_shadow_run_probe` tidak termasuk runner resmi `npm run verify`.

### Yang ternyata isu lama/outdated
- Klaim bahwa `worker_production_runtime_probe` gagal typecheck karena akses private member `resolveWorkerPath`: **SUDAH TIDAK RELEVAN** sebagai isu typecheck murni.
  - Probe itu memanggil method lewat string JS `node -e` terhadap artifact `dist`, bukan akses TS langsung.
  - Typecheck probes di HEAD lulus.

---

## 3) INVENTARIS REPO AKTUAL

### Root penting
- `README.md`, `.env.example`, `package.json`, `package-lock.json`
- `src/`, `tests/`, `scripts/`, `deploy/`
- `tsconfig.json`, `tsconfig.probes.json`
- dokumen progres: `REFACTOR_LOG.md`, `SESSION_CONTEXT_NEXT.md`

### Package manager aktual
- `npm` (dengan deklarasi `packageManager: npm@11.4.2`).

### Lockfile aktual
- `package-lock.json` ada.

### Verify command resmi
- `npm run verify` => `lint` + `typecheck:probes` + `test:probes`.

### Probe runner resmi
- `scripts/run-probes.mjs`.

### Daftar probe yang benar-benar dipanggil runner
1. `tests/private_api_v2_mapping_probe.ts`
2. `tests/nginx_renderer_probe.ts`
3. `tests/http_servers_probe.ts`
4. `tests/telegram_menu_navigation_probe.ts`
5. `tests/telegram_slippage_confirmation_probe.ts`
6. `tests/runtime_backend_regression.ts`
7. `tests/live_execution_hardening_probe.ts`
8. `tests/execution_summary_failed_probe.ts`
9. `tests/buy_entry_price_guard_probe.ts`
10. `tests/live_submission_uncertain_probe.ts`
11. `tests/cancel_submission_uncertain_probe.ts`
12. `tests/submission_uncertain_unresolved_probe.ts`
13. `tests/indodax_history_v2_probe.ts`
14. `tests/app_lifecycle_servers_probe.ts`
15. `tests/bootstrap_observability_probe.ts`
16. `tests/callback_reconciliation_probe.ts`
17. `tests/callback_security_probe.ts`
18. `tests/worker_timeout_probe.ts`
19. `tests/worker_production_runtime_probe.ts`

### Sinkronisasi README vs source aktual
- README menyebut `npm run verify` menjalankan semua probe runtime dan memberi narasi bukti readiness source/probe.
- Namun pada HEAD audit ini, `npm run verify` aktual **gagal** di `runtime_backend_regression` (assert worker path).
- Jadi narasi dokumen tidak sepenuhnya sinkron dengan status runtime aktual HEAD.

---

## 4) AUDIT TEMUAN SATU PER SATU

## (1) Proof chain / auditability verification
**Status: TERKONFIRMASI (ada gap)**

**Bukti source**
- `README` mendefinisikan jalur verifikasi resmi via `npm run verify`.
- `package.json` memang memetakan `verify` → `lint` + `typecheck:probes` + `test:probes`.
- `scripts/run-probes.mjs` memanggil 19 probe secara hardcoded.
- `tests/real_exchange_shadow_run_probe.ts` tersedia, tetapi tidak masuk `run-probes.mjs` (hanya dijalankan via script terpisah `verify:shadow-live`).
- Hasil eksekusi audit: `npm run verify` fail di `tests/runtime_backend_regression.ts`.

**Dampak**
- Proof-chain tidak bersih: command resmi tidak green di HEAD, sehingga reproducibility CI/local terganggu.
- Narasi readiness pada dokumen progres berpotensi misleading.

**Severity**
- **High** (documentation/proof-chain + live-readiness proof gap).

---

## (2) Worker production runtime probe vs private member
**Status: TERKONFIRMASI sebagai false alarm typecheck; TERKONFIRMASI ada isu lain di regression probe**

**Bukti source**
- `resolveWorkerPath` dideklarasi `private` di `WorkerPoolService`.
- `tests/worker_production_runtime_probe.ts` memanggilnya di string JS `node -e` dari artifact `dist/services/workerPoolService.js`; ini bukan akses TS compile-time langsung.
- `npm run typecheck:probes` lulus.
- `tests/runtime_backend_regression.ts` memanggil private method via cast unsafe, lalu meng-assert path harus `dist/workers/...` dan saat verify di HEAD assertion ini fail.

**Verdict tegas**
- **Blocker typecheck:** **TIDAK TERKONFIRMASI**.
- **Blocker runtime proof-chain:** **TERKONFIRMASI** (karena probe resmi fail).

**Dampak**
- Masalah utama bukan private-member compile access, melainkan ekspektasi path worker di runtime test yang tidak match kondisi aktual saat probe berjalan via tsx.

**Severity**
- **High** (runtime/wiring + verification stability).

---

## (3) Health default / observability awal
**Status: TERKONFIRMASI**

**Bukti source**
- `createDefaultHealth()` default `status: 'healthy'`, `runtimeStatus: 'IDLE'`, `scannerRunning=false`, `telegramRunning=false`.
- `HealthService` memulai state dari default tersebut, lalu `build()` baru menghitung status real (`healthy/degraded/down`) berdasarkan runtime/telegram/scanner.
- Endpoint `/healthz` langsung mengekspos snapshot health saat itu.

**Dampak**
- Snapshot awal dapat misleading (healthy sebelum startup komponen vital benar-benar up), terutama bagi operator yang membaca state awal sebelum heartbeat/build berjalan.

**Severity**
- **Medium** (observability issue).

---

## (4) Position mark/currentPrice/unrealizedPnL
**Status: TERKONFIRMASI**

**Bukti source**
- `applyBuyFill()` saat add BUY ke posisi existing:
  - `currentPrice: Math.max(current.currentPrice, input.entryPrice)`
  - `unrealizedPnl` dihitung menggunakan `current.currentPrice`, bukan mark terbaru yang dijamin konsisten.
- `updateMark()` kemudian overwrite `currentPrice` pakai mark market aktual.
- `closePartial()` set `currentPrice = exitPrice` dan hitung realized/unrealized berdasar `averageEntryPrice` + fee share.

**Analisis**
- Tambahan BUY pada harga lebih tinggi bisa mengangkat `currentPrice` artifisial sebelum ada mark update market berikutnya.
- Ini bisa memengaruhi report/telegram/risk check sementara, karena field mark tercampur antara harga fill dan harga market.

**Dampak**
- Risiko salah baca posisi secara sementara (UPnL/mark) di report dan engine evaluasi jika interval mark update lambat.

**Severity**
- **High** (correctness trading issue).

---

## (5) Secret handling / runtime storage
**Status: TERKONFIRMASI**

**Bukti source**
- `AccountStore` menyimpan `apiKey`/`apiSecret` ke `env.accountsFile` (`data/accounts/accounts.json`) sebagai properti string biasa.
- Upload Telegram JSON masuk ke `saveLegacyUpload()` lalu persist tanpa enkripsi-at-rest.
- Logger memang redact field sensitif saat logging, tetapi itu tidak mengubah storage plaintext di disk.

**Dampak**
- Secret exposure risk jika host/volume backup/file permission tidak keras.

**Klasifikasi**
- Bukan compile blocker.
- Bukan runtime crash blocker langsung.
- **Security-operational blocker** untuk live production maturity.

**Severity**
- **Critical** (security-operational).

---

## (6) Live-readiness evidence
**Status: TERKONFIRMASI (masih proof gap)**

**Bukti source**
- `runLiveShadowRun()` melakukan check public market, private auth (`getInfo`), dan reconciliation read model (`openOrders` + histories).
- `tests/real_exchange_shadow_run_probe.ts` default SKIP kecuali `RUN_REAL_EXCHANGE_SHADOW=1`.
- Probe tersebut tidak ada di `run-probes.mjs`, sehingga tidak masuk `npm run verify`.
- `runtime_backend_regression` dan `live_execution_hardening_probe` memakai fake/stub live API, bukan exchange nyata.

**Dampak**
- Bukti readiness masih sebatas non-destruktif verification/read model.
- Belum ada proof resmi bahwa live order submit/cancel/fill end-to-end berjalan di exchange real dalam jalur verifikasi default.

**Severity**
- **High** (live-readiness proof gap).

---

## 5) AUDIT WIRING AREA INTI

## A. Bootstrap / app lifecycle
- **Hidup**: bootstrap phase logging, create/start lifecycle, shutdown handler.
- **Cukup**: error wrapping phase startup sudah baik.
- **Perlu perbaikan**: health awal misleading (lihat temuan #3).

## B. Persistence / state / health
- **Hidup**: JSON store + jsonl evidence/journal + health/state persisted.
- **Cukup**: struktur persistence cukup rapi.
- **Lemah**: default health status awal `healthy` berisiko false-positive awal.

## C. Telegram runtime
- **Hidup**: start/stop signal, handlers terpasang, upload flow jalan.
- **Lemah**: upload akun menyimpan secret plaintext (isu security bukan wiring crash).

## D. Callback server / security
- **Hidup**: host check, signature HMAC, timestamp, nonce replay protection, health endpoint callback.
- **Cukup**: kontrol keamanan request callback relatif baik untuk baseline.

## E. Worker pool
- **Hidup**: worker types feature/pattern/backtest, enqueue/timeout/respawn/fail current job.
- **Lemah**: ekspektasi test runtime regression vs pemilihan path worker belum konsisten di HEAD.

## F. Order / execution / position / risk
- **Hidup**: flow buy/sell, uncertain submission path, sync/recovery, summary/journal.
- **Lemah**: representasi mark di `applyBuyFill` berpotensi distort sementara.

## G. Market watcher / polling
- **Hidup**: batch snapshot, scoring/opportunity/hotlist, periodic mark update.
- **Lemah**: jika interval polling longgar, distorsi sementara mark dari buy fill jadi lebih terasa.

## H. Env contract
- **Hidup**: validasi env runtime cukup ketat untuk prod routing/callback auth.
- **Cukup**: `.env.example` relatif sinkron dengan env parser.

## I. Runtime probe infrastructure
- **Hidup**: runner probe terpusat + daftar probe cukup luas.
- **Lemah**:
  - verify resmi saat ini fail.
  - shadow-live probe tidak masuk chain resmi default.

---

## 6) CHECKLIST PERBAIKAN RAPI

1. **ID**: CF-01  
   **Prioritas**: P0  
   **File/area**: `tests/runtime_backend_regression.ts`, `src/services/workerPoolService.ts`, `scripts/run-probes.mjs`  
   **Masalah**: probe resmi fail karena ekspektasi path worker tidak match runtime aktual.  
   **Dampak**: verify resmi tidak reproducible green.  
   **Aksi**: samakan kontrak ekspektasi probe vs strategi resolver worker (dev tsx vs dist build), lalu stabilkan assertion.  
   **Verifikasi**: `npm run verify` harus green end-to-end.

2. **ID**: CF-02  
   **Prioritas**: P0  
   **File/area**: `src/domain/accounts/accountStore.ts`, alur upload Telegram/accounts storage  
   **Masalah**: API secret plaintext di disk.  
   **Dampak**: risiko kompromi credential produksi.  
   **Aksi**: tambahkan mekanisme secret management (encrypt-at-rest / external secret provider / minimal filesystem hardening + permission enforcement yang tervalidasi).  
   **Verifikasi**: audit file storage + uji baca/tulis account + bukti secret tidak tersimpan plaintext.

3. **ID**: CF-03  
   **Prioritas**: P1  
   **File/area**: `src/domain/trading/positionManager.ts`  
   **Masalah**: `applyBuyFill()` mengubah `currentPrice` via `Math.max`, bukan mark aktual.  
   **Dampak**: distorsi sementara mark/UPnL/report/risk.
   **Aksi**: pisahkan tegas “last fill price” vs “market mark price”; jangan gunakan fill BUY untuk overwrite mark operasional.  
   **Verifikasi**: tambah probe posisi untuk additional BUY lalu cek mark/UPnL hanya berubah lewat `updateMark()` atau sumber mark resmi.

4. **ID**: CF-04  
   **Prioritas**: P1  
   **File/area**: `src/services/persistenceService.ts`, `src/services/healthService.ts`  
   **Masalah**: default health awal `healthy` berpotensi misleading.  
   **Dampak**: operator bisa salah baca kondisi startup awal.  
   **Aksi**: ubah default awal menjadi `degraded`/`starting-like` (atau status yang jelas non-ready) sampai heartbeat build pertama sukses.  
   **Verifikasi**: probe startup health awal memastikan status tidak false-healthy.

5. **ID**: CF-05  
   **Prioritas**: P1  
   **File/area**: `README.md`, `REFACTOR_LOG.md`, `SESSION_CONTEXT_NEXT.md`  
   **Masalah**: narasi dokumen tidak sinkron dengan hasil verify HEAD saat ini.  
   **Dampak**: proof-chain auditability membingungkan.  
   **Aksi**: sinkronkan klaim status dengan hasil command aktual; bedakan “historical pass” vs “HEAD pass saat ini”.  
   **Verifikasi**: reviewer dapat menjalankan command dari README dan memperoleh hasil sesuai klaim dokumen.

6. **ID**: CF-06  
   **Prioritas**: P2  
   **File/area**: proof live readiness (`tests/real_exchange_shadow_run_probe.ts`, script verify terkait)  
   **Masalah**: live evidence belum masuk jalur verify default; scope masih non-destruktif read model.  
   **Dampak**: klaim readiness live tidak punya proof-chain default yang kuat.  
   **Aksi**: definisikan stage verifikasi live terpisah yang eksplisit (gated), termasuk bukti submit/cancel/fill nyata bila kebijakan memungkinkan.  
   **Verifikasi**: jalankan stage live proof dengan env gating dan arsip evidence deterministik.

---

## 7) URUTAN EKSEKUSI PALING MASUK AKAL

### Tahap 1 (blokir paling kritikal)
- CF-01 (stabilkan verify resmi sampai green).
- CF-02 (hentikan plaintext secret untuk kesiapan operasional minimal).

### Tahap 2 (correctness & observability)
- CF-03 (perbaiki mark/currentPrice semantics).
- CF-04 (perbaiki default health agar tidak misleading).

### Tahap 3 (auditability & readiness narrative)
- CF-05 (sinkronkan dokumentasi dengan HEAD nyata).
- CF-06 (rapikan jalur bukti live readiness bertingkat).

---

## 8) KLASIFIKASI ISU (tegas)

- **compile/typecheck issue**: tidak ditemukan blocker utama saat audit (`typecheck:probes` lulus).
- **runtime/wiring issue**: ada (verify resmi fail di runtime regression worker path assertion).
- **correctness trading issue**: ada (`applyBuyFill` menggeser `currentPrice` artifisial).
- **observability issue**: ada (default health awal `healthy`).
- **security-operational issue**: ada kritikal (secret plaintext di disk).
- **documentation/proof-chain issue**: ada (klaim dokumen vs hasil verify HEAD tidak sinkron).
- **live-readiness proof gap**: ada (shadow-run/live check tidak setara bukti submit live e2e).
