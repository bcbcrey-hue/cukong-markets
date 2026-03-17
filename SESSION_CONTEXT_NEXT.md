# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/bcbcrey-hue/mafiamarkets`

Gunakan file ini sebagai konteks cepat sebelum melanjutkan kerja pada sesi berikutnya.

---

## 1. Posisi project saat ini

Status yang harus dianggap benar:
- refactor utama **sudah terimplementasi** di repo aktif
- `yarn lint` lulus
- `yarn build` lulus
- regression test backend lulus
- jalur runtime aktif sekarang adalah:
  `market snapshot -> signal -> feature pipeline -> historical context -> probability -> edge validation -> entry timing -> opportunity -> hotlist -> execution`
- worker runtime dan backtest baseline sudah tersedia

Jangan lagi memakai asumsi lama bahwa progres masih berupa draft atau belum diterapkan.

---

## 2. Batch yang sudah selesai

Sudah selesai dan harus dianggap baseline:
- Batch 1A — Core contract foundation
- Batch 1B — Core runtime foundation
- Batch 1C — State and persistence reset
- Batch 1D — Telegram contract reset
- Batch 1E — Foundation alignment + runtime wiring
- Batch 2A — Indodax + market baseline
- Batch 2B — Market feature builders + scoring alignment
- Batch 2C — Trading layer contract reset
- Batch 3A — Intelligence/history runtime integration + contract finalization
- Batch 3B — Worker runtime + backtest baseline

---

## 3. Contract dan keputusan arsitektur yang wajib dipertahankan

Keputusan arsitektur:
- Telegram button UI tetap UI utama
- whitelist `TELEGRAM_ALLOWED_USER_IDS` tetap aktif
- legacy upload account JSON tetap didukung
- runtime accounts tetap di `data/accounts/accounts.json`
- `src/app.ts` tetap wiring utama runtime
- arsitektur final yang berlaku:
  `scanner -> signal -> intelligence -> execution`

Contract aktif yang wajib dipertahankan:
- `SignalCandidate` sudah diperkaya dengan harga, liquidity, perubahan singkat, dan score contributions
- `OpportunityAssessment` adalah contract final sebelum execution
- `PositionRecord` menyimpan `peakPrice` untuk trailing stop
- hotlist boleh diranking dari output opportunity, bukan hanya signal baseline
- hasil backtest disimpan ke `data/backtest/*.json`
- worker pool memprioritaskan `dist/workers/*.js` bila hasil build tersedia

---

## 4. Hal yang sudah ditutup

Sudah ditutup, jangan diulang kecuali ada bug baru nyata:
- compile blocker support files / TypeScript config
- mismatch app ↔ persistence ↔ state ↔ hotlist ↔ report ↔ telegram contracts
- mismatch market snapshot ↔ signal engine
- mismatch signal baseline ↔ risk/execution
- formula entry price bridge lama yang tidak realistis
- trailing-stop unreachable logic
- arah `change24hPct` yang terbalik
- worker timeout deadlock / pool starvation risk

---

## 5. Fokus backlog yang belum selesai

Masih belum selesai:
- hardening live Indodax execution semantics
- enrichment report/menu Telegram:
  - Intelligence Report
  - Spoof Radar
  - Pattern Match
  - Backtest Summary
- final README / `.env.example`

---

## 6. Next target paling logis

Mulai langsung dari hardening tahap berikutnya:

1. hardening live Indodax execution
2. enrichment report/menu Telegram berbasis output opportunity
3. finalisasi README / `.env.example`

Target praktis berikutnya:
- sinkronkan live order lifecycle dengan runtime state
- tampilkan reasoning opportunity / spoof risk / pattern match / backtest summary di Telegram
- rapikan dokumentasi runtime aktif agar onboarding sesi berikutnya makin cepat

---

## 7. Rule kerja sesi berikutnya

- jangan mengulang batch lama yang sudah selesai
- jangan campurkan lagi status lama vs status implementasi terbaru
- jika ada mismatch baru, prioritaskan contract aktif yang sekarang berlaku
- prioritaskan kestabilan runtime, konsistensi contract, dan koneksi antar modul
- gunakan `REFACTOR_LOG.md` sebagai sumber detail, file ini sebagai ringkasan operasional cepat

---

## 8. Validasi cepat yang bisa dipakai ulang

- `yarn lint`
- `yarn build`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-regression-2 LOG_DIR=/tmp/mafiamarkets-regression-2/logs TEMP_DIR=/tmp/mafiamarkets-regression-2/tmp yarn tsx /app/tests/runtime_backend_regression.ts`
