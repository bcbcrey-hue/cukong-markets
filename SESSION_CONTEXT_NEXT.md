# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga`

Gunakan file ini sebagai konteks cepat yang **sinkron penuh** dengan `REFACTOR_LOG.md`.

---

## 1. Posisi project yang harus dianggap benar

Status aktual repo:

- refactor utama backend **sudah terimplementasi**, bukan draft
- `yarn lint` lulus
- `yarn build` lulus
- `tests/runtime_backend_regression.ts` lulus
- `tests/worker_timeout_probe.ts` lulus
- `tests/live_execution_hardening_probe.ts` lulus
- `tests/execution_summary_failed_probe.ts` lulus
- `tests/telegram_menu_navigation_probe.ts` lulus
- `tests/telegram_slippage_confirmation_probe.ts` lulus
- testing agent iteration 8 pass tanpa issue blocking
- runtime utama berlaku:
  `tickers + depth -> MarketWatcher -> SignalEngine -> intelligence pipeline -> OpportunityAssessment -> Hotlist -> ExecutionEngine`
- worker runtime untuk `feature`, `pattern`, dan `backtest` sudah ada
- `README.md`, `.env.example`, `REFACTOR_LOG.md`, dan file ini sudah sinkron dengan implementasi repo saat ini

Jangan pakai lagi asumsi lama bahwa refactor masih mentah atau belum nyambung.

---

## 2. Truth penting per modul

### Market / scanner

- `MarketWatcher` memakai ticker + depth Indodax
- `recentTrades` masih inferred dari delta volume lokal, belum native trade stream
- `PairUniverse` sudah membawa `high24h` / `low24h` dari ticker exchange

### Signal / intelligence

- `SignalCandidate` adalah output signal baseline
- `OpportunityAssessment` adalah contract final sebelum execution
- hotlist diranking dari opportunity output

### Trading / execution / summary

- trailing stop valid karena memakai `peakPrice`
- flow simulasi buy/sell lengkap dan persist ke state
- live buy / sell / cancel baseline sudah ada
- order live menyimpan `exchangeOrderId` dan disinkronkan lewat `openOrders()` lalu fallback `getOrder()`, `orderHistory()`, dan snapshot berbasis `tradeHistory` bila perlu
- startup memanggil `recoverLiveOrdersOnStartup()` untuk order live aktif yang tersisa
- `position-monitor` memanggil `syncActiveOrders()` sebelum evaluasi exit
- duplicate active BUY/SELL guard aktif
- repeated partial fill BUY sudah merge ke satu posisi logis per pair/account
- BUY default aggressive limit dari `bestAsk` + slippage bps aman; order buy stale bisa dibatalkan timeout policy
- default buy slippage sekarang `60 bps` dan max `150 bps`
- settings legacy `25/80` dimigrasikan ke `60/150`
- input slippage Telegram di atas `150 bps` memberi warning + konfirmasi; `LANJUT` mengunci ke `150 bps`
- fee / executed trade count / weighted average fill ditarik dari exchange saat `tradeHistory` tersedia
- default take profit 15% bisa diubah dari Telegram
- `attemptAutoBuy()` skip deterministik jika BUY aktif sudah ada
- `evaluateOpenPositions()` skip deterministik jika posisi sudah punya SELL aktif
- execution summary aktif untuk BUY/SELL submitted, partially filled, filled, canceled, failed
- trade outcome summary final aktif hanya saat posisi benar-benar `CLOSED`
- accuracy label summary yang aktif: `SIMULATED`, `OPTIMISTIC_LIVE`, `PARTIAL_LIVE`, `CONFIRMED_LIVE`
- persistence summary ada di:
  - `data/history/execution-summaries.jsonl`
  - `data/history/trade-outcomes.jsonl`
- yang belum final: fallback accounting saat detail trade exchange tidak tersedia, plus edge-case recovery restart tertentu

### Telegram

- Telegram button UI tetap UI utama
- whitelist `TELEGRAM_ALLOWED_USER_IDS` tetap aktif
- upload legacy account JSON tetap didukung
- main menu flat lama sudah diganti jadi **7 kategori hierarkis**:
  - `⚡ Execute Trade`
  - `🚨 Emergency Controls`
  - `📡 Monitoring / Laporan`
  - `📦 Positions / Orders / Manual Trade`
  - `⚙️ Settings`
  - `👤 Accounts`
  - `🧪 Backtest`
- semua submenu yang ditampilkan punya tombol `Kembali`
- callback navigasi memakai namespace `NAV` dan terpisah dari callback aksi live
- `Buy Slippage X bps` sekarang ada di submenu `Positions / Orders / Manual Trade`, bukan lagi di `Strategy Settings`
- START/STOP di Telegram mengubah state runtime, bukan bootstrap ulang proses aplikasi
- `TelegramBot.broadcast()` dipakai sebagai jalur push summary ke allowed users
- delivery Telegram live belum divalidasi end-to-end pada sesi ini

### Worker / backtest

- feature worker bisa dipakai di runtime utama
- pattern worker tersedia dan lolos regression, tetapi matching live path utama masih inline
- backtest replay dari pair-history JSONL aktif dan persist hasil ke `data/backtest/*.json`

---

## 3. Hal yang sudah ditutup, jangan diulang

- compile blocker TypeScript/support files
- mismatch contract app ↔ persistence ↔ state ↔ hotlist ↔ report ↔ Telegram ↔ execution
- trailing-stop unreachable logic
- arah `change24hPct` yang terbalik
- timeout deadlock / starvation pada worker pool
- sinkronisasi base URL Indodax ke env di entry client
- baseline live order sync / cancel / duplicate-guard
- merge partial BUY fill + aggressive BUY policy + Telegram TP/slippage config
- execution summary + trade outcome summary baseline
- flat Telegram dashboard lama sudah diganti menjadi menu hierarkis 7 kategori
- callback reachability + tombol `Kembali` sekarang sudah diproteksi probe
- finalisasi `README.md`, `.env.example`, `REFACTOR_LOG.md`, dan file ini

---

## 4. Backlog aktif yang nyata

### P0

- fallback accounting saat detail trade exchange tidak tersedia penuh
- recovery restart untuk skenario partial fill / cancel / close yang lebih lengkap
- verifikasi sumber trade exchange resmi tambahan bila dokumentasi resmi berubah di masa depan

### P1

- pindahkan pattern matching live path ke worker runtime jika perlu offload konsisten
- upgrade trade-flow bila ada sumber trade print native
- pecah `executionEngine.ts` menjadi modul lebih kecil setelah P0 aman

### P2

- verifikasi end-to-end Telegram live delivery saat validasi live diizinkan
- pengayaan runbook operasional tambahan bila diperlukan

---

## 5. Next target paling logis

1. hardening edge-case recovery restart order live
2. fallback accounting untuk detail fee/executed trade yang parsial
3. baru setelah itu refactor modular `executionEngine.ts` bila memang perlu

---

## 6. Rule kerja sesi berikutnya

- jangan mengulang batch lama yang sudah selesai
- jangan campur status lama dengan status implementasi terbaru
- jika ada mismatch baru, utamakan implementasi aktual repo + blueprint
- jangan overclaim live execution sudah selesai total
- gunakan `REFACTOR_LOG.md` sebagai sumber detail dan file ini sebagai ringkasan eksekusi cepat

---

## 7. Validasi cepat yang bisa dipakai ulang

- `yarn lint`
- `yarn build`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-regression LOG_DIR=/tmp/mafiamarkets-audit-regression/logs TEMP_DIR=/tmp/mafiamarkets-audit-regression/tmp yarn tsx /app/tests/runtime_backend_regression.ts`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-timeout LOG_DIR=/tmp/mafiamarkets-audit-timeout/logs TEMP_DIR=/tmp/mafiamarkets-audit-timeout/tmp yarn tsx /app/tests/worker_timeout_probe.ts`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-live-hardening-probe-self LOG_DIR=/tmp/mafiamarkets-live-hardening-probe-self/logs TEMP_DIR=/tmp/mafiamarkets-live-hardening-probe-self/tmp yarn tsx /app/tests/live_execution_hardening_probe.ts`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-it6-failed-self LOG_DIR=/tmp/mafiamarkets-it6-failed-self/logs TEMP_DIR=/tmp/mafiamarkets-it6-failed-self/tmp yarn tsx /app/tests/execution_summary_failed_probe.ts`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-telegram-menu LOG_DIR=/tmp/mafiamarkets-telegram-menu/logs TEMP_DIR=/tmp/mafiamarkets-telegram-menu/tmp yarn tsx /app/tests/telegram_menu_navigation_probe.ts`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-it8-slip-self LOG_DIR=/tmp/mafiamarkets-it8-slip-self/logs TEMP_DIR=/tmp/mafiamarkets-it8-slip-self/tmp yarn tsx /app/tests/telegram_slippage_confirmation_probe.ts`
