# Cukong-Markets

Backend TypeScript untuk operasi market Indodax dengan kontrol utama via Telegram.

## Start cepat

```bash
npm ci
cp .env.example .env
npm run lint
npm run build
npm run start
```

Untuk mode development gunakan:

```bash
npm run dev
```

## Verifikasi resmi repo

```bash
npm run verify
```

`npm run verify` menjalankan lint + typecheck probe (`src/**/*.ts` + `tests/**/*.ts`) + build artifact + seluruh **official runtime probes**.

Workflow CI resmi ada di `.github/workflows/ci.yml` dan dijalankan pada `push` + `pull_request`, dengan urutan check:

- `npm ci`
- `npm run lint`
- `npm run typecheck:probes`
- `npm run build`
- `npm run probe:list`
- `npm run probe:audit`
- `npm run test:probes`
- `npm run verify`
- `npm run runtime:contract` (beserta upload artifact `test_reports/runtime_contract_batch3_current.json`)

Daftar probe official (yang benar-benar dipanggil runner) bisa dilihat via:

```bash
npm run probe:list
```

Probe official untuk kontrak ketahanan startup/state/scheduler:

Probe official untuk historical context outcome-grounded:

- `tests/history_outcome_grounding_probe.ts` (validasi `PairHistoryStore` memprioritaskan closed trade outcome `CONFIRMED_LIVE/PARTIAL_LIVE`, fallback proxy yang jujur saat data outcome live belum cukup, dan konsumsi metrik oleh `ProbabilityEngine`)

- `tests/startup_corrupted_state_probe.ts` (validasi recovery startup ketika `runtime-state.json` korup + bukti file quarantine)
- `tests/state_atomicity_probe.ts` (validasi `StateService.patch()` tidak commit state in-memory bila write persistence gagal)
- `tests/state_replace_atomicity_probe.ts` (validasi `StateService.replace()` tidak commit state in-memory bila write persistence gagal)
- `tests/scheduler_overlap_guard_probe.ts` (forced concurrent run untuk bukti overlap guard scheduler)

`tests/real_exchange_shadow_run_probe.ts` adalah probe manual live exchange dan **tidak** dijalankan oleh `npm run verify`; jalur manual resminya adalah:

```bash
npm run verify:shadow-live
```

Secara default, `verify:shadow-live` sekarang **strict**: command akan gagal jika ada `failedChecks` (contoh: akun exchange belum aktif / auth private gagal). Ini sengaja agar status go-live tidak false positive.

Jika hanya ingin mengarsipkan evidence tanpa menggagalkan command (mode audit eksploratif), gunakan:

```bash
SHADOW_RUN_ALLOW_FAILED_CHECKS=1 npm run verify:shadow-live
```

Artefak bukti eksekusi final terbaru (timestamp + command literal + exit code + stdout/stderr) disimpan di:

- `test_reports/typecheck_probes_final.txt`
- `test_reports/probe_list_final.txt`
- `test_reports/probe_audit_final.txt`
- `test_reports/test_probes_final.txt`
- `test_reports/verify_final.txt`
- ringkasan sinkronisasi akhir: `test_reports/final_verification_sync.json`

## Bukti runtime worker production/build

Worker tidak hanya diuji dari `tsx` dev runtime. Probe `tests/worker_production_runtime_probe.ts` menjalankan **Node terhadap artifact build** (`dist/services/workerPoolService.js`) dari direktori kerja sementara (bukan root repo), lalu memverifikasi:

1. path worker resolve ke `dist/workers/*.js`,
2. worker dijalankan sebagai JS worker (bukan `tsx/cli`),
3. task worker benar-benar diproses sukses.

Probe ini ikut di jalur `npm run verify`.


## Runtime verifier contract (Phase 2 Batch 3)

Untuk membekukan target proof runtime VPS, gunakan:

```bash
npm run runtime:contract
```

Command ini memakai source-of-truth env canonical dari `src/config/env.ts`, mencetak JSON kontrak target runtime ke stdout, dan otomatis menulis artefak ke `test_reports/runtime_contract_batch3_current.json` (start command, target endpoint `/`, `/healthz`, `/livez`, target callback bind/host/port/path/allowed-host/auth-mode, direktori runtime, target startup phase, target Telegram runtime marker, dan target worker build path).

Dokumen canonical checklist evidence VPS: `docs/runtime_vps_verifier_contract.md`.

## Kontrak env runtime

Gunakan `.env.example` sebagai sumber nilai awal. Variabel dibagi menjadi 3 kelompok agar tidak rancu.

### 1) Minimum lokal (wajib agar app start lokal)

- `NODE_ENV`, `APP_NAME`, `PUBLIC_BASE_URL`, `APP_PORT`, `APP_BIND_HOST`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`, `LOG_LEVEL`
- `DATA_DIR`, `LOG_DIR`, `TEMP_DIR`
- `INDODAX_CALLBACK_PATH` (harus tetap `/indodax/callback`)
- `INDODAX_ENABLE_CALLBACK_SERVER`

### 2) Wajib production / callback security

Saat `NODE_ENV=production`:

- wajib: `PUBLIC_BASE_URL`, `APP_PORT`, `APP_BIND_HOST`
- jika callback server aktif (`INDODAX_ENABLE_CALLBACK_SERVER=true`), wajib:
  - `INDODAX_CALLBACK_PORT`
  - `INDODAX_CALLBACK_BIND_HOST`
  - `INDODAX_CALLBACK_ALLOWED_HOST`
  - `INDODAX_CALLBACK_AUTH_MODE=required`
  - `INDODAX_CALLBACK_SIGNATURE_SECRET` (secret kuat, bukan default)

### 3) Tuning opsional

Semua variabel pacing, polling, risk, worker pool, scanner, serta threshold strategi (`INDODAX_*_INTERVAL_MS`, `POLLING_INTERVAL_MS`, `RISK_*`, `WORKER_*`, `BUY_*`, dll) bersifat tuning operasional sesuai kebutuhan deployment.

## Yang sudah terbukti dari source/probe

- Worker path untuk runtime production/build sudah dibuktikan lewat probe artifact build (`tests/worker_production_runtime_probe.ts`) yang mengeksekusi Node terhadap `dist`.
- Guard BUY untuk harga/reference/quantity invalid sudah dibuktikan ditolak sebelum persist lewat probe (`tests/buy_entry_price_guard_probe.ts`).
- Jalur Batch 2 scout/confirm sudah diprove di level engine melalui probe:
  - `tests/scout_enter_route_probe.ts` (route `SCOUT_ENTER`)
  - `tests/add_on_confirm_probe.ts` (route `ADD_ON_CONFIRM` + rejection saat continuation rusak)
  - `tests/add_on_confirm_account_scope_probe.ts` (add-on pair sama di akun lain tetap ditolak)
  - `tests/scout_lane_sizing_probe.ts` (size scout < size normal)
  - `tests/normal_entry_other_account_same_pair_probe.ts` (entry normal/scout tidak diblok posisi akun lain)
  - `tests/chasing_entry_rejected_probe.ts` (setup `CHASING` ditolak)
- Jalur Batch 3 runtime selector sudah diprove di level app-runtime selector:
  - prioritas lane `SCOUT_ENTER+ANOMALY` > `SCOUT_ENTER+STEALTH` > `ADD_ON_CONFIRM` > fallback umum
  - prioritas pair class `MICRO > MID > MAJOR` berlaku pada lane scout/add-on **dan** fallback umum
  - probe terkait:
    - `tests/runtime_selector_prefers_scout_anomaly_probe.ts`
    - `tests/runtime_selector_prefers_scout_stealth_probe.ts`
    - `tests/runtime_selector_prefers_add_on_after_scout_probe.ts`
    - `tests/runtime_selector_pair_priority_probe.ts`
    - `tests/runtime_selector_fallback_general_probe.ts`
    - `tests/runtime_selector_fallback_pair_priority_probe.ts`
    - `tests/runtime_selector_monitoring_continuity_probe.ts`
- Jalur Batch 4 exit scalping intelligence sudah diprove:
  - TP sekarang soft/guard rail (bukan hard auto-sell) ketika continuation + quote flow masih sehat (`tests/hold_winner_while_pump_healthy_probe.ts`).
  - Kondisi distribusi/dump risk memicu `DUMP_EXIT` (`tests/dump_exit_trigger_probe.ts`).
  - Kondisi market darurat memicu `EMERGENCY_EXIT` override (`tests/emergency_exit_override_probe.ts`).
  - Wiring runtime monitor posisi ke jalur action `SCALE_OUT`/exit dibuktikan hidup (`tests/runtime_exit_wiring_probe.ts`).
  - Metadata posisi (`pumpState`, `lastContinuationScore`, `lastDumpRisk`, `lastScaleOutAt`, `emergencyExitArmed`) dipersist dan ikut update di mark loop (`tests/position_mark_pnl_correctness_probe.ts`).
- `.env.example` dan dokumentasi env sudah diselaraskan dengan kontrak env runtime yang dipakai source.

## Batas yang masih harus jujur

- **SIAP untuk scope source verification/build/probe.**
- **BELUM TERBUKTI sebagai live trading production end-to-end.**

Lolos source/build/probe tidak otomatis berarti siap live trading nyata. Pembuktian live tetap butuh verifikasi runtime non-destruktif ke exchange nyata dan validasi operasional production (secret management, observability, incident response, dan prosedur rollback) yang benar-benar dijalankan.

## Batas pengujian yang belum tercakup penuh

- Probe repo ini membuktikan kontrak source/runtime lokal (startup bootstrap, state persistence, scheduler guard, worker path, callback security, dan alur Telegram read-model) tetapi tidak membuktikan ketahanan infrastruktur VPS jangka panjang.
- Probe Batch 2 saat ini masih fokus ke unit route `OpportunityEngine` + `RiskEngine`, belum mensimulasikan fill/add-on multi-order live exchange end-to-end.
- Probe Batch 3 runtime selector saat ini fokus pada logika pemilihan kandidat di source/probe; belum memvalidasi outcome live exchange end-to-end untuk semua kombinasi lane scout/fallback di market nyata.
- Probe Batch 4 exit intelligence sudah menutup logika exit decision + wiring monitor, tetapi belum membuktikan slippage/partial-fill real exchange pada skenario dump ekstrem.
- End-to-end live exchange tetap berada di `tests/real_exchange_shadow_run_probe.ts` (manual), sehingga hasilnya **tidak** otomatis menjadi bagian PASS `npm run verify`.
- Validasi branch protection (required status checks) tidak dapat dipaksakan dari source code saja; ini perlu setting GitHub repository.

## Catatan penting

- `INDODAX_HISTORY_MODE` runtime default adalah `v2_only`.
- `INDODAX_CALLBACK_PATH` dikunci ke `/indodax/callback` oleh validasi env.
- Guard BUY menolak harga referensi/entry/quantity yang invalid sebelum order dipersist.
- Read-model monitoring Telegram (`status`, `hotlist`, `intelligence`, `spoof`, `pattern`, dan detail signal) memakai snapshot canonical dari `StateService` (`lastHotlist` + `lastOpportunities`) agar restart tidak menampilkan mismatch cache hotlist in-memory vs state persistence.
