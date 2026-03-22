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

`npm run verify` tetap merupakan command verifikasi resmi (`lint` + `typecheck:probes` + `build` + seluruh probe runtime via runner).

**Status HEAD saat audit 2026-03-22:**
- `npm run typecheck:probes` **lulus**.
- `npm run verify` / `npm run test:probes` **belum green penuh** karena gagal di `tests/runtime_backend_regression.ts` (assertion worker path).

Lihat detail audit di `AUDIT_HEAD_2026-03-22.md`.

## Bukti runtime worker production/build

Worker tidak hanya diuji dari `tsx` dev runtime. Probe `tests/worker_production_runtime_probe.ts` menjalankan **Node terhadap artifact build** (`dist/services/workerPoolService.js`) dari direktori kerja sementara (bukan root repo), lalu memverifikasi:

1. path worker resolve ke `dist/workers/*.js`,
2. worker dijalankan sebagai JS worker (bukan `tsx/cli`),
3. task worker benar-benar diproses sukses.

Probe ini tetap bagian dari jalur `npm run verify`, meski status chain verify HEAD saat ini belum sepenuhnya hijau.

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
- `.env.example` dan dokumentasi env sudah diselaraskan dengan kontrak env runtime yang dipakai source.

## Batas yang masih harus jujur

- **BELUM GREEN PENUH untuk scope source verification/build/probe pada HEAD audit ini** (karena verify chain masih fail di satu probe runtime).
- **BELUM TERBUKTI sebagai live trading production end-to-end.**

Lolos sebagian source/build/probe tidak otomatis berarti siap live trading nyata. Pembuktian live tetap butuh verifikasi runtime non-destruktif ke exchange nyata dan validasi operasional production (secret management, observability, incident response, dan prosedur rollback) yang benar-benar dijalankan.

## Catatan penting

- `INDODAX_HISTORY_MODE` runtime default adalah `v2_only`.
- `INDODAX_CALLBACK_PATH` dikunci ke `/indodax/callback` oleh validasi env.
- Guard BUY menolak harga referensi/entry/quantity yang invalid sebelum order dipersist.
