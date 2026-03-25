# Runtime VPS Verifier Contract & Target Proof (Phase 2 Batch 3)

Dokumen ini membekukan kontrak pembuktian runtime VPS yang sempit dan jujur.

## Scope batch ini

Fokus batch ini hanya untuk kontrak verifikasi runtime VPS:

1. process start
2. env/runtime target
3. probe endpoint `GET /`, `GET /healthz`, `GET /livez`
4. app bind host/port
5. callback bind host/port/allowed host
6. direktori runtime (`DATA_DIR`, `LOG_DIR`, `TEMP_DIR`)
7. startup phase log
8. target bukti Telegram connect (untuk dibuktikan nanti di VPS)
9. target bukti worker build path (untuk dibuktikan di runtime deploy)

Di luar daftar di atas **tidak** termasuk scope batch ini.

## Kontrak target canonical

Gunakan helper berikut untuk memotret target runtime dari env aktual:

```bash
npm run runtime:contract
```

Output JSON dari command ini dicetak ke stdout dan otomatis ditulis ke `test_reports/runtime_contract_batch3_current.json` sebagai artefak resmi kontrak target yang harus dipenuhi saat validasi di VPS.

Di CI (`.github/workflows/ci.yml`), command yang sama dijalankan dan artifact tersebut di-upload agar bukti kontrak runtime tidak hanya bergantung pada eksekusi lokal.

## Evidence gate yang WAJIB saat validasi VPS (batch berikutnya)

> Penting: checklist di bawah untuk validasi VPS nyata, bukan bukti dari level repo saja.

### 1) Process start

- Jalankan build dan start runtime:
  - `npm run build`
  - `npm run start`
- Bukti minimal:
  - process berjalan (tidak exit langsung)
  - startup phase log muncul berurutan sesuai kontrak

### 2) Runtime directories

- Validasi direktori dari kontrak JSON:
  - `DATA_DIR`
  - `LOG_DIR`
  - `TEMP_DIR`
- Bukti minimal:
  - direktori benar-benar ada di VPS setelah startup

### 3) App probe endpoints

- Dari host VPS yang sama:
  - `curl -i http://127.0.0.1:$APP_PORT/`
  - `curl -i http://127.0.0.1:$APP_PORT/healthz`
  - `curl -i http://127.0.0.1:$APP_PORT/livez`
- Bukti minimal:
  - response benar-benar datang dari process runtime yang aktif
  - status code selaras dengan state runtime saat pengambilan bukti

### 4) Callback server target

- Jika `INDODAX_ENABLE_CALLBACK_SERVER=true`, wajib bukti:
  - `curl -i http://127.0.0.1:$INDODAX_CALLBACK_PORT/healthz`
  - callback path sesuai `INDODAX_CALLBACK_PATH`
  - host allow-list sesuai `INDODAX_CALLBACK_ALLOWED_HOST`

### 5) Telegram runtime target

- Bukti yang dicari pada log runtime:
  - marker sukses: `telegram bot launched and connected`
- Jika gagal connect, bukti error tetap valid selama jujur dan lengkap.
- **Belum terbukti dari repo saja** apakah Telegram benar-benar connected di VPS.

### 6) Worker build path target

- Bukti yang dicari pada log/probe runtime deploy:
  - worker path mengarah ke `dist/workers/*.js`
  - bukan `tsx/cli` dev path
- Rekomendasi env runtime deploy: `CUKONG_PREFER_DIST_WORKERS=1`

## Batas kejujuran batch ini

Yang sudah bisa dipaku dari repo:

- kontrak target runtime verifier
- daftar evidence gate untuk validasi VPS nyata
- batas tegas antara "terbukti dari repo" vs "harus dibuktikan di VPS"

Yang **belum bisa dibuktikan dari repo saja**:

- Telegram live connect sukses di VPS
- bind/listen process aktual di host VPS target
- hasil probe endpoint pada instance deploy nyata
