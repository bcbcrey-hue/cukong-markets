# PRD.md

## Original Problem Statement
Gunakan informasi repo GitHub mafiamarkets, REFACTOR_LOG.md, SESSION_CONTEXT_NEXT.md, dan mafiamarkets-blueprint.md sebagai konteks utama. Audit setiap file terutama logic inti, jangan mengulang refactor yang sudah tercatat kecuali diperlukan sebagai penghubung implementasi nyata, ikuti arsitektur blueprint, dan prioritaskan implementasi backend/business logic inti yang benar-benar nyambung end-to-end: state, market watcher, signal/scoring, opportunity/intelligence, risk, execution, persistence, dan wiring app.

## Architecture Decisions
- Menetapkan `OpportunityAssessment` sebagai contract aktif sebelum execution, bukan lagi mengandalkan signal baseline langsung.
- Menambahkan layer `microstructure`, `history`, dan `intelligence` agar runtime flow sesuai blueprint: market -> signal -> opportunity -> execution.
- Menyimpan snapshot/signal/opportunity/anomaly ke persistence JSONL untuk historical context dan audit trail runtime.
- Menyelaraskan `SignalCandidate` agar membawa harga, likuiditas, perubahan singkat, dan kontribusi skor yang dipakai downstream.
- Menambahkan `peakPrice` pada `PositionRecord` untuk trailing stop yang benar-benar bisa berjalan.

## What Has Been Implemented
- Perbaikan blocker compile TypeScript di config/util/http/mapper/runtime support files hingga `yarn lint` dan `yarn build` lulus.
- Implementasi layer baru:
  - `src/domain/microstructure/*`
  - `src/domain/history/*`
  - `src/domain/intelligence/*`
- Rewire `src/app.ts` agar jalur runtime aktif menjadi:
  `market snapshot -> signal -> feature pipeline -> historical context -> probability -> edge validation -> entry timing -> opportunity -> hotlist -> execution`
- Penyelarasan persistence/state/report/telegram/hotlist/execution/risk terhadap contract aktif terbaru.
- Perbaikan bug trailing stop unreachable dan perhitungan `change24hPct` yang terbalik.
- Penambahan regression test backend: `tests/runtime_backend_regression.ts`.
- `REFACTOR_LOG.md` dan `SESSION_CONTEXT_NEXT.md` dibersihkan menjadi status final yang konsisten untuk repo aktif `bcbcrey-hue/mafiamarkets`.
- Batch 3B ditambahkan: `WorkerPoolService`, worker runtime (`feature`, `pattern`, `backtest`), `BacktestEngine`, replay loader, metrics, persist hasil backtest, dan recovery timeout worker pool.

## Prioritized Backlog
### P0
- Hardening live Indodax order semantics (respons, fill behavior, sell quantity mapping, cancellation lifecycle).
- Integrasi report Telegram untuk intelligence/backtest output yang lebih operasional.
- Sinkronisasi lifecycle worker/backtest dengan flow operasional app/Telegram.

### P1
- Tambah intelligence report / spoof radar / pattern match di Telegram handlers & report service.
- Persist pattern outcomes trading real untuk memperkaya `recentWinRate` dan `falseBreakRate`.
- Tambah monitoring state/health yang lebih kaya untuk worker dan opportunity pipeline.

### P2
- Enrichment similarity engine dan regime tagging yang lebih tajam.
- Optimasi batching market watcher agar lebih hemat I/O/network.
- Dokumentasi README dan `.env.example` final sesuai contract aktif.

## Next Tasks
1. Hardening live execution path Indodax setelah worker/backtest baseline siap.
2. Perkaya report Telegram untuk menampilkan opportunity reasoning, spoof risk, pattern match, dan backtest summary.
3. Tambahkan hook operasional untuk menjalankan backtest dari flow aplikasi/Telegram.
