# REFACTOR_LOG

Repository aktif: `https://github.com/bcbcrey-hue/mafiamarkets-refactor-dua`

Dokumen ini adalah **sumber kebenaran final** untuk status refactor yang **benar-benar terimplementasi** di repo aktif setelah audit struktur, logic inti, flow trading, state, persistence, Telegram, worker, dan backtest.

---

## 1. Status repo setelah audit final

Validasi yang sudah diverifikasi pada repo lokal:
- `yarn lint` lulus
- `yarn build` lulus
- regression runtime backend lulus via:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-regression LOG_DIR=/tmp/mafiamarkets-audit-regression/logs TEMP_DIR=/tmp/mafiamarkets-audit-regression/tmp yarn tsx /app/tests/runtime_backend_regression.ts`
- probe recovery worker timeout lulus via:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-timeout LOG_DIR=/tmp/mafiamarkets-audit-timeout/logs TEMP_DIR=/tmp/mafiamarkets-audit-timeout/tmp yarn tsx /app/tests/worker_timeout_probe.ts`
- probe live execution hardening lulus via:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-live-hardening-probe-self LOG_DIR=/tmp/mafiamarkets-live-hardening-probe-self/logs TEMP_DIR=/tmp/mafiamarkets-live-hardening-probe-self/tmp yarn tsx /app/tests/live_execution_hardening_probe.ts`

Jalur runtime aktual yang berlaku sekarang:

`tickers + depth -> MarketWatcher -> SignalEngine -> FeaturePipeline/HistoricalContext/Probability/EdgeValidation/EntryTiming -> OpportunityAssessment -> Hotlist -> ExecutionEngine`

Catatan penting tentang status aktual:
- runtime utama sudah sinkron pada arsitektur `scanner -> signal -> intelligence -> execution`
- `OpportunityAssessment` adalah contract final sebelum execution
- persistence JSON + JSONL sudah aktif untuk state, order, position, trade, journal, pair history, anomaly event, pattern outcome, dan backtest result
- Telegram button UI tetap menjadi UI operasional utama
- worker runtime nyata tersedia untuk `feature`, `pattern`, dan `backtest`
- backtest replay sudah berjalan dari pair-history JSONL dan menyimpan hasil ke `data/backtest/*.json`

Hal yang **belum selesai** dan jangan di-overclaim:
- hardening live order semantics Indodax **sudah naik dari baseline lama**, tetapi reconciliation lanjutan masih belum sepenuhnya end-to-end
- repeated partial fill buy saat ini masih bisa tercatat sebagai slice posisi tambahan, belum diagregasi menjadi satu posisi logis per pair/account
- fee, trade history exchange, dan recovery setelah restart belum dipakai penuh sebagai sumber rekonsiliasi akhir
- `recentTrades` pada runtime masih **inferred flow** dari delta volume lokal, belum trade print native exchange
- README root dan `.env.example` masih belum ada

---

## 2. Peta struktur repo yang aktif dan relevan

Root aktif:
- `package.json`
- `src/app.ts`
- `src/bootstrap.ts`
- `src/config/env.ts`
- `REFACTOR_LOG.md`
- `SESSION_CONTEXT_NEXT.md`
- `mafiamarkets-blueprint.md`
- `tests/runtime_backend_regression.ts`
- `tests/worker_timeout_probe.ts`

Layer inti:
- `src/core/*` → logger, scheduler, shutdown, metrics, shared contracts
- `src/storage/*` → JSON/JSONL persistence helpers
- `src/services/*` → persistence, state, health, journal, polling, report, worker pool
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
- `src/config/env.ts` adalah contract utama untuk path runtime, trading thresholds, worker settings, Telegram auth, dan Indodax base URL.
- `src/core/types.ts` sudah menjadi pusat contract lintas layer.
- `src/storage/jsonStore.ts` dan `src/services/persistenceService.ts` sudah stabil untuk JSON/JSONL.
- `StateService`, `SettingsService`, `HealthService`, dan `JournalService` sudah sinkron terhadap persistence tunggal.
- `src/app.ts` tetap menjadi wiring utama runtime.

### 3.2 Market flow
- `PairUniverse` menyimpan pair ranking berdasarkan volume dan sekarang membawa `high24h` / `low24h` dari ticker exchange.
- `MarketWatcher` menarik ticker + depth, membentuk `MarketSnapshot`, menyimpan short history lokal, dan menginfer trade flow dari delta volume.
- `change24hPct` sekarang dihitung dengan arah yang benar terhadap `low24h` yang datang dari ticker exchange, bukan lagi arah terbalik.
- Blueprint tentang market intelligence tercapai pada baseline scanner, tetapi trade-flow masih inferred, bukan feed trade native.

### 3.3 Signal flow
- `TickerSnapshotStore` membentuk fitur `change1m/3m/5m/15m`, volume windows, momentum, dan volatility.
- `OrderbookSnapshotBuilder` membentuk imbalance, depth score, wall pressure, dan spread basis points.
- `ScoreCalculator` menggabungkan strategi `volumeSpike`, `breakoutRetest`, `silentAccumulation`, `hotRotation`, dan `orderbookImbalance`.
- `SignalEngine` sudah sinkron ke contract `SignalCandidate` aktif.

### 3.4 Intelligence + history flow
- `FeaturePipeline` menjalankan accumulation, spoof, iceberg, dan trade-cluster detectors.
- `PairHistoryStore` menyimpan snapshot/signal/opportunity/anomaly ke JSONL dan membangun `HistoricalContext`.
- `ProbabilityEngine`, `EdgeValidator`, `EntryTimingEngine`, dan `ScoreExplainer` sudah aktif di jalur runtime.
- `OpportunityEngine` menghasilkan `OpportunityAssessment` final untuk execution.
- Hotlist sekarang diranking dari output opportunity, bukan hanya signal baseline.

Catatan audit penting:
- feature task bisa di-offload ke worker pool pada runtime utama
- pattern worker **sudah ada dan lolos regression**, tetapi matching historis pada flow utama masih dilakukan inline lewat `PairHistoryStore` / `PatternMatcher`, belum dipindah penuh ke worker runtime

### 3.5 Trading + execution flow
- `RiskEngine` sudah memakai trailing-stop berbasis drawdown dari `peakPrice`; branch trailing-stop yang sebelumnya unreachable sudah tertutup.
- `OrderManager` dan `PositionManager` sudah persist ke state storage aktif.
- `ExecutionEngine` membaca `OpportunityAssessment` untuk FULL_AUTO.
- flow simulasi buy/sell sudah lengkap: order terbuat, fill ditandai, posisi dibuka/ditutup, journal ditulis, `tradeCount` naik, cooldown pair di-set.
- `OrderRecord` sekarang bisa menyimpan metadata live exchange: `exchangeOrderId`, `exchangeStatus`, `exchangeUpdatedAt`, dan `relatedPositionId`.
- `ExecutionEngine.syncActiveOrders()` sudah ada dan dipanggil oleh `position-monitor` loop di `src/app.ts` sebelum evaluasi exit.

Catatan batas implementasi live yang harus dipahami dengan benar:
- live **buy** baseline sudah ada melalui `PrivateApi.trade(...)`
- live **sell** sekarang juga sudah dikirim ke private API exchange
- status live order sekarang disinkronkan ke runtime lewat `getOrder(...)` dan bisa bergerak `OPEN -> PARTIALLY_FILLED -> FILLED/CANCELED`
- `cancelAllOrders()` sekarang mencoba `cancelOrder(...)` ke exchange untuk order aktif yang punya `exchangeOrderId`
- duplicate guard sudah ada untuk mencegah BUY aktif ganda pada pair/account yang sama dan SELL aktif ganda pada posisi yang sama
- partial fill delta sekarang bisa diaplikasikan ke runtime position melalui `syncActiveOrders()`, tetapi agregasi posisi buy berulang masih belum final

### 3.6 Telegram flow
- whitelist tetap berbasis `TELEGRAM_ALLOWED_USER_IDS`
- Telegram button UI tetap dipertahankan
- upload legacy JSON account tetap didukung dengan format lama
- menu operasional aktif: `Status`, `Market Watch`, `Hotlist`, `Intelligence Report`, `Spoof Radar`, `Pattern Match`, `Backtest`, `Positions`, `Orders`, `Manual Buy`, `Manual Sell`, `Strategy`, `Risk`, `Accounts`, `Logs`, `Emergency`
- `START` / `STOP` pada Telegram mengubah state runtime (`RUNNING` / `STOPPED`) untuk mengontrol loop aktif; ini bukan proses bootstrap ulang aplikasi

### 3.7 Worker + backtest flow
- `WorkerPoolService` aktif dengan worker `feature`, `pattern`, dan `backtest`
- path preference ke `dist/workers/*.js` tetap dipertahankan bila hasil build ada
- bug timeout deadlock/starvation pada worker pool sudah tertutup dan diverifikasi lewat `tests/worker_timeout_probe.ts`
- `BacktestEngine` sudah bisa load replay dari `pair-history.jsonl`, menjalankan replay signal -> opportunity -> risk exit, dan persist hasil JSON
- regression tambahan `tests/live_execution_hardening_probe.ts` sekarang menjaga live order sync / duplicate guard / cancel-all flow

---

## 4. Keputusan arsitektur dan contract final yang wajib dipertahankan

Keputusan final:
- Telegram button UI tetap UI utama
- whitelist user tetap berbasis `TELEGRAM_ALLOWED_USER_IDS`
- legacy upload account JSON tetap didukung dalam format:
  ```json
  [
    { "name": "REY", "apiKey": "ISI_API_KEY", "apiSecret": "ISI_API_SECRET" }
  ]
  ```
- storage account tetap di `data/accounts/accounts.json`
- mode trading tetap `OFF | ALERT_ONLY | SEMI_AUTO | FULL_AUTO`
- `src/app.ts` tetap sebagai wiring utama runtime
- arsitektur final yang berlaku tetap `scanner -> signal -> intelligence -> execution`

Contract aktif yang harus dipertahankan:

### `SignalCandidate`
Minimal tetap membawa:
- `score`
- `confidence`
- `regime`
- `breakoutPressure`
- `volumeAcceleration`
- `orderbookImbalance`
- `spreadPct`
- `marketPrice`
- `bestBid`
- `bestAsk`
- `liquidityScore`
- `change1m`
- `change5m`
- `contributions`

### `OpportunityAssessment`
Tetap menjadi contract final sebelum execution, minimal membawa:
- `rawScore`
- `finalScore`
- `confidence`
- `pumpProbability`
- `continuationProbability`
- `trapProbability`
- `spoofRisk`
- `edgeValid`
- `marketRegime`
- `entryTiming`
- `recommendedAction`
- `riskContext`
- `historicalMatchSummary`
- `referencePrice`
- `bestBid`
- `bestAsk`
- `spreadPct`
- `liquidityScore`

### `PositionRecord`
`peakPrice` wajib dipertahankan karena trailing stop sekarang bergantung pada drawdown dari peak.

---

## 5. Bug / mismatch penting yang sudah tertutup dan tervalidasi

Sudah tertutup dan jangan dianggap backlog lagi:
- compile blocker support files / TypeScript config
- mismatch contract antara `app.ts`, persistence, state, hotlist, report, Telegram, dan execution
- `markTrade()` pada state runtime
- generic constraint `JsonLinesStore` yang terlalu sempit
- trailing-stop unreachable branch di `src/domain/trading/riskEngine.ts`
- arah `change24hPct` yang sebelumnya terbalik di `src/domain/market/marketWatcher.ts`
- timeout deadlock / starvation risk di `src/services/workerPoolService.ts`
- sinkronisasi baseline worker + backtest regression
- sinkronisasi base URL Indodax ke contract env melalui `IndodaxClient`
- live order metadata tracking di runtime order state
- baseline sync exchange -> runtime order state via `getOrder(...)`
- baseline cancel-all exchange path untuk order aktif live
- duplicate guard untuk live buy/sell order submission

---

## 6. Backlog aktif yang benar-benar tersisa

Backlog nyata saat ini:

### P0 — hardening live execution
- reconciliation yang lebih kaya antara trade response, `getOrder`, `openOrders`, `orderHistory`, dan runtime state lokal
- agregasi partial fill buy menjadi satu posisi logis per pair/account
- capture fee / executed trade detail / average fill yang lebih akurat dari exchange
- recovery sinkronisasi order live setelah restart runtime

### P1 — penguatan intelligence/runtime
- pindahkan pattern matching live path ke worker runtime bila memang dibutuhkan CPU offload konsisten
- tambah reconciliation yang membedakan simulated, optimistic-live, dan confirmed-live outcome dengan jelas
- bila tersedia sumber data yang layak, upgrade `recentTrades` dari inferred flow ke trade print native exchange

### P2 — dokumentasi operasional
- buat README root final
- buat `.env.example` final
- rapikan onboarding runbook sesuai contract terbaru

---

## 7. Next target paling logis

Prioritas berikutnya yang paling rasional:

1. hardening live Indodax execution end-to-end
   - reconciliation multi-sumber (`trade`, `getOrder`, `openOrders`, `orderHistory`)
   - agregasi partial fill
   - fee / executed-trade accounting
   - restart recovery
2. finalisasi README dan `.env.example`
3. bila diperlukan, integrasikan pattern worker ke jalur live intelligence agar offload analytics lebih konsisten

---

## 8. Ringkasan final satu paragraf

Repo aktif `https://github.com/bcbcrey-hue/mafiamarkets-refactor-dua` sudah berada pada status refactor backend yang nyata dan saling terhubung dari env/core/persistence, market watcher, signal engine, intelligence/history, worker runtime, backtest, sampai Telegram operational hooks. Status lama yang menyebut progres masih draft atau belum diterapkan **tidak berlaku lagi**. Sumber kebenaran terbaru sekarang adalah: runtime utama sudah memakai `OpportunityAssessment` sebelum execution, live order baseline buy/sell/cancel/sync sudah ada, duplicate guard sudah aktif, dan polling runtime sudah menyinkronkan order live; tetapi trade-flow market masih inferred dan reconciliation exchange masih perlu pendalaman untuk partial fill aggregation, fee capture, serta recovery pasca-restart.
