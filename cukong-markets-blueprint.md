# cukong-markets Upgrade Blueprint

## Prinsip utama

* Jangan asumsikan ada layer yang benar-benar aman; semua layer boleh diaudit ulang, dibongkar, dan disusun ulang bila itu mengurangi technical debt dan rework di belakang.
* Fokus tetap pada hasil akhir yang stabil, sinkron, production-ready, dan sesuai tujuan bot.
* Arsitektur tetap modular TypeScript, production-ready, dan tetap memakai Telegram button UI sebagai UI utama.
* Prioritaskan **sekali bangun dengan benar** daripada menambal layer lama yang diam-diam masih salah.
* Namun UX inti yang diinginkan tetap dipertahankan: Telegram button UI, whitelist user, legacy account upload format, storage akun di `data/accounts/accounts.json`, dan mode trading `OFF | ALERT\_ONLY | SEMI\_AUTO | FULL\_AUTO`.

## Target akhir sistem

Bot menjadi **mesin intelijen market Indodax** yang:

1. membaca jejak bandar,
2. memisahkan peluang asli vs jebakan,
3. memberi score + alasan + confidence,
4. memutuskan apakah edge valid,
5. mengeksekusi atau menunggu sesuai mode trading.

\---

# 1\) Arsitektur upgrade

## Layer yang dipertahankan

* `src/app.ts` sebagai wiring utama, tetapi dirapikan hanya di titik mismatch.
* Scanner market existing tetap dipakai sebagai sumber snapshot awal.
* Hotlist + score awal tetap dipakai sebagai baseline ranking.
* Execution engine existing tetap dipakai sebagai execution shell.
* Telegram handlers/menu existing dipertahankan secara UX, hanya sinkronisasi contract/service.

## Layer baru yang ditambahkan

Tambahkan domain baru:

* `src/domain/intelligence/`
* `src/domain/microstructure/`
* `src/domain/history/`
* `src/domain/backtest/`
* `src/workers/`

### Komponen baru utama

1. **Market Intelligence Engine**

   * menggabungkan semua sinyal akhir
   * menghasilkan `OpportunityAssessment`
2. **Orderbook Forensics Engine**

   * spoof/iceberg detection
   * orderbook pressure realism
3. **Trade Flow Engine**

   * clustering, burst, sweep, acceleration
4. **Historical Context Engine**

   * pattern memory, similarity score, regime tagging
5. **Probability Engine**

   * menghitung probabilitas pump dan confidence
6. **Edge Validator**

   * anti-fakeout, anti-spoof, anti-thin-book traps
7. **Entry Timing Engine**

   * leading entry timing, not just lagging breakout confirmation
8. **Worker Runtime**

   * CPU-heavy analytics dijalankan di worker threads / child process
9. **Backtest Engine**

   * replay historical snapshots/trades untuk evaluasi signal stack

\---

# 2\) Flow logika final

## Flow real-time

1. `MarketWatcher` ambil ticker + orderbook + trade prints / inferred flow.
2. Snapshot masuk ke `FeaturePipeline`.
3. `FeaturePipeline` membentuk feature set per pair:

   * volume acceleration
   * orderbook imbalance
   * spoof pressure
   * iceberg suspicion
   * cluster intensity
   * sweep behavior
   * absorption / accumulation footprints
   * breakout pressure
   * spread quality
   * liquidity realism
   * regime tag
4. Feature set diperkaya `HistoricalContextEngine`.
5. `ProbabilityEngine` hitung:

   * pump probability
   * trap probability
   * spoof risk
   * continuation probability
6. `EdgeValidator` menyaring peluang palsu.
7. `ScoreExplainer` membuat breakdown bobot dan alasan.
8. `ExecutionEngine` membaca output final:

   * ALERT\_ONLY → hanya kirim alert + alasan
   * SEMI\_AUTO → kirim rekomendasi + tombol aksi
   * FULL\_AUTO → execute jika edge valid dan risk pass

## Output final per pair

Struktur hasil akhir:

* `pair`
* `score`
* `pumpProbability`
* `trapRisk`
* `confidence`
* `edgeValid`
* `marketRegime`
* `entryTiming`
* `reasons\[]`
* `warnings\[]`
* `recommendedAction`
* `riskContext`
* `historicalMatchSummary`

\---

# 3\) Fitur upgrade sesuai tujuan

## A. Deteksi akumulasi bandar

Implementasi lewat kombinasi:

* bid absorption vs ask depletion
* repeated refill pada bid setelah hit
* price compression dengan net aggressive buy meningkat
* shallow pullback after aggressive lifting
* hidden support persistence

File baru:

* `src/domain/microstructure/accumulationDetector.ts`

Output:

* `accumulationScore`
* `absorptionEvidence\[]`
* `stealthSupportDetected`

## B. Deteksi spoofing orderbook

Implementasi:

* membandingkan kemunculan dan hilangnya size besar dalam waktu singkat
* price-distance sensitivity dari fake wall
* cancel-to-persist ratio
* repeated wall flash pattern
* one-sided pressure tanpa trade follow-through

File baru:

* `src/domain/microstructure/spoofDetector.ts`

Output:

* `spoofRiskScore`
* `suspectedLevels\[]`
* `spoofDirection`

## C. Deteksi trade clustering

Implementasi:

* burst of prints dalam rolling windows
* same-side aggression concentration
* clustering by time, size, and directional dominance
* micro-sweep detection

File baru:

* `src/domain/microstructure/tradeClusterDetector.ts`

Output:

* `clusterScore`
* `aggressionBias`
* `sweepDetected`

## D. Deteksi percepatan volume

Upgrade dari volume spike biasa menjadi:

* multi-window acceleration
* percentile vs recent baseline
* acceleration persistence
* volume + range + trade count coupling

File baru/upgrade:

* `src/domain/signals/strategies/volumeAcceleration.ts`

## E. Probability score potensi pump

Jangan pakai satu score linear saja. Buat probability layer:

* logistic-style weighted scoring atau calibrated heuristic probability
* pisahkan `pumpProbability` dari `rawScore`
* sediakan `confidenceScore`

File baru:

* `src/domain/intelligence/probabilityEngine.ts`

## F. Validasi edge

Validasi sebelum dianggap layak trading:

* spread pass
* liquidity pass
* spoof risk under threshold
* confirmation diversity minimal 3 sumber edge
* no late-entry penalty
* no exhaustion penalty

File baru:

* `src/domain/intelligence/edgeValidator.ts`

## G. Justifikasi bobot skor

Setiap score harus explainable:

* kontribusi feature per bobot
* alasan dominan
* alasan pengurang
* warning terhadap jebakan

File baru:

* `src/domain/intelligence/scoreExplainer.ts`

## H. Anti-spoof logic

Spoof detector jangan hanya jadi sinyal tambahan, tapi juga filter keras:

* penalti score
* blok auto-entry
* tandai pair sebagai deceptive

## I. Historical context

Simpan ring buffer / rolling dataset per pair:

* last N snapshots
* last N orderbook states
* feature deltas
* last anomaly events
* last executed trade outcomes

File baru:

* `src/domain/history/pairHistoryStore.ts`
* `src/domain/history/patternLibrary.ts`
* `src/domain/history/regimeClassifier.ts`

## J. Entry timing leading

Jangan menunggu candle konfirmasi telat. Timing engine membaca:

* absorption + cluster + ask thinning
* breakout pressure sebelum breakout penuh
* false-break filter
* pullback quality

File baru:

* `src/domain/intelligence/entryTimingEngine.ts`

## K. Market microstructure realism

Model sinyal harus aware terhadap:

* spread
* book depth quality
* refill behavior
* wall persistence
* sweep vs passive absorption
* thin market traps

## L. Backtesting engine

Bangun engine replay:

* membaca file snapshot historical
* replay timeline per pair
* jalankan feature pipeline
* simpan outcome metrics

File baru:

* `src/domain/backtest/backtestEngine.ts`
* `src/domain/backtest/replayLoader.ts`
* `src/domain/backtest/metrics.ts`

## M. Deteksi spoof / iceberg

Selain spoof wall, deteksi iceberg lewat:

* repeated fills pada level yang tampak tidak berubah signifikan
* passive absorption with hidden refill hints
* discrepancy between visible liquidity and executed flow

File baru:

* `src/domain/microstructure/icebergDetector.ts`

## N. Historical pattern matching

Cari pola sekarang vs histori lokal pair:

* pre-pump accumulation template
* fake breakout template
* squeeze continuation template
* distribution trap template

File baru:

* `src/domain/history/patternMatcher.ts`

## O. Worker berbasis Node.js

CPU-heavy analytics pindah ke worker:

* pattern matching
* probabilistic scoring
* backtest replay
* historical similarity scanning

File baru:

* `src/workers/featureWorker.ts`
* `src/workers/patternWorker.ts`
* `src/workers/backtestWorker.ts`
* `src/services/workerPoolService.ts`

\---

# 4\) Contract type baru

Tambahkan di `src/core/types.ts`:

* `OrderbookLevel`
* `TradePrint`
* `MicrostructureFeatures`
* `HistoricalContext`
* `ProbabilityAssessment`
* `EdgeValidationResult`
* `EntryTimingAssessment`
* `OpportunityAssessment`
* `PatternMatchResult`
* `BacktestRunConfig`
* `BacktestRunResult`

Contoh shape penting:

```ts
export interface OpportunityAssessment {
  pair: string;
  rawScore: number;
  finalScore: number;
  pumpProbability: number;
  trapProbability: number;
  confidence: number;
  edgeValid: boolean;
  marketRegime: string;
  entryTiming: {
    state: 'EARLY' | 'READY' | 'LATE' | 'AVOID';
    quality: number;
    reason: string;
  };
  reasons: string\[];
  warnings: string\[];
  featureBreakdown: Array<{
    feature: string;
    weight: number;
    contribution: number;
    note: string;
  }>;
}
```

\---

# 5\) File-by-file implementation strategy

## Batch A — Stabilization wajib dulu

Tujuan: hilangkan blocker tanpa bongkar UX/fondasi.

Perbaiki total:

* `src/config/env.ts`
* `src/core/types.ts`
* `src/core/scheduler.ts`
* `src/core/shutdown.ts`
* `src/storage/jsonStore.ts`
* `src/services/persistenceService.ts`
* `src/services/stateService.ts`
* `src/services/healthService.ts`
* `src/services/journalService.ts`
* `src/domain/settings/settingsService.ts`
* `src/integrations/telegram/auth.ts`
* `src/integrations/telegram/callbackRouter.ts`
* `src/integrations/telegram/keyboards.ts`
* `src/integrations/telegram/uploadHandler.ts`
* `src/integrations/telegram/handlers.ts`
* `src/integrations/indodax/client.ts`
* `src/app.ts`
* `src/bootstrap.ts`

Prinsip batch ini:

* samakan semua contract `env`
* samakan semua contract service
* hilangkan generic/type malformed
* sinkronkan Telegram callbacks dengan handlers
* sinkronkan persistence paths

## Batch B — Intelligence feature pipeline

Tambah:

* `src/domain/microstructure/accumulationDetector.ts`
* `src/domain/microstructure/spoofDetector.ts`
* `src/domain/microstructure/icebergDetector.ts`
* `src/domain/microstructure/tradeClusterDetector.ts`
* `src/domain/intelligence/featurePipeline.ts`
* `src/domain/intelligence/probabilityEngine.ts`
* `src/domain/intelligence/edgeValidator.ts`
* `src/domain/intelligence/scoreExplainer.ts`
* `src/domain/intelligence/entryTimingEngine.ts`
* `src/domain/intelligence/opportunityEngine.ts`

## Batch C — Historical context \& pattern layer

Tambah:

* `src/domain/history/pairHistoryStore.ts`
* `src/domain/history/regimeClassifier.ts`
* `src/domain/history/patternLibrary.ts`
* `src/domain/history/patternMatcher.ts`

## Batch D — Worker runtime

Tambah:

* `src/services/workerPoolService.ts`
* `src/workers/featureWorker.ts`
* `src/workers/patternWorker.ts`
* `src/workers/backtestWorker.ts`

## Batch E — Backtest engine

Tambah:

* `src/domain/backtest/replayLoader.ts`
* `src/domain/backtest/backtestEngine.ts`
* `src/domain/backtest/metrics.ts`
* Telegram/report hooks untuk menjalankan dan merangkum backtest

## Batch F — UI/report integration

Upgrade:

* `src/services/reportService.ts`
* `src/integrations/telegram/handlers.ts`
* `src/integrations/telegram/keyboards.ts`

Tambahkan menu:

* Intelligence Report
* Spoof Radar
* Pattern Match
* Backtest
* Edge Validation

\---

# 6\) Integrasi dengan layer yang sudah matang

## Scanner market existing tetap dipakai

Jangan buang:

* ticker snapshot
* orderbook snapshot
* pair universe
* hotlist service
* signal engine baseline

Yang dilakukan:

* hasil scanner awal masuk ke feature pipeline baru
* score awal dipakai sebagai baseline prior

## Trading layer existing tetap dipakai

Jangan bongkar:

* order manager
* position manager
* risk engine
* execution engine shell

Yang dilakukan:

* `ExecutionEngine` membaca `OpportunityAssessment`
* auto entry hanya jika `edgeValid === true`
* jika `spoofRisk` tinggi → block buy
* jika `entryTiming.state === 'LATE'` → downgrade action

## Telegram layer existing tetap dipakai

Jangan ubah UX harian yang sudah familiar.
Yang dilakukan:

* sinkronkan handler/service contracts
* tambah report baru, bukan redesign total UI

\---

# 7\) Aturan scoring final

Gunakan 3 lapis penilaian:

## Lapis 1 — Raw Opportunity Score

Berasal dari:

* volume acceleration
* orderbook imbalance
* accumulation
* clustering
* breakout pressure
* liquidity quality

## Lapis 2 — Risk / Deception Adjustment

Penalty dari:

* spoof risk
* thin book trap
* wide spread
* exhaustion pattern
* fake wall behavior

## Lapis 3 — Final Actionability

Ditentukan oleh:

* pump probability
* confidence
* edge validation
* entry timing
* account risk availability

Rumus final bukan angka tunggal kaku, tapi pipeline keputusan.

\---

# 8\) Contoh action policy

## ALERT\_ONLY

* kirim hotlist + alasan + probability + warning

## SEMI\_AUTO

* kirim rekomendasi action:

  * WATCH
  * PREPARE\_ENTRY
  * CONFIRM\_ENTRY
  * AVOID
* tombol manual buy/sell tetap tersedia

## FULL\_AUTO

Entry hanya jika semua syarat terpenuhi:

* `pumpProbability >= threshold`
* `confidence >= threshold`
* `edgeValid === true`
* `spoofRisk < max`
* `entryTiming.state in \['EARLY', 'READY']`
* `riskEngine.canEnter() === true`

\---

\# 8A) Execution hardening \& entry/exit policy sinkronisasi



Bagian ini adalah sinkronisasi lanjutan terhadap blueprint inti, tanpa mengganti arsitektur lama. Fokusnya adalah memperjelas perilaku execution nyata setelah `OpportunityAssessment` lolos, terutama untuk hardening live order, agresivitas BUY, disiplin SELL/TP, dan akurasi reconciliation.



\## Prinsip tambahan

\- Recovery startup live orders, openOrders-first reconciliation, fallback `getOrder(...)`, dan duplicate guard dianggap sebagai baseline yang sudah ada.

\- Iterasi berikutnya tidak boleh berhenti di recovery/accounting saja; policy entry/exit baseline juga harus dikunci.

\- README root dan `.env.example` tidak menjadi prioritas sebelum hardening execution inti benar-benar stabil.



\## Prioritas hardening inti

1\. agregasi repeated partial fill buy menjadi satu posisi logis per pair/account

2\. tarik fee, executed trade detail, dan average fill dari exchange untuk accounting/reconciliation

3\. finalisasi recovery sinkronisasi order live setelah restart runtime

4\. tetapkan perilaku BUY default sebagai aggressive limit / limit rasa market untuk peluang yang sudah lolos assessment

5\. tetapkan perilaku SELL / TAKE PROFIT default yang praktis dan disiplin untuk token hasil pump cepat, dengan default take profit 15% yang bisa diubah dari Telegram



\## Policy BUY default

Untuk pair yang sudah lolos assessment dan memang layak entry, perilaku BUY default tidak lagi dianggap limit pasif biasa. Baseline yang diinginkan adalah:



\- referensi harga utama dari best ask orderbook

\- jika best ask tidak tersedia, fallback ke `ticker.last`

\- jika keduanya tidak tersedia, baru gunakan fallback aman yang memang sudah dipakai code

\- order BUY memakai aggressive limit price = harga referensi + slippage kecil terukur

\- slippage bps harus jelas, aman, dan dapat dikonfigurasi dari Telegram

\- perilaku default berorientasi cepat fill, bukan menunggu fill pasif terlalu lama

\- tetap ada pagar slippage maksimum agar tidak overpay tanpa batas

\- order BUY yang tidak fill cepat tidak boleh menggantung terlalu lama; harus direconcile dengan benar

\- partial fill BUY tetap harus digabung menjadi satu posisi logis per pair/account



\## Policy SELL / TAKE PROFIT default

Untuk token hasil pump yang sering bergerak cepat dan tidak bertahan lama, baseline exit harus sederhana, eksplisit, dan praktis:



\- jangan jadikan ATH atau target puncak teoritis sebagai default sell otomatis

\- default take profit harus bisa diubah dari Telegram tanpa ubah code

\- default awal take profit = 15%

\- desain exit harus cocok untuk token hasil pump yang sering retrace cepat

\- boleh disiapkan struktur untuk pengembangan berikutnya seperti trailing stop / partial TP

\- jika trailing stop / partial TP belum benar-benar selesai end-to-end, jangan klaim sebagai fitur final



\## Aturan reconciliation dan accounting

\- runtime state harus sinkron dengan partial fill, full fill, cancel, dan restart recovery

\- fee, executed quantity, dan average entry harus diambil dari sumber exchange yang paling akurat yang tersedia

\- jangan membuat banyak posisi terpisah untuk BUY yang sebenarnya masih satu pair/account yang sama

\- jika recovery restart masih parsial, statusnya harus ditulis jujur sebagai parsial



\## Aturan dokumentasi status

\- jangan overclaim selesai jika masih parsial

\- sinkronkan implementasi aktual dengan `REFACTOR\_LOG.md` dan `SESSION\_CONTEXT\_NEXT.md`

\- bedakan dengan tegas mana yang:

&#x20; - sudah terimplementasi

&#x20; - sudah terhubung end-to-end

&#x20; - masih parsial

&#x20; - masih backlog

\- setelah semua prioritas di atas benar-benar masuk dan terdokumentasi, baru finalisasi `README.md` dan `.env.example`



\## Catatan maintainability

\- pemecahan `executionEngine.ts` menjadi modul kecil seperti `sync / recovery / order-live` boleh dilakukan hanya jika tidak mengganggu penyelesaian prioritas inti

\- jangan melakukan refactor kosmetik yang menunda hardening perilaku buy/sell/reconciliation inti

# 9\) Data persistence baru

Tambahkan file runtime:

* `data/history/pair-history.jsonl`
* `data/history/anomaly-events.jsonl`
* `data/history/pattern-outcomes.jsonl`
* `data/backtest/results/\*.json`

Gunakan JSONL untuk event stream agar append murah.

\---

\# 9A) Execution summary \& trade outcome summary



Bagian ini menambahkan lapisan observability operasional di atas trading layer yang sudah ada. Tujuannya bukan mengganti persistence lama, tetapi memastikan setiap event order penting dan setiap trade yang selesai dapat dibaca secara jelas oleh operator melalui Telegram, journal, dan log operasional.



\## Kebutuhan summary baseline

Setiap event order penting harus punya execution summary yang konsisten:

\- BUY submitted

\- BUY partially filled

\- BUY filled

\- BUY canceled / failed

\- SELL submitted

\- SELL partially filled

\- SELL filled

\- SELL canceled / failed



Setiap posisi yang benar-benar selesai ditutup harus menghasilkan trade outcome summary final.



\## Kanal summary minimal

Summary harus tersedia minimal melalui:

\- Telegram notification / message

\- journal / persistence

\- log operasional



\## Isi minimal execution summary

\- account

\- pair

\- side

\- status

\- reference price

\- intended order price

\- average fill price jika ada

\- filled quantity

\- filled notional

\- fee jika tersedia

\- exchange order id jika ada

\- slippage vs reference price

\- timestamp

\- reason / error bila gagal atau cancel



\## Isi minimal trade outcome summary

\- account

\- pair

\- entry average

\- exit average

\- total quantity

\- total fee

\- gross pnl

\- net pnl

\- return percentage

\- hold duration

\- close reason



\## Aturan akurasi summary

\- jangan overclaim confirmed pnl jika fee / executed trade detail belum final

\- bedakan dengan tegas mana summary yang masih optimistic-live dan mana yang confirmed-live

\- summary harus dibangun di atas status akurasi reconciliation yang ada sekarang

\- jika data masih parsial, summary harus ditandai jujur sebagai parsial

\- perubahan ini harus tetap sinkron dengan `REFACTOR\_LOG.md` dan `SESSION\_CONTEXT\_NEXT.md`



# 10\) Prioritas implementasi nyata

Urutan paling efisien:

1. stabilisasi compile + contract mismatch
2. feature pipeline intelligence
3. historical context
4. worker runtime
5. backtest
6. report/telegram enrichment

\---

\# 10A) Prioritas lanjutan sinkronisasi implementasi



Setelah baseline arsitektur, intelligence, history, worker, backtest, dan report terbentuk, prioritas lanjutan harus bergerak ke hardening execution live dan observability operasional.



\## Urutan lanjutan yang disarankan

1\. selesaikan P0 live execution hardening

&#x20;  - partial fill aggregation per pair/account

&#x20;  - fee / executed trade detail / average fill reconciliation

&#x20;  - restart recovery synchronization

&#x20;  - BUY default aggressive limit / limit rasa market

&#x20;  - SELL / TP default 15% via Telegram

2\. setelah execution baseline stabil, tambahkan execution summary dan trade outcome summary

3\. setelah dua tahap di atas sinkron dan terdokumentasi, baru finalisasi `README.md` dan `.env.example`



\## Prinsip prioritas

\- jangan melompat ke dokumentasi akhir saat execution live inti belum stabil

\- summary dibangun di atas reconciliation yang cukup matang

\- policy BUY dan SELL baseline adalah bagian dari implementasi inti, bukan tambahan kosmetik



# 11\) Hasil yang diharapkan

Setelah selesai, bot harus bisa:

* mendeteksi peluang bukan cuma dari spike, tapi dari jejak akumulasi dan tekanan mikrostruktur
* mengurangi false positive dari spoof dan jebakan orderbook
* memberi hotlist dengan alasan yang bisa dibaca manusia
* tahu kapan entry masih dini, siap, terlambat, atau harus dihindari
* menjalankan analitik berat tanpa membebani main thread Node.js
* menguji ulang logic pada historical replay

\---

# 12\) Cara eksekusi bersama user

Implementasi ideal dilakukan bertahap:

* Tahap 1: batch stabilisasi
* Tahap 2: batch intelligence core
* Tahap 3: historical + worker
* Tahap 4: backtest + final UI/report
* Tahap 5: live execution hardening + entry/exit policy baseline
* Tahap 6: execution summary + trade outcome summary
* Tahap 7: finalisasi README root + `.env.example`



Setiap tahap menghasilkan:



* daftar file yang diubah
* alasan perubahan
* patch/isi file final
* risiko integrasi
* checklist validasi
* status yang jujur: sudah implementasi / end-to-end / parsial / backlog
* sinkronisasi `REFACTOR\\\_LOG.md` dan `SESSION\\\_CONTEXT\\\_NEXT.md`




