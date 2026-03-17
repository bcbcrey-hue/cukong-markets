# REFACTOR_LOG

Repository aktif: `https://github.com/bcbcrey-hue/mafiamarkets`

Dokumen ini adalah **satu sumber kebenaran** untuk status refactor terbaru yang **sudah terimplementasi** di repo aktif. Gunakan dokumen ini sebagai konteks utama untuk sesi berikutnya.

---

## 1. Status project saat ini

Status runtime/backend saat ini:
- `yarn lint` lulus
- `yarn build` lulus
- regression test backend lulus via:
  `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-regression-2 LOG_DIR=/tmp/mafiamarkets-regression-2/logs TEMP_DIR=/tmp/mafiamarkets-regression-2/tmp yarn tsx /app/tests/runtime_backend_regression.ts`

Jalur runtime aktif yang sekarang berlaku:

`market snapshot -> signal -> feature pipeline -> historical context -> probability -> edge validation -> entry timing -> opportunity -> hotlist -> execution`

Artinya:
- scanner/market baseline sudah hidup
- signal/scoring baseline sudah sinkron dengan contract aktif
- layer intelligence/history/microstructure sudah terhubung ke runtime
- execution/risk sudah membaca `OpportunityAssessment`, bukan lagi hanya signal baseline
- persistence sudah menyimpan snapshot, signal, opportunity, dan anomaly event

Fokus yang **belum selesai** saat ini:
- hardening live Indodax execution semantics
- enrichment report/menu Telegram untuk intelligence report yang lebih kaya

---

## 2. Batch yang sudah selesai

### Batch 1A — Core contract foundation
Selesai.

Hasil utama:
- `env` dijadikan single source of truth berbasis camelCase
- `core/types.ts` dijadikan pusat contract aktif lintas runtime
- pemisahan final ditegaskan:
  - `SignalCandidate` = output signal/scoring baseline
  - `OpportunityAssessment` = output intelligence final sebelum execution

### Batch 1B — Core runtime foundation
Selesai.

Hasil utama:
- storage JSON/JSONL dibersihkan
- logger, scheduler, dan shutdown dibuat type-safe dan konsisten
- blocker generics/runtime support ditutup

### Batch 1C — State and persistence layer reset
Selesai.

Hasil utama:
- persistence gateway tunggal aktif
- state/settings/health/journal disejajarkan ke contract baru
- runtime state sekarang menjadi sumber state aktif lintas app

### Batch 1D — Telegram contract reset
Selesai.

Hasil utama:
- auth whitelist tetap aktif
- callback router, keyboard, upload account JSON, handlers, dan wrapper bot disejajarkan
- Telegram button UI tetap dipertahankan sebagai UI utama

### Batch 1E — Foundation contract alignment + runtime wiring
Selesai.

Hasil utama:
- `reportService`, account layer, `app.ts`, dan `bootstrap.ts` disambungkan ke fondasi baru
- registry account runtime aktif
- path runtime storage disejajarkan ke env aktif

### Batch 2A — Indodax + market baseline connection
Selesai.

Hasil utama:
- public/private Indodax baseline aktif
- `pairUniverse`, `marketWatcher`, dan `hotlistService` terhubung ke app wiring
- market snapshot baseline sudah tersedia sebagai input signal pipeline

### Batch 2B — Market feature builders + scoring alignment
Selesai.

Hasil utama:
- ticker features dan orderbook features aktif
- classifier pair/tier/regime hint aktif
- scoring strategy baseline dipecah per feature
- `signalEngine` sinkron ke `SignalCandidate` aktif

### Batch 2C — Trading layer contract reset
Selesai.

Hasil utama:
- order/position/risk/execution disejajarkan ke contract aktif
- auto/manual execution baseline tersedia
- cancel-all / sell-all tersedia

### Batch 3A — Intelligence/history runtime integration + contract finalization
Selesai.

Hasil utama:
- layer baru `microstructure`, `history`, dan `intelligence` ditambahkan dan disambungkan ke runtime
- `OpportunityAssessment` difinalkan sebagai contract aktif sebelum execution
- hotlist sekarang bisa diranking dari output opportunity
- persistence JSONL untuk snapshot/signal/opportunity/anomaly event sudah dipakai runtime
- `PositionRecord` menyimpan `peakPrice` agar trailing stop valid
- mismatch support files / utils / report / telegram contract yang tersisa sudah ditutup

### Batch 3B — Worker runtime + backtest baseline
Selesai.

Hasil utama:
- `WorkerPoolService` aktif dengan worker nyata untuk `feature`, `pattern`, dan `backtest`
- worker sekarang memprioritaskan `dist/workers/*.js` bila hasil build tersedia agar runtime stabil
- `OpportunityEngine` bisa meng-offload feature task ke worker pool
- `BacktestEngine` dapat load replay dari pair-history JSONL, menjalankan replay signal->opportunity, dan menyimpan hasil ke `data/backtest/*.json`
- app runtime sekarang membawa lifecycle worker (start/stop) dan worker health snapshot ke heartbeat
- regression test backend sekarang mencakup worker pool, backtest replay, persist file hasil, dan probe timeout recovery

---

## 3. File yang berubah

### Batch 1A
- `src/config/env.ts`
- `src/core/types.ts`

### Batch 1B
- `src/storage/jsonStore.ts`
- `src/core/logger.ts`
- `src/core/scheduler.ts`
- `src/core/shutdown.ts`

### Batch 1C
- `src/services/persistenceService.ts`
- `src/services/stateService.ts`
- `src/services/healthService.ts`
- `src/services/journalService.ts`
- `src/domain/settings/settingsService.ts`

### Batch 1D
- `src/integrations/telegram/auth.ts`
- `src/integrations/telegram/callbackRouter.ts`
- `src/integrations/telegram/keyboards.ts`
- `src/integrations/telegram/uploadHandler.ts`
- `src/integrations/telegram/handlers.ts`
- `src/integrations/telegram/bot.ts`

### Batch 1E
- `src/services/reportService.ts`
- `src/domain/accounts/accountValidator.ts`
- `src/domain/accounts/accountStore.ts`
- `src/domain/accounts/accountRegistry.ts`
- `src/app.ts`
- `src/bootstrap.ts`

### Batch 2A
- `src/integrations/indodax/publicApi.ts`
- `src/integrations/indodax/privateApi.ts`
- `src/integrations/indodax/client.ts`
- `src/domain/market/pairUniverse.ts`
- `src/domain/market/marketWatcher.ts`
- `src/domain/market/hotlistService.ts`

### Batch 2B
- `src/domain/market/tickerSnapshot.ts`
- `src/domain/market/orderbookSnapshot.ts`
- `src/domain/market/pairClassifier.ts`
- `src/domain/signals/strategies/volumeSpike.ts`
- `src/domain/signals/strategies/orderbookImbalance.ts`
- `src/domain/signals/strategies/silentAccumulation.ts`
- `src/domain/signals/strategies/breakoutRetest.ts`
- `src/domain/signals/strategies/hotRotation.ts`
- `src/domain/signals/scoreCalculator.ts`
- `src/domain/signals/signalEngine.ts`

### Batch 2C
- `src/domain/trading/orderManager.ts`
- `src/domain/trading/positionManager.ts`
- `src/domain/trading/riskEngine.ts`
- `src/domain/trading/executionEngine.ts`

### Batch 3A — file baru
- `src/utils/math.ts`
- `src/domain/microstructure/accumulationDetector.ts`
- `src/domain/microstructure/spoofDetector.ts`
- `src/domain/microstructure/icebergDetector.ts`
- `src/domain/microstructure/tradeClusterDetector.ts`
- `src/domain/history/regimeClassifier.ts`
- `src/domain/history/patternLibrary.ts`
- `src/domain/history/patternMatcher.ts`
- `src/domain/history/pairHistoryStore.ts`
- `src/domain/intelligence/featurePipeline.ts`
- `src/domain/intelligence/probabilityEngine.ts`
- `src/domain/intelligence/edgeValidator.ts`
- `src/domain/intelligence/scoreExplainer.ts`
- `src/domain/intelligence/entryTimingEngine.ts`
- `src/domain/intelligence/opportunityEngine.ts`
- `tests/runtime_backend_regression.ts`

### Batch 3A — file support/contract sync yang dipatch lagi
- `tsconfig.json`
- `src/utils/time.ts`
- `src/utils/retry.ts`
- `src/utils/validators.ts`
- `src/core/metrics.ts`
- `src/services/pollingService.ts`
- `src/integrations/http/httpClient.ts`
- `src/integrations/indodax/mapper.ts`
- `src/app.ts`
- `src/core/types.ts`
- `src/services/persistenceService.ts`
- `src/services/stateService.ts`
- `src/services/reportService.ts`
- `src/domain/accounts/accountStore.ts`
- `src/domain/market/hotlistService.ts`
- `src/domain/market/marketWatcher.ts`
- `src/domain/signals/signalEngine.ts`
- `src/domain/trading/executionEngine.ts`
- `src/domain/trading/riskEngine.ts`
- `src/domain/trading/positionManager.ts`
- `src/integrations/telegram/handlers.ts`
- `src/integrations/indodax/privateApi.ts`

### Batch 3B
- `src/services/workerPoolService.ts`
- `src/workers/featureWorker.ts`
- `src/workers/patternWorker.ts`
- `src/workers/backtestWorker.ts`
- `src/domain/backtest/replayLoader.ts`
- `src/domain/backtest/metrics.ts`
- `src/domain/backtest/backtestEngine.ts`
- `src/app.ts`
- `src/services/persistenceService.ts`
- `src/domain/intelligence/opportunityEngine.ts`
- `tests/runtime_backend_regression.ts`
- `tests/worker_timeout_probe.ts`

---

## 4. Keputusan arsitektur / final contract yang harus dipertahankan

Keputusan arsitektur final:
- Telegram **button UI** tetap menjadi UI utama
- whitelist user tetap berbasis `TELEGRAM_ALLOWED_USER_IDS`
- legacy upload account JSON tetap didukung dalam format:
  ```json
  [
    { "name": "REY", "apiKey": "ISI_API_KEY", "apiSecret": "ISI_API_SECRET" }
  ]
  ```
- runtime accounts tetap disimpan di:
  `data/accounts/accounts.json`
- mode trading tetap:
  `OFF | ALERT_ONLY | SEMI_AUTO | FULL_AUTO`
- `src/app.ts` tetap menjadi wiring utama runtime
- arsitektur final yang sekarang berlaku:
  `scanner -> signal -> intelligence -> execution`

Contract aktif yang wajib dipertahankan:

### `SignalCandidate`
Harus dipertahankan sebagai output signal baseline yang sudah membawa konteks runtime berikut:
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
Harus dipertahankan sebagai contract final sebelum execution, minimal dengan informasi:
- `rawScore`
- `finalScore`
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
Harus mempertahankan `peakPrice` karena trailing stop sekarang bergantung pada drawdown dari peak, bukan lagi formula lama yang tidak valid.

---

## 5. Blocker / bug yang sudah ditutup

Blocker/bug penting yang sudah ditutup sampai status terbaru:
- compile blocker lintas support files (`tsconfig`, retry/time/validators/metrics/http/mapper)
- mismatch contract antara `app.ts`, `PersistenceService`, `StateService`, `HotlistService`, `ReportService`, dan Telegram handlers
- mismatch antara market snapshot baseline vs signal engine input
- mismatch antara signal baseline vs execution/risk contract aktif
- `markTrade()` missing pada state runtime
- constructor mismatch pada `AccountStore` / `JsonStore`
- generic constraint `JsonLinesStore` yang terlalu sempit untuk journal entry
- formula `inferEntryPrice()` yang tidak realistis sudah dieliminasi dari jalur execution aktif
- trailing-stop branch yang sebelumnya unreachable di `src/domain/trading/riskEngine.ts`
- arah perhitungan `change24hPct` yang terbalik di `src/domain/market/marketWatcher.ts`
- deadlock/starvation risk pada timeout path `WorkerPoolService.enqueue()`

---

## 6. Backlog yang belum selesai

Belum selesai dan tetap menjadi backlog aktif:
- enrichment report Telegram:
  - Intelligence Report
  - Spoof Radar
  - Pattern Match
  - Backtest Summary
- hardening live integration Indodax:
  - response mapping live order
  - fill / partial fill semantics
  - cancel lifecycle
  - sinkronisasi order live vs runtime state
- final README dan `.env.example` yang sepenuhnya sinkron dengan contract aktif terbaru

---

## 7. Next target paling logis

Prioritas paling logis berikutnya adalah **hardening live integration + intelligence report integration**:

1. hardening live Indodax execution
   - response mapping live order
   - fill / partial fill semantics
   - cancel lifecycle
   - sinkronisasi order live vs runtime state
2. enrichment report/menu Telegram berbasis output opportunity
   - Intelligence Report
   - Spoof Radar
   - Pattern Match
   - Backtest Summary
3. finalisasi README dan `.env.example` sesuai contract aktif terbaru

---

## 8. Ringkasan satu paragraf

Repo aktif `bcbcrey-hue/mafiamarkets` sekarang sudah berada pada status refactor terimplementasi yang konsisten dari fondasi contract, runtime core, persistence/state, Telegram, wiring app, market baseline, signal pipeline, trading baseline, intelligence/history runtime, sampai worker runtime dan backtest baseline. Status lama yang menyatakan refactor “baru draft/belum diterapkan” **tidak lagi berlaku**. Sumber kebenaran yang harus dipakai ke depan adalah state runtime aktif saat ini: `scanner -> signal -> intelligence -> execution`, dengan `OpportunityAssessment` sebagai contract final sebelum execution, worker/backtest baseline sudah tersedia, dan fokus berikutnya bergeser ke live hardening + report integration.
