# Prompt Eksekusi (Audit Ketat + Rewrite Roadmap + Implementasi Bertahap)

Gunakan repository source code aktual sebagai sumber kebenaran utama:
- Repo: https://github.com/masreykangtrade-oss/cukong-markets
- Roadmap acuan normalisasi: https://github.com/masreykangtrade-oss/cukong-markets/blob/main/ROADMAP_VERIFICATION_UPGRADE_NORMALIZED_FOR_REPO.txt

## Misi
Lakukan audit ketat berbasis source aktual, lalu rewrite `ROADMAP_VERIFICATION_UPGRADE.md` agar sinkron penuh dengan baseline runtime saat ini. Setelah roadmap valid, lanjut implementasi per fase **secara bertahap** dan **tidak melompat fase**.

## Guardrails Wajib
1. Jangan asumsi. Jangan overclaim. Jangan sebut “sudah terimplementasi” jika belum terhubung ke runtime nyata.
2. Jika dokumen konflik dengan source code, menangkan source code aktual.
3. Dilarang membuat placeholder/TODO palsu/dummy flow/future-ready claim tanpa bukti.
4. Fokus hanya scope task aktif. Jangan refactor liar di luar target.
5. Status merge tidak boleh ditentukan hanya dari CI hijau; harus sesuai target logika implementasi nyata.

## Tahap 0 — Audit Keras Source Aktual (Wajib sebelum perubahan)
Audit eksplisit minimal area berikut:
- Struktur file runtime utama (`src/app.ts`, `src/bootstrap.ts`, `src/services/*`, `src/domain/*`, `src/integrations/telegram/*`, `src/storage/*`).
- Jalur backtest (`src/domain/backtest/*`, script batch B phase1).
- Jalur shadow-live + phase2 (`src/services/batchBPhase2*`, script phase2, wiring Telegram terkait).
- Jalur phase3 (`src/services/phase3*`, probe/test phase3, command validate phase3).
- Kontrak command di `package.json`.
- CI di `.github/workflows/ci.yml`.
- Dokumen operator dan roadmap (`ROADMAP_VERIFICATION_UPGRADE.md`, `ROADMAP_VERIFICATION_UPGRADE_NORMALIZED_FOR_REPO.txt`, `README.md`).

Wajib hasilkan:
- Daftar baseline yang **sudah ada**.
- Daftar gap yang **belum ada**.
- Daftar konflik “dokumen vs source aktual” per file.

## Tahap 1 — Rewrite Roadmap (Bukan Implementasi Dulu)
Rewrite `ROADMAP_VERIFICATION_UPGRADE.md` dengan posisi berikut:
- Fase 1 = perluasan backtest/prediction validation di atas engine existing.
- Fase 2 = kalibrasi prediction di atas strict shadow-live existing + Telegram-first operator flow.
- Fase 3 = uplift bukti exchange end-to-end di atas execution/capital/reconciliation existing.

Wajib dinyatakan eksplisit dalam roadmap:
- Baseline existing yang diakui (bukan nol total).
- Deliverables baru vs extension file existing.
- Command target per fase.
- Artifact wajib per fase: JSON + Markdown + PDF Bahasa Indonesia.
- Probe/test per fase.
- Retention & cleanup policy operasional.
- Batas jujur tiap fase (anti overclaim READY FOR LIVE TRADING).

## Tahap 2 — Implementasi Bertahap Setelah Rewrite Valid
Urutan wajib:
1. Implementasi Fase 1 normalized.
2. Implementasi Fase 2 normalized.
3. Implementasi Fase 3 normalized.

Setiap fase wajib cek:
- wiring import/instansiasi/pemanggilan,
- input-output flow,
- state/persistence flow,
- env contract,
- probe impact,
- CI impact.

## CI & Governance Wajib
1. Hilangkan kondisi “GitHub combined status kosong”:
   - Pastikan workflow CI ada, jalan, dan publish combined status context yang konsisten.
2. PR tidak boleh merge jika CI gagal:
   - Verifikasi branch protection/ruleset (jika belum ada, tulis gap secara eksplisit + rekomendasi setting).
3. `verify-runtime-contract` harus benar-benar dijalankan di CI.
4. Update `README.md` agar alur validasi/CI/merge-gate terdokumentasi jelas.

## Testing & Probe Hygiene
1. Update mock object pada probe tests agar sinkron dengan type definitions terbaru.
2. Dilarang meninggalkan test/probe/docs stale.
3. Wajib laporkan status terpisah:
   - lint,
   - build,
   - typecheck,
   - tests/probes,
   - verify,
   - runtime-contract,
   - CI check.
4. Jika ada incomplete testing, tulis jujur:
   - apa yang belum teruji,
   - dampak risikonya,
   - tindak lanjut sempit yang konkret.

## Format Output Wajib
Gunakan format berikut secara ketat:
1. Audit ringkas
2. Temuan per file
3. Implementasi yang dilakukan
4. File yang diubah
5. Bukti validasi (dengan command + hasil)
6. Gap / residual risk
7. Verdict final

Verdict final wajib salah satu:
- **SIAP MERGE**
- **BELUM SIAP MERGE**

Jika **BELUM SIAP MERGE**:
- Sebutkan blocker paling penting.
- Buatkan prompt lanjutan yang sempit, tetap dalam scope batch/target aktif.

## Batas Scope Ketat
Dilarang keluar dari jalur target perbaikan aktif, kecuali perubahan sinkronisasi yang memang wajib agar implementasi benar-benar tersambung di runtime nyata.

