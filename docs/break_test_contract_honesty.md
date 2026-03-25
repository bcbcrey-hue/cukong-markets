# Break Test Contract Honesty (Bug Exposure Mode)

Dokumen ini khusus untuk mode **non-blocking break test**.
Targetnya bukan membuat CI hijau, tapi memaksa jalur gagal agar titik rapuh terlihat.

## Temuan kontrak yang rapuh

1. **Startup tidak tahan state JSON korup**
   - Kontrak ideal: startup melakukan recovery minimal/fallback agar service tetap hidup.
   - Realita saat ini: parse error di state file menghentikan bootstrap.

2. **State mutation tidak atomic terhadap persistence failure**
   - Kontrak ideal: jika `saveState` gagal, state in-memory tetap konsisten dengan data persisted.
   - Realita saat ini: state in-memory sudah berubah sebelum write berhasil, sehingga runtime dan disk dapat divergen.

## Boundary CI

- Probe break test dijalankan via `npm run test:break`.
- Jalur ini **terpisah** dari `npm run verify` agar CI hijau utama tidak tercampur test destruktif.
- Output evidence disimpan di `test_reports/break_test_latest.json`.
