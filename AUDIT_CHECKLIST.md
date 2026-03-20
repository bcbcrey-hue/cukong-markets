# AUDIT CHECKLIST (Source-of-Truth: Runtime Wiring Aktual)

## Ringkasan cepat
Audit ini memverifikasi wiring runtime aktual dari `src/bootstrap.ts` → `createApp()` di `src/app.ts` → scheduler/polling → integrasi market/intelligence/execution/telegram/backtest/persistence. Penilaian hanya dari source code yang benar-benar ada dan terhubung saat runtime.

## BENAR
- [x] **Market scanning terhubung runtime**  
  File inti: `src/app.ts`, `src/domain/market/marketWatcher.ts`, `src/integrations/indodax/client.ts`  
  Bukti: job `market-scan` memanggil `batchSnapshot()` lalu persist snapshot/signal/opportunity.
- [x] **Scoring baseline terhubung runtime**  
  File inti: `src/app.ts`, `src/domain/signals/signalEngine.ts`, `src/domain/signals/scoreCalculator.ts`
- [x] **Probability & edge validation terhubung runtime**  
  File inti: `src/domain/intelligence/opportunityEngine.ts`, `probabilityEngine.ts`, `edgeValidator.ts`
- [x] **Entry timing terhubung runtime**  
  File inti: `src/domain/intelligence/opportunityEngine.ts`, `entryTimingEngine.ts`
- [x] **Hotlist ranking terhubung runtime**  
  File inti: `src/app.ts`, `src/domain/market/hotlistService.ts`
- [x] **Duplicate order guard nyata**  
  File inti: `src/domain/trading/executionEngine.ts` (`hasActiveOrder`, dipakai sebelum buy/sell/auto).
- [x] **Fill reconciliation nyata (live sync + trade history fallback)**  
  File inti: `src/domain/trading/executionEngine.ts` (`syncActiveOrders`, `syncLiveOrder`, `loadTradeStats*`, `loadOrderHistorySnapshot*`, `applyFillDelta`).
- [x] **Recovery startup untuk live active orders nyata**  
  File inti: `src/app.ts` (`recoverLiveOrdersOnStartup` saat start), `executionEngine.ts`.
- [x] **Backtest replay nyata dari histori snapshot persisted**  
  File inti: `src/domain/backtest/replayLoader.ts`, `backtestEngine.ts`, `src/services/persistenceService.ts`.
- [x] **Worker offloading nyata (opsional via settings/env, fallback inline tersedia)**  
  File inti: `src/services/workerPoolService.ts`, `src/workers/*.ts`, `src/app.ts`.
- [x] **Persistence aktif sebagai sumber state runtime**  
  File inti: `src/services/persistenceService.ts`, `stateService.ts`, `settingsService.ts`, `orderManager.ts`, `positionManager.ts`, `journalService.ts`.

## PARSIAL
- [~] **Execution hardening**  
  File inti: `executionEngine.ts`, `riskEngine.ts`  
  Catatan mismatch: hardening order/fill/recovery ada, tetapi belum terbukti memiliki mekanisme restart safety di luar local JSON state (tidak ada idempotency key lintas restart selain data order/position yang sudah tersimpan).
- [~] **Monitoring order aktif via callback exchange**  
  File inti: `src/integrations/indodax/callbackServer.ts`, `src/domain/trading/executionEngine.ts`, `src/app.ts`  
  Catatan mismatch: callback accepted sekarang memicu reconciliation berdasarkan `exchangeOrderId`, tetapi payload callback yang tidak membawa `order_id/orderId/id` belum bisa mengubah state order/position.

## SALAH
- [ ] **Tidak ada temuan klaim yang terbukti SALAH total** berdasarkan code saat ini (yang ada dominan status parsial/belum terbukti).

## BELUM TERBUKTI
- [?] **Evaluasi posisi terbuka “langsung” di startup**  
  File inti: `src/app.ts`, `executionEngine.ts`  
  Catatan: sekarang dieksekusi eksplisit sesudah `recoverLiveOrdersOnStartup`, tetapi belum ada probe khusus yang mensimulasikan seluruh skenario startup dengan posisi open + slippage ekstrem.
- [?] **Module util/domain tertentu berperan di jalur runtime utama**  
  File inti: `src/domain/market/pairUniverse.ts` (`top`,`get`,`exportMetrics`), `src/domain/market/marketWatcher.ts` (`calcImbalance`,`computeLiquidityScore`), `src/domain/accounts/accountValidator.ts` (class `AccountValidator`), `src/domain/trading/positionManager.ts` (`forceClose`)  
  Catatan: ada implementasi, tetapi pada audit ini tidak ditemukan penggunaan runtime nyata.

## CAKUPAN AUDIT PER-FILE
Status: **RELEVAN DAN SUDAH DIAUDIT** kecuali ditandai lain.

### Root/runtime
- `src/bootstrap.ts` — entrypoint, init runtime dir, start app.
- `src/app.ts` — wiring utama runtime, scheduler jobs, server start/stop.

### src/domain/market
- `pairUniverse.ts` — universe tickers (sebagian method belum terbukti dipakai: `top/get/exportMetrics`).
- `marketWatcher.ts` — snapshot builder runtime market scan (sebagian helper belum dipakai: `calcImbalance/computeLiquidityScore`).
- `hotlistService.ts` — ranking hotlist runtime.
- `pairClassifier.ts` — dipakai scoring.
- `tickerSnapshot.ts` — dipakai scoring.
- `orderbookSnapshot.ts` — dipakai scoring.

### src/domain/signals
- `signalEngine.ts` — scoring pipeline runtime.
- `scoreCalculator.ts` — baseline score + contributions.
- `strategies/breakoutRetest.ts` — dipakai score.
- `strategies/hotRotation.ts` — dipakai score.
- `strategies/orderbookImbalance.ts` — dipakai score.
- `strategies/silentAccumulation.ts` — dipakai score.
- `strategies/volumeSpike.ts` — dipakai score.

### src/domain/intelligence
- `opportunityEngine.ts` — assess opportunity runtime.
- `featurePipeline.ts` — microstructure synthesis runtime/worker-inline.
- `probabilityEngine.ts` — probability runtime.
- `edgeValidator.ts` — edge validation runtime.
- `entryTimingEngine.ts` — timing runtime.
- `scoreExplainer.ts` — reasoning text runtime.

### src/domain/microstructure
- `accumulationDetector.ts` — dipakai feature pipeline.
- `icebergDetector.ts` — dipakai feature pipeline.
- `tradeClusterDetector.ts` — dipakai feature pipeline.
- `spoofDetector.ts` — dipakai feature pipeline.

### src/domain/history
- `pairHistoryStore.ts` — persist + context runtime.
- `patternMatcher.ts` — dipakai context/historical matching.
- `regimeClassifier.ts` — dipakai context/historical matching.
- `patternLibrary.ts` — data pattern matcher.

### src/domain/trading
- `executionEngine.ts` — live/simulated buy-sell, sync/recovery/evaluate.
- `orderManager.ts` — order state persistence.
- `positionManager.ts` — position state persistence (`forceClose` belum terbukti dipakai).
- `riskEngine.ts` — guard entry/exit/stops runtime.

### src/domain/backtest
- `backtestEngine.ts` — run + persist backtest.
- `replayLoader.ts` — load replay dari pair history.
- `metrics.ts` — metric backtest.

### src/domain/accounts + settings
- `accounts/accountStore.ts` — account storage/legacy upload.
- `accounts/accountRegistry.ts` — account runtime registry.
- `accounts/accountValidator.ts` — validasi account (`AccountValidator` class belum terbukti dipakai langsung).
- `settings/settingsService.ts` — runtime settings state.

### src/services
- `persistenceService.ts` — storage utama runtime state/data.
- `stateService.ts` — runtime state.
- `pollingService.ts` — adaptor scheduler.
- `workerPoolService.ts` — worker runtime + fallback inline.
- `healthService.ts` — health snapshot runtime.
- `journalService.ts` — journaling runtime.
- `summaryService.ts` — execution/trade summaries.
- `reportService.ts` — formatter report Telegram.

### src/integrations/indodax
- `client.ts` — public/private client factory.
- `publicApi.ts` — ticker/depth fetch.
- `privateApi.ts` — trade/order/history API.
- `callbackServer.ts` — callback ingress (BELUM TERBUKTI terhubung ke mutation order state runtime).
- `mapper.ts` — **RELEVAN TAPI BELUM TERBUKTI BERPERAN** (tidak ditemukan dipakai runtime utama).

### src/integrations/telegram
- `bot.ts` — bot init/lifecycle.
- `handlers.ts` — menu/action wiring ke services domain.
- `keyboards.ts` — UI callback schema.
- `callbackRouter.ts` — callback parsing.
- `uploadHandler.ts` — legacy account upload.
- `auth.ts` — access gate.

### src/server
- `appServer.ts` — HTTP ingress `/` & `/healthz` runtime.

### src/storage
- `jsonStore.ts` — JSON/JSONL backend storage runtime.

### src/workers
- `featureWorker.ts` — worker task feature.
- `patternWorker.ts` — worker task pattern.
- `backtestWorker.ts` — worker task backtest.

### scripts/deploy
- `scripts/render-nginx-conf.mjs` — renderer config nginx (ops/deploy helper).
- `deploy/nginx/cukong-markets.nginx.conf.template` — template deploy.
- `deploy/nginx/cukong-markets.nginx.conf` — generated contoh config.

## Langkah perbaikan konkret (sesi berikutnya)
1. Tambahkan probe integrasi callback-driven reconciliation dengan payload valid/invalid untuk memverifikasi perubahan order state.
2. Tambahkan probe startup khusus untuk kombinasi: open live orders + open positions + trigger auto-exit saat boot.
3. Pertimbangkan kontrol runtime Telegram untuk mem-pause worker pool bila diperlukan mode hemat resource.
4. Bersihkan dead/unused wiring (contoh `mapper.ts`, method helper yang tidak dipakai) atau buktikan pemakaian nyata via runtime path.
