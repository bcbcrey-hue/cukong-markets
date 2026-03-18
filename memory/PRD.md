# PRD — Mafiamarkets Telegram UX Refactor Final

## Original Problem Statement
Gunakan informasi berikut sebagai konteks utama dan sumber kebenaran sebelum menjawab atau melakukan refactor dan implementasi.

Repository project GitHub:
https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga

Wajib audit:
- cek seluruh struktur repository
- audit setiap file yang relevan
- prioritaskan logic inti, alur trading, state, persistence, telegram flow, execution flow, dan keterhubungan antar modul
- verifikasi bahwa wiring antar modul benar-benar terhubung nyata, bukan hanya ada file dan interface
- verifikasi apakah build, lint, dan probe/test yang tersedia benar-benar lolos; jika ada yang gagal, jelaskan jujur dan perbaiki

Dokumen progres refactor saat ini:
- https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga/blob/main/REFACTOR_LOG.md
- https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga/blob/main/SESSION_CONTEXT_NEXT.md
- https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga/blob/main/README.md

Blueprint arsitektur:
- https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga/blob/main/mafiamarkets-blueprint.md

TUJUAN UTAMA
- Ubah Telegram UI dari flat dashboard penuh tombol menjadi struktur yang rapi, konsisten, dan mudah dipakai.
- Merapikan dan menyederhanakan UX Telegram bot TANPA merusak flow otomasi, execution, settings, accounts, monitoring, backtest, dan emergency yang sudah ada.
- Pertahankan Telegram button UI sebagai UI utama.
- Pertahankan whitelist user, legacy upload account JSON, storage akun di `data/accounts/accounts.json`, trading mode `OFF | ALERT_ONLY | SEMI_AUTO | FULL_AUTO`, dan seluruh wiring service yang sudah jalan.
- Jangan menghapus fungsi yang sudah ada. Yang diubah adalah struktur menu, grouping, navigasi, label, dan handler routing agar lebih jelas.
- Semua menu dan submenu wajib punya tombol `Kembali`.
- Otomasi inti tetap harus jalan walaupun user tidak menekan tombol selain kontrol runtime.
- Main menu harus ringkas dan terstruktur, bukan flat 18 tombol,dan mempertahankan emojinya
- Main menu lama yang flat harus benar-benar diganti menjadi struktur hierarkis, bukan hanya ditambah submenu sambil mempertahankan kekacauan lama.

## Architecture Decisions
- Pertahankan `src/app.ts` sebagai wiring runtime utama dengan arsitektur final `scanner -> signal -> intelligence -> execution`.
- Pertahankan Telegram sebagai UI operasional utama, tetapi pecah navigasi ke namespace callback `NAV` agar terpisah dari callback aksi (`RUN`, `ACC`, `SET`, `SIG`, `BUY`, `POS`, `EMG`, `BKT`).
- Main menu Telegram diubah menjadi 7 kategori top-level; submenu menggunakan inline keyboard dengan tombol `Kembali` yang kembali ke parent menu yang tepat.
- Accounts dan Backtest tetap memakai nested submenu agar konsisten dengan target UX baru.
- Buy slippage dipindahkan ke submenu `Positions / Orders / Manual Trade`; nilai default/max dimigrasikan ke `60/150` dengan normalization di `SettingsService`.
- Execution engine tetap memakai aggressive buy limit price dari `bestAsk + slippage`, dengan clamp ke `maxBuySlippageBps`.
- Tambah regression probes khusus untuk reachability callback/menu dan flow konfirmasi slippage > 150 bps.

## What’s Implemented
- Audit repo dan dokumen utama (`README.md`, `REFACTOR_LOG.md`, `SESSION_CONTEXT_NEXT.md`, blueprint) lalu sinkronisasi implementasi aktual dengan dokumen final.
- Refactor Telegram menu pada `src/integrations/telegram/keyboards.ts`, `handlers.ts`, dan `callbackRouter.ts` menjadi 7 kategori hierarkis:
  - Execute Trade
  - Emergency Controls
  - Monitoring / Laporan
  - Positions / Orders / Manual Trade
  - Settings
  - Accounts
  - Backtest
- Semua submenu yang tampil sekarang memiliki tombol `Kembali`; nested submenu kembali ke parent yang tepat.
- Main menu flat lama diganti; tombol-tombol aksi utama sekarang masuk ke submenu yang sesuai.
- Callback navigasi dipisahkan dari callback aksi live sehingga wiring lama tidak bentrok.
- Default buy slippage menjadi `60 bps`; max buy slippage menjadi `150 bps`.
- Settings legacy `25/80` dimigrasikan ke `60/150` di `SettingsService`.
- Input slippage Telegram di atas `150 bps` sekarang memberi warning dan meminta konfirmasi; `LANJUT` mengunci ke `150 bps`, angka lain yang valid akan diterapkan.
- `.env.example` dibuat dan disinkronkan dengan env contract yang aktual.
- `README.md`, `REFACTOR_LOG.md`, dan `SESSION_CONTEXT_NEXT.md` dibersihkan dan disinkronkan ke status final aktual.
- Probes yang lolos:
  - `yarn lint`
  - `yarn build`
  - `tests/runtime_backend_regression.ts`
  - `tests/worker_timeout_probe.ts`
  - `tests/live_execution_hardening_probe.ts`
  - `tests/execution_summary_failed_probe.ts`
  - `tests/telegram_menu_navigation_probe.ts`
  - `tests/telegram_slippage_confirmation_probe.ts`
- Testing agent iteration 8 backend audit pass tanpa issue blocking.

## Prioritized Backlog
### P0
- Hardening recovery restart live order untuk edge-case partial fill / cancel / close saat detail exchange parsial.
- Perkuat fallback accounting saat detail fee / executed trade exchange tidak tersedia penuh.
- Verifikasi sumber trade exchange resmi tambahan bila dokumentasi berubah di masa depan.

### P1
- Pindahkan pattern matching live path ke worker runtime bila butuh offload konsisten.
- Upgrade `recentTrades` dari inferred flow ke native trade print bila ada sumber valid.
- Pecah `executionEngine.ts` menjadi modul lebih kecil setelah P0 aman.

### P2
- Verifikasi end-to-end Telegram live delivery saat kredensial/live validation memang diizinkan.
- Rapikan runbook operasional tambahan bila diperlukan.

## Next Tasks
1. Dalami edge-case recovery restart order live parsial/terminal.
2. Perkuat fallback accounting saat exchange tidak mengembalikan detail trade lengkap.
3. Setelah P0 aman, modularisasi `executionEngine.ts` untuk menurunkan risiko regresi.

## Honest Notes
- Delivery Telegram live belum divalidasi end-to-end pada sesi ini.
- Probe backend memakai fake exchange client / fake Telegram harness, bukan validasi live exchange.
- `recentTrades` masih inferred dari delta volume lokal, belum native trade feed exchange.
