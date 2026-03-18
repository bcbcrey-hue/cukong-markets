# REFACTOR_LOG

Repository aktif: `https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga`

Dokumen ini adalah **sumber kebenaran final** untuk status repo setelah audit implementasi aktual + sinkronisasi dengan blueprint.

---

## 1. Status repo setelah audit final

Validasi yang sudah diverifikasi pada repo lokal:

- `yarn install` selesai
- `yarn lint` lulus
- `yarn build` lulus
- regression runtime backend lulus:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-regression LOG_DIR=/tmp/mafiamarkets-audit-regression/logs TEMP_DIR=/tmp/mafiamarkets-audit-regression/tmp yarn tsx /app/tests/runtime_backend_regression.ts`
- probe worker timeout lulus:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-timeout LOG_DIR=/tmp/mafiamarkets-audit-timeout/logs TEMP_DIR=/tmp/mafiamarkets-audit-timeout/tmp yarn tsx /app/tests/worker_timeout_probe.ts`
- probe live execution hardening lulus:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-live-hardening-probe-self LOG_DIR=/tmp/mafiamarkets-live-hardening-probe-self/logs TEMP_DIR=/tmp/mafiamarkets-live-hardening-probe-self/tmp yarn tsx /app/tests/live_execution_hardening_probe.ts`
- probe summary failure path lulus:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-it6-failed-self LOG_DIR=/tmp/mafiamarkets-it6-failed-self/logs TEMP_DIR=/tmp/mafiamarkets-it6-failed-self/tmp yarn tsx /app/tests/execution_summary_failed_probe.ts`
- testing agent iteration 7 juga menyatakan backend pass tanpa issue blocking

Jalur runtime aktual yang berlaku sekarang:

`tickers + depth -> MarketWatcher -> SignalEngine -> FeaturePipeline/HistoricalContext/Probability/EdgeValidation/EntryTiming -> OpportunityAssessment -> Hotlist -> ExecutionEngine`

Status final yang benar saat ini:

- runtime utama sudah sinkron pada arsitektur `scanner -> signal -> intelligence -> execution`
- `OpportunityAssessment` adalah contract final sebelum execution
- persistence JSON + JSONL aktif untuk state, order, position, trade, journal, pair history, anomaly event, pattern outcome, backtest, execution summary, dan trade outcome summary
- Telegram button UI tetap menjadi UI operasional utama
- worker runtime nyata tersedia untuk `feature`, `pattern`, dan `backtest`
- backtest replay aktif dari pair-history JSONL dan menyimpan hasil ke `data/backtest/*.json`
- README root final dan `.env.example` sekarang sudah ada dan sinkron dengan implementasi aktual

Hal yang **belum final** dan jangan di-overclaim:

- recovery restart live order untuk edge-case tertentu masih punya backlog lanjutan jika detail exchange tidak lengkap di tengah partial fill / cancel / close
- accounting fee / weighted fill sudah memakai `tradeHistory` bila tersedia, tetapi fallback saat endpoint detail trade tidak lengkap masih terbatas
- `recentTrades` pada market intelligence masih **inferred flow** dari delta volume lokal, belum native trade print exchange
- jalur broadcast summary ke Telegram sudah terpasang, tetapi delivery Telegram live **belum divalidasi end-to-end** pada sesi ini karena diminta skip

---

## 2. Peta struktur repo yang aktif dan relevan

Root aktif:

- `package.json`
- `README.md`
- `.env.example`
- `src/app.ts`
- `src/bootstrap.ts`
- `src/config/env.ts`
- `REFACTOR_LOG.md`
- `SESSION_CONTEXT_NEXT.md`
- `mafiamarkets-blueprint.md`
- `tests/runtime_backend_regression.ts`
- `tests/worker_timeout_probe.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/execution_summary_failed_probe.ts`

Layer inti:

- `src/core/*` → logger, scheduler, shutdown, metrics, contracts
- `src/storage/*` → JSON/JSONL helpers
- `src/services/*` → persistence, state, health, journal, report, summary, polling, worker pool
- `src/domain/accounts/*` → upload/store/registry account
- `src/domain/market/*` → pair universe, market watcher, ticker/orderbook features, hotlist
- `src/domain/signals/*` → scoring baseline dan strategi sinyal
- `src/domain/microstructure/*` → accumulation/spoof/iceberg/cluster detectors
- `src/domain/history/*` → pair history, regime classifier, pattern matcher, pattern library
- `src/domain/intelligence/*` → feature pipeline, probability, edge validation, score explanation, entry timing, opportunity engine
- `src/domain/trading/*` → risk, order, position, execution
- `src/domain/backtest/*` → replay loader, metrics, backtest engine
- `src/integrations/telegram/*` → auth, callback, keyboards, upload, handlers, bot wrapper
- `src/integrations/indodax/*` → public/private API shell, mapper, client
- `src/workers/*` → feature/pattern/backtest workers

---

## 3. Hasil audit implementasi per flow inti

### 3.1 Environment, core runtime, dan persistence

- `src/config/env.ts` adalah contract utama untuk path runtime, threshold trading, worker settings, Telegram auth, dan base URL Indodax.
- `src/core/types.ts` adalah pusat contract lintas layer, termasuk contract baru `ExecutionSummary`, `TradeOutcomeSummary`, dan `SummaryAccuracy`.
- `src/storage/jsonStore.ts` dan `src/services/persistenceService.ts` stabil untuk JSON/JSONL.
- persistence summary baru aktif di:
  - `data/history/execution-summaries.jsonl`
  - `data/history/trade-outcomes.jsonl`
- `StateService`, `SettingsService`, `HealthService`, `JournalService`, dan `SummaryService` sudah sinkron ke persistence tunggal.

### 3.2 Market flow

- `PairUniverse` membawa `high24h` / `low24h` dari ticker exchange.
- `MarketWatcher` menarik ticker + depth, membentuk `MarketSnapshot`, menyimpan history lokal, dan menginfer trade flow dari delta volume.
- `change24hPct` memakai arah yang benar terhadap baseline exchange.
- trade-flow masih inferred, bukan native trade feed.

### 3.3 Signal + intelligence + history flow

- `SignalEngine` tetap sinkron ke contract `SignalCandidate` aktif.
- `FeaturePipeline` menjalankan accumulation, spoof, iceberg, dan trade-cluster detectors.
- `PairHistoryStore` menyimpan snapshot/signal/opportunity/anomaly ke JSONL dan membangun `HistoricalContext`.
- `ProbabilityEngine`, `EdgeValidator`, `EntryTimingEngine`, dan `ScoreExplainer` aktif di jalur runtime.
- `OpportunityEngine` menghasilkan `OpportunityAssessment` final untuk execution.
- hotlist sekarang diranking dari output opportunity.

### 3.4 Trading + execution hardening + summary

- `ExecutionEngine` membaca `OpportunityAssessment` untuk FULL_AUTO.
- `syncActiveOrders()` dipanggil oleh loop `position-monitor` dan mencoba `openOrders()` dulu lalu fallback ke `getOrder()`, `orderHistory()`, lalu snapshot berbasis `tradeHistory` bila diperlukan.
- `recoverLiveOrdersOnStartup()` aktif saat start untuk recovery order live tersisa.
- repeated partial BUY fill digabung ke **satu posisi logis per pair/account** melalui `PositionManager`.
- reconciliation mencoba menarik executed quantity, weighted average fill, fee, executed trade count, dan last executed timestamp via `tradeHistory` jika tersedia.
- parser fee mencegah double-count saat payload membawa `fee` dan `fee_*`.
- BUY default memakai **aggressive limit / limit rasa market** dari `bestAsk` + slippage bps terukur, dengan timeout cancel untuk order buy yang stale.
- SELL / TP baseline praktis untuk token pump cepat dengan **default take profit 15%** yang bisa diubah dari Telegram.
- `attemptAutoBuy()` sekarang skip deterministik jika BUY aktif untuk pair/account yang sama masih ada.
- `evaluateOpenPositions()` sekarang skip deterministik jika posisi sudah punya SELL aktif, sehingga restart/loop monitor tidak memicu duplicate sell atau spam error.
- `sellAllPositions()` sekarang melaporkan jumlah submitted vs skipped secara jujur untuk rekonsiliasi operasional.
- `PositionRecord` sekarang melacak quantity/fill lifecycle yang cukup untuk summary final: `totalBoughtQuantity`, `totalSoldQuantity`, `averageExitPrice`, `totalEntryFeesPaid`.
- `SummaryService` sekarang menulis execution summary dan trade outcome summary ke persistence + journal + logger + Telegram broadcast hook.

Execution summary yang sudah aktif:

- BUY submitted
- BUY partially filled
- BUY filled
- BUY canceled / failed
- SELL submitted
- SELL partially filled
- SELL filled
- SELL canceled / failed

Trade outcome summary yang sudah aktif:

- hanya ditulis ketika posisi benar-benar `CLOSED`
- tidak ditulis jika SELL gagal dan posisi tetap open

Semantik akurasi summary yang aktif:

- `SIMULATED`
- `OPTIMISTIC_LIVE`
- `PARTIAL_LIVE`
- `CONFIRMED_LIVE`

### 3.5 Telegram flow

- whitelist tetap berbasis `TELEGRAM_ALLOWED_USER_IDS`
- Telegram button UI tetap dipertahankan
- upload legacy JSON account tetap didukung
- menu operasional aktif: `Status`, `Market Watch`, `Hotlist`, `Intelligence Report`, `Spoof Radar`, `Pattern Match`, `Backtest`, `Positions`, `Orders`, `Manual Buy`, `Manual Sell`, `Strategy`, `Risk`, `Accounts`, `Logs`, `Emergency`
- `START` / `STOP` mengubah state runtime (`RUNNING` / `STOPPED`), bukan bootstrap ulang proses
- user bisa mengubah `buySlippageBps` dan `takeProfitPct` dari Telegram
- `TelegramBot.broadcast()` sekarang tersedia untuk push summary ke seluruh `TELEGRAM_ALLOWED_USER_IDS`

### 3.6 Worker + backtest flow

- `WorkerPoolService` aktif dengan worker `feature`, `pattern`, dan `backtest`
- preference ke `dist/workers/*.js` tetap berlaku bila hasil build ada
- bug timeout deadlock/starvation worker pool sudah tertutup dan tervalidasi
- `BacktestEngine` load replay dari `pair-history.jsonl`, menjalankan replay signal -> opportunity -> risk exit, lalu persist hasil JSON

---

## 4. Keputusan arsitektur dan contract final yang wajib dipertahankan

Keputusan final:

- Telegram button UI tetap UI utama
- whitelist user tetap berbasis `TELEGRAM_ALLOWED_USER_IDS`
- legacy upload account JSON tetap didukung dalam format lama
- storage account tetap di `data/accounts/accounts.json`
- mode trading tetap `OFF | ALERT_ONLY | SEMI_AUTO | FULL_AUTO`
- `src/app.ts` tetap sebagai wiring utama runtime
- arsitektur final tetap `scanner -> signal -> intelligence -> execution`

Contract aktif yang wajib dipertahankan:

- `SignalCandidate`
- `OpportunityAssessment`
- `OrderRecord` dengan metadata live + `referencePrice` + `closeReason`
- `PositionRecord` dengan `peakPrice`, `totalBoughtQuantity`, `totalSoldQuantity`, `averageExitPrice`, `totalEntryFeesPaid`
- `ExecutionSummary`
- `TradeOutcomeSummary`

---

## 5. Bug / mismatch penting yang sudah tertutup dan tervalidasi

Sudah tertutup dan jangan dianggap backlog lagi:

- compile blocker TypeScript/support files
- mismatch contract app ↔ persistence ↔ state ↔ hotlist ↔ report ↔ Telegram ↔ execution
- trailing-stop unreachable logic
- arah `change24hPct` yang sebelumnya terbalik
- timeout deadlock / starvation pada worker pool
- sinkronisasi base URL Indodax ke env
- baseline live order sync / cancel / duplicate-guard
- merge repeated partial BUY fill ke satu posisi logis per pair/account
- aggressive BUY policy + timeout cancel untuk stale buy
- default take profit 15% via Telegram
- capture fee / executed trade count / weighted average fill via `tradeHistory` bila tersedia
- fallback recovery `getOrder -> orderHistory -> tradeHistory snapshot`
- skip guard deterministik untuk auto-buy dan auto-sell saat order aktif masih ada
- execution summary untuk submitted / partial / filled / canceled / failed
- trade outcome summary final saat posisi benar-benar closed
- guardrail failure-path lewat `tests/execution_summary_failed_probe.ts`
- finalisasi `README.md` dan `.env.example`

---

## 6. Backlog aktif yang benar-benar tersisa

### P0 — hardening live execution lanjutan

- recovery restart order live yang lebih lengkap untuk edge-case partial fill / cancel / close saat detail exchange parsial
- fallback accounting saat detail fee / executed trade exchange tidak tersedia penuh
- verifikasi sumber trade exchange resmi tambahan bila dokumentasi resmi berubah di masa depan

### P1 — penguatan runtime/intelligence

- pindahkan pattern matching live path ke worker runtime bila butuh offload konsisten
- upgrade `recentTrades` dari inferred flow ke native trade print bila ada sumber yang valid
- pecah `executionEngine.ts` menjadi modul lebih kecil agar risiko regresi turun tanpa mengubah perilaku inti

### P2 — operasional lanjutan

- verifikasi end-to-end Telegram live delivery saat kredensial/live validation memang diizinkan
- rapikan onboarding runbook tambahan bila diperlukan di luar README dasar

---

## 7. Next target paling logis

Prioritas berikutnya yang paling rasional:

1. perdalam edge-case recovery restart untuk order live parsial/terminal
2. perkuat fallback accounting ketika detail trade exchange tidak lengkap
3. jika perlu, kecilkan `executionEngine.ts` tanpa menggeser perilaku P0 yang sudah lolos regression

---

## 8. Ringkasan final satu paragraf

Repo aktif `https://github.com/bcbcrey-hue/mafiamarkets-refactor-tiga` sekarang berada pada status backend refactor yang nyata dan saling terhubung dari env/core/persistence, market watcher, signal engine, intelligence/history, worker runtime, backtest, Telegram operational hooks, sampai execution hardening live. Sumber kebenaran terbaru adalah: runtime utama sudah memakai `OpportunityAssessment` sebelum execution, BUY baseline sudah aggressive limit dengan slippage terukur, repeated partial BUY fill digabung ke satu posisi logis per pair/account, startup recovery + openOrders-first reconciliation aktif, SELL / TP baseline disiplin dengan default TP 15%, accounting fee/weighted fill ditarik dari exchange saat `tradeHistory` tersedia, execution summary sudah tersedia ke Telegram/journal/log/persistence untuk seluruh event order penting, trade outcome summary final sudah ditulis hanya saat posisi benar-benar closed, dan README + `.env.example` sudah disinkronkan; backlog yang tersisa kini murni ada pada pendalaman recovery/accounting edge-case dan verifikasi live tertentu yang memang belum diizinkan pada sesi ini.
