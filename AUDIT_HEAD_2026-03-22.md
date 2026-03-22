# AUDIT KETAT HEAD REPO (2026-03-22)

Repo acuan: `masreykangtrade-oss/cukong-markets` (HEAD branch kerja saat audit tanggal 2026-03-22, diverifikasi langsung dari source repo saat ini).

## 1) VERDICT GLOBAL

**BELUM SIAP LIVE**

Alasan utama:
1. Jalur verifikasi resmi (`npm run verify`) **belum green penuh** di HEAD saat audit ini karena gagal di `tests/runtime_backend_regression.ts`.
2. Bukti live yang ada masih dominan non-destruktif/read-model; belum ada proof resmi submit order live end-to-end di jalur verify default.
3. Secret akun (`apiKey`/`apiSecret`) masih tersimpan plaintext di storage runtime.

---

## 2) RINGKASAN EKSEKUTIF

### Yang kuat
- Kontrak verifikasi resmi jelas di `package.json` (`verify`, `test:probes`, `typecheck:probes`).
- Probe runner resmi terpusat (`scripts/run-probes.mjs`) dengan daftar probe eksplisit.
- Wiring lifecycle runtime jelas (bootstrap → load state → start services → polling → health heartbeat → graceful stop).
- Callback security stack cukup lengkap (host validation + signature + timestamp + nonce + replay window).

### Yang lemah
- Proof-chain belum bersih karena verify gagal pada runtime regression probe.
- Hotspot worker-path assertion di regression probe belum selaras dengan perilaku resolver pada runtime test tsx.
- Snapshot health default awal `healthy` berpotensi misleading sebelum runtime benar-benar berjalan stabil.
- `applyBuyFill()` mencampur semantics fill-price vs mark-price (menggeser `currentPrice` via `Math.max`).

### Yang belum terbukti
- Submit/cancel/fill live order end-to-end terhadap exchange nyata dalam jalur verifikasi default.
- Readiness operasional production terkait secret-at-rest hardening.

### Yang ternyata isu lama/outdated
- Dugaan blocker **typecheck** karena akses private `resolveWorkerPath`: **SUDAH TIDAK RELEVAN** sebagai blocker typecheck.
  - `typecheck:probes` lulus.
  - Akses di probe production worker terjadi via runtime JS string (`node -e`) ke artifact build, bukan akses TS compile-time langsung.

### Yang kontradiktif antar dokumen
- Pada HEAD saat audit ini, README/REFACTOR_LOG/SESSION_CONTEXT_NEXT sudah sinkron menyatakan verify belum green penuh.
- Tidak ditemukan lagi klaim aktif yang menyatakan `test:probes` lulus penuh sebagai status HEAD saat ini.

---

## 3) INVENTARIS REPO AKTUAL

### Root penting
- `README.md`, `REFACTOR_LOG.md`, `SESSION_CONTEXT_NEXT.md`, `AUDIT_HEAD_2026-03-22.md`
- `.env.example`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.probes.json`
- `src/`, `tests/`, `scripts/`, `deploy/`

### Package manager
- `npm` (`packageManager: npm@11.4.2`).

### Lockfile
- `package-lock.json` ada.

### Verify command resmi
- `npm run verify` → `npm run lint && npm run typecheck:probes && npm run test:probes`.

### test:probes command resmi
- `npm run test:probes` → `npm run build && node scripts/run-probes.mjs`.

### Daftar probe aktual (dipanggil runner)
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

### Status sinkronisasi dokumen
- `README.md`: sinkron (menyebut command resmi + status HEAD belum green penuh).
- `REFACTOR_LOG.md`: sinkron (membedakan historis vs status HEAD kini).
- `SESSION_CONTEXT_NEXT.md`: sinkron (menyebut verify belum green penuh + belum siap live).
- `tsconfig.probes.json`: mencakup `src/**/*.ts` + `tests/**/*.ts` untuk typecheck probe relevan.

---

## 4) AUDIT TEMUAN SATU PER SATU

## (1) Proof chain / auditability verification
**Status:** **TERKONFIRMASI** (masih ada gap proof-chain)

**Bukti source**
- `verify` dan `test:probes` resmi didefinisikan di `package.json`.
- Runner probe resmi hardcoded 19 probe di `scripts/run-probes.mjs`.
- `tsconfig.probes.json` meng-include `tests/**/*.ts`.
- Eksekusi `npm run verify` pada HEAD audit ini gagal di `tests/runtime_backend_regression.ts`.

**Dampak**
- Proof chain belum reproducible green penuh.
- Readiness source/probe tidak boleh di-overclaim.

**Severity:** High  
**Klasifikasi:** proof bug / documentation-proof-chain issue

---

## (2) Worker-path / private-method / regression hotspot
**Status:**
- **Blocker typecheck nyata:** **TIDAK TERKONFIRMASI**
- **False alarm typecheck:** **TERKONFIRMASI**
- **Hotspot runtime assertion/auditability:** **TERKONFIRMASI**

**Bukti source**
- `resolveWorkerPath` memang `private` pada `WorkerPoolService`.
- `worker_production_runtime_probe` memanggil method melalui string JS pada artifact build (`dist/...`) via `node -e`.
- `runtime_backend_regression` mengakses method private lewat cast `as unknown as ...` dan assert path harus `dist/workers/...`.
- `typecheck:probes` lulus, tetapi `verify` gagal pada assertion runtime regression ini.

**Dampak**
- Bukan blocker compile/typecheck.
- Tetap menjadi blocker chain verify karena runtime assertion gagal.

**Severity:** High  
**Klasifikasi:** runtime/wiring hotspot + proof-chain blocker

---

## (3) Health default / observability awal
**Status:** **TERKONFIRMASI**

**Bukti source**
- `createDefaultHealth()` default `status: 'healthy'` saat fallback persistence.
- Health runtime baru dibangun ulang via `health.build()` di heartbeat/start/stop flow.

**Dampak**
- Snapshot awal berpotensi misleading bila diinterpretasi sebagai readiness final sebelum heartbeat/build berjalan.

**Severity:** Medium  
**Klasifikasi:** observability issue (source behavior)

---

## (4) Position mark/currentPrice/unrealizedPnL
**Status:** **TERKONFIRMASI**

**Bukti source**
- `applyBuyFill()` set `currentPrice: Math.max(current.currentPrice, input.entryPrice)`.
- `unrealizedPnl` dalam jalur ini tetap berbasis `current.currentPrice`.
- `updateMark()` kemudian overwrite `currentPrice` dari mark market aktual.
- `closePartial()` mengubah `currentPrice` ke `exitPrice` dan update realized/unrealized sesuai close flow.

**Dampak**
- Buy fill tambahan bisa menggeser `currentPrice` secara artifisial sebelum cycle `updateMark()` berikutnya.
- Potensi efek sementara ke report/risk/decision yang membaca `currentPrice` saat jeda antar mark update.

**Severity:** High  
**Klasifikasi:** correctness trading issue (source behavior)

---

## (5) Secret handling / runtime storage
**Status:** **TERKONFIRMASI**

**Bukti source**
- `AccountStore` menulis `apiKey`/`apiSecret` langsung ke `env.accountsFile`.
- Path storage account berada di `DATA_DIR/accounts/accounts.json` melalui konfigurasi env.
- Upload akun legacy via Telegram masuk ke `saveLegacyUpload()` lalu dipersist tanpa enkripsi-at-rest.

**Dampak**
- Risiko exposure secret bila kontrol host/filesystem lemah.

**Severity:** Critical  
**Klasifikasi:** security-operational blocker (bukan compile/runtime crash blocker)

---

## (6) Live-readiness evidence
**Status:** **MASIH PERLU PEMBUKTIAN LANGSUNG**

**Bukti source**
- `real_exchange_shadow_run_probe` default SKIP jika `RUN_REAL_EXCHANGE_SHADOW` tidak diaktifkan.
- Probe ini tidak berada di daftar `scripts/run-probes.mjs` (bukan bagian default `npm run verify`).
- Evidence live yang ada berfokus ke check non-destruktif (public market/private auth/reconciliation read model), bukan proof submit live order E2E pada default chain.

**Dampak**
- Tidak cukup untuk klaim live-ready end-to-end.

**Severity:** High  
**Klasifikasi:** live-readiness proof gap / overclaim risk

---

## (7) Reproducibility install / verify
**Status:** **TERKONFIRMASI (concern lama sebagian SUDAH TIDAK RELEVAN)**

**Bukti source**
- Package manager dan lockfile jelas (`npm` + `package-lock.json` + `install:immutable: npm ci`).
- Path install/verify yang didokumentasikan sudah sinkron dengan `package.json`.

**Penilaian**
- Concern lama “jalur install/verify tidak jelas” **SUDAH TIDAK RELEVAN** di HEAD sekarang.
- Concern saat ini bergeser ke runtime regression assertion yang membuat verify belum hijau.

**Severity:** Medium  
**Klasifikasi:** proof-chain runtime failure (bukan install-contract failure)

---

## 5) AUDIT WIRING AREA INTI

## A. Bootstrap / app lifecycle
- **Hidup:** startup phase orchestration + shutdown lifecycle.
- **Yang hanya terlihat bagus tapi bukti lemah:** tidak dominan di area ini.
- **Sudah cukup:** alur load/start/stop konsisten.
- **Masih perlu perbaikan:** none major di wiring; isu utama ada di health default semantics.
- **Tidak perlu dibongkar ulang:** struktur createApp/start/stop.

## B. Persistence / state / health
- **Hidup:** store state/settings/health/orders/positions/trades + append evidence.
- **Sudah cukup:** persistence wiring stabil.
- **Perlu perbaikan:** default health `healthy` sebelum real heartbeat.

## C. Telegram runtime
- **Hidup:** start/stop bot, control hooks, upload handler.
- **Sudah cukup:** wiring command/menu/control.
- **Perlu perbaikan:** dampak security storage secret berasal dari alur upload+persist.

## D. Callback server / security
- **Hidup:** callback endpoint + security validation + health endpoint callback.
- **Sudah cukup:** baseline security callback bagus.
- **Perlu perbaikan:** bukan blocker utama saat ini.

## E. Worker pool
- **Hidup:** queue, timeout, worker spawn js/tsx, feature/pattern/backtest.
- **Perlu perbaikan:** kontrak assertion regression vs resolver behavior di runtime test.

## F. Order / execution / position / risk
- **Hidup:** flow buy/sell/sync/recovery/reconcile/summary.
- **Perlu perbaikan:** mark semantics di `applyBuyFill` agar tidak distort sementara.

## G. Market watcher / polling
- **Hidup:** snapshot/score/opportunity/hotlist/update mark/heartbeat.
- **Sudah cukup:** wiring polling aktif dan terhubung.

## H. Env contract
- **Hidup:** parser+validation env termasuk callback path stability.
- **Sudah cukup:** contract env jelas.

## I. Runtime probe infrastructure
- **Hidup:** runner probe resmi + isolasi env sementara per probe.
- **Perlu perbaikan:** satu probe regression menghentikan chain verify; shadow-live belum bagian default chain.

---

## 6) CHECKLIST PERBAIKAN RAPI

1. **ID:** CF-01  
   **Prioritas:** P0  
   **File/area:** `tests/runtime_backend_regression.ts`, `src/services/workerPoolService.ts`, kontrak probe worker path  
   **Masalah:** verify chain gagal pada assertion path worker.  
   **Dampak:** proof-chain resmi belum green/reproducible.  
   **Aksi perbaikan:** selaraskan kontrak assertion probe dengan konteks runtime pengujian (tsx vs dist artifact) secara deterministik.  
   **Cara verifikasi:** `npm run verify` harus lewat seluruh probe.

2. **ID:** CF-02  
   **Prioritas:** P0  
   **File/area:** `src/domain/accounts/accountStore.ts`, storage accounts runtime  
   **Masalah:** `apiKey`/`apiSecret` plaintext at-rest.  
   **Dampak:** risiko kompromi secret operasional.  
   **Aksi perbaikan:** terapkan secret-at-rest hardening (encrypt-at-rest / external secret manager / file permission enforcement teruji).  
   **Cara verifikasi:** inspeksi file runtime + uji recovery akun tanpa plaintext leakage.

3. **ID:** CF-03  
   **Prioritas:** P1  
   **File/area:** `src/domain/trading/positionManager.ts`  
   **Masalah:** `applyBuyFill()` menggeser `currentPrice` artifisial via `Math.max`.  
   **Dampak:** potensi distorsi sementara mark/UPnL/report/risk.  
   **Aksi perbaikan:** pisahkan tegas mark market vs fill/reference price; jaga `currentPrice` tetap semantic mark.  
   **Cara verifikasi:** tambah probe posisi multi-buy lalu validasi perubahan mark hanya dari `updateMark()`.

4. **ID:** CF-04  
   **Prioritas:** P1  
   **File/area:** `src/services/persistenceService.ts`, `src/services/healthService.ts`  
   **Masalah:** default health awal `healthy` berpotensi misleading.  
   **Dampak:** false-positive observability di fase awal.  
   **Aksi perbaikan:** default non-ready (`degraded`/`starting`) sampai heartbeat/build pertama sukses.  
   **Cara verifikasi:** probe startup health awal + transisi status.

5. **ID:** CF-05  
   **Prioritas:** P2  
   **File/area:** stage live verification docs/probes  
   **Masalah:** live proof default chain belum membuktikan submit E2E nyata.  
   **Dampak:** tidak bisa klaim live-ready end-to-end.  
   **Aksi perbaikan:** definisikan stage live-proof terpisah (gated), arsip evidence deterministik.  
   **Cara verifikasi:** jalankan stage live-proof dengan env gate dan bukti hasil yang bisa diaudit ulang.

---

## 7) URUTAN EKSEKUSI PALING MASUK AKAL

### Tahap 1
- CF-01 (pulihkan verify chain resmi sampai green).
- CF-02 (tutup celah plaintext secret).

### Tahap 2
- CF-03 (benahi correctness mark/price semantics posisi).
- CF-04 (benahi observability health awal).

### Tahap 3
- CF-05 (lengkapi live-proof chain bertahap untuk readiness nyata).

---

## 8) KLASIFIKASI ISU (tegas)

- **compile/typecheck issue:** tidak ada blocker compile utama pada HEAD audit ini (`typecheck:probes` lulus).
- **runtime/wiring issue:** ada (verify fail di regression probe worker-path).
- **correctness trading issue:** ada (`applyBuyFill` mark semantics).
- **observability issue:** ada (default health awal `healthy`).
- **security-operational issue:** ada kritikal (secret plaintext at-rest).
- **documentation/proof-chain issue:** saat ini dokumen status utama sudah sinkron, tetapi proof-chain masih gagal karena probe runtime.
- **live-readiness proof gap:** ada (belum ada proof submit live E2E pada jalur verifikasi default).
