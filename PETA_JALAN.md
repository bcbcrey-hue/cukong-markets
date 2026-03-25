# Audit Forensik Keras — `masreykangtrade-oss/cukong-markets`

Tanggal audit: 2026-03-25  
Metode: audit source code aktual sebagai sumber kebenaran utama, fokus ke wiring runtime nyata, otak sinyal, decision engine, execution flow, dan sinkronisasi monitoring Telegram.

---

## Verdict akhir

**Status:** **BELUM NORMAL / BELUM BISA DIKLAIM SELURUH SINYAL BERFUNGSI DENGAN NORMAL**

Kesimpulan forensik:
- Repo ini **bukan kosong** dan **bukan sekadar blueprint**. Banyak modul besar memang sudah **terpasang nyata** di runtime.
- Tetapi ada beberapa **cacat desain dan cacat wiring** yang cukup serius, terutama di:
  1. **kualitas basis data sinyal volume**,
  2. **trade-flow yang masih inferred/proxy**,
  3. **sinkronisasi read-model Telegram vs state runtime**,
  4. **konsistensi definisi major pair dan kandidat**,
  5. **historical intelligence yang masih memakai proxy, bukan outcome trading nyata**.

Jadi audit ini **tidak** menyimpulkan repo “palsu”, tetapi juga **tidak** mengizinkan klaim bahwa semua signal/monitoring sudah normal.

---

## Peta sistem yang benar-benar ada di runtime

Dari wiring runtime, sistem berikut memang dibangun dan dipakai nyata:

1. Persistence bootstrap
2. State + settings + journal + order + position load
3. Account registry initialize
4. Pair universe
5. Indodax client
6. Market watcher
7. Pair history store
8. Signal engine
9. Opportunity engine
10. Hotlist service
11. Pump candidate watch
12. Risk engine
13. Execution engine
14. Callback server
15. App server
16. Telegram bot
17. Polling jobs:
   - market-scan
   - position-monitor
   - health-heartbeat

Artinya struktur inti memang hidup, bukan file hiasan.

---

## Checklist implementasi nyata per subsistem

### 1) Core Trading System
**Status: TERIMPLEMENTASI NYATA**

Yang benar-benar ada:
- `OrderManager`
- `PositionManager`
- `RiskEngine`
- `ExecutionEngine`
- order create/update/fill/cancel/reject
- position open / apply buy fill / partial close / force close
- auto-buy gate
- manual buy / manual sell
- stop loss / take profit / trailing stop
- cancel all orders
- sell all positions
- startup recovery live orders
- callback reconciliation
- execution summary + trade outcome summary

Catatan audit:
- Ini bukan dummy.
- Ada jalur simulated dan jalur live.
- Ada logika recovery live yang cukup jauh lebih matang dibanding repo bot sederhana.

### 2) Market Discovery / Market Analysis
**Status: TERIMPLEMENTASI NYATA**

Yang benar-benar ada:
- `PairUniverse`
- `DiscoveryEngine`
- `DiscoveryScorer`
- `DiscoveryAllocator`
- `MarketWatcher`
- `PumpCandidateWatch`
- bucket discovery:
  - `ANOMALY`
  - `ROTATION`
  - `STEALTH`
  - `LIQUID_LEADER`

Yang dilakukan runtime:
- fetch ticker publik
- update universe mentah
- shortlist candidate pre-depth
- fetch depth untuk shortlist
- enrich depth
- allocate candidate sesuai slot
- bentuk `MarketSnapshot`

### 3) Signal Engine
**Status: TERIMPLEMENTASI NYATA, TAPI BASISNYA BELUM NORMAL**

Signal/logic yang benar-benar ada:
- `volumeSpike`
- `breakoutRetest`
- `silentAccumulation`
- `hotRotation`
- `orderbookImbalance`

Tambahan scoring yang juga nyata:
- spread tightening
- price acceleration
- trade burst
- tier bonus
- slippage penalty
- liquidity penalty
- overextension penalty
- spoof penalty

### 4) Intelligence Layer
**Status: TERIMPLEMENTASI NYATA, TAPI SEBAGIAN MASIH PROXY / HEURISTIK**

Yang benar-benar ada:
- `FeaturePipeline`
- `ProbabilityEngine`
- `EdgeValidator`
- `EntryTimingEngine`
- `ScoreExplainer`
- `OpportunityEngine`

Microstructure detector yang benar-benar dipakai:
- `detectAccumulation`
- `detectSpoofing`
- `detectIceberg`
- `detectTradeClusters`

### 5) History / Regime / Pattern
**Status: TERIMPLEMENTASI NYATA, TAPI BELUM SEPENUHNYA BERBASIS OUTCOME RIIL**

Yang benar-benar ada:
- `PairHistoryStore`
- `RegimeClassifier`
- `PatternMatcher`
- `patternLibrary`
- anomaly recording
- snapshot recording
- signal recording
- opportunity recording

### 6) Telegram Monitoring / Control Plane
**Status: TERIMPLEMENTASI NYATA, TAPI READ-MODEL BELUM KONSISTEN**

Yang benar-benar ada:
- bot Telegram via Telegraf
- whitelist user ID
- menu utama dan submenu
- status
- market watch
- hotlist
- intelligence report
- spoof radar
- pattern match
- logs
- positions
- orders
- manual buy
- manual sell
- settings
- accounts
- backtest
- shadow-run

### 7) Worker / Offloading
**Status: TERIMPLEMENTASI NYATA**

Yang benar-benar ada:
- feature worker
- pattern worker
- backtest worker
- timeout + respawn worker
- fallback inline jika worker disabled / belum start

---

## Temuan forensik keras — daftar celah nyata

## P0 — temuan kritis

### P0.1 — Basis volume untuk signal kemungkinan salah secara fundamental
**Masalah:**
Store ticker menyimpan `volume24hQuote` dari snapshot, lalu (sebelum patch P0.1) menghitung `volume1m`, `volume3m`, `volume5m`, `volume15mAvg` dengan menjumlahkan angka snapshot tersebut di dalam window.

**Kenapa ini kritis:**
`volume24hQuote` adalah angka kumulatif 24 jam dari exchange, bukan delta per interval. Menjumlahkan snapshot kumulatif akan menghasilkan angka turunan yang bias.

**Dampak:**
Signal berikut berpotensi salah atau minimal bias:
- `volumeSpike`
- `silentAccumulation`
- `hotRotation`
- `tradeBurst`
- `quoteFlowAccelerationScore` (pengganti `volumeAcceleration` berbasis proxy flow)
- semua ranking yang bergantung pada akselerasi flow

**Kesimpulan audit:**
Layer signal memang hidup, tetapi **normalitasnya gagal** karena fondasi volume kemungkinan salah.

---

### P0.2 — `recentTrades` bukan trade feed asli, hanya hasil inferensi kasar dari delta snapshot
**Masalah:**
`MarketWatcher` membentuk `recentTrades` dari selisih volume quote dan perubahan harga snapshot sebelumnya.

**Kenapa ini kritis:**
Detektor microstructure lalu memakai `recentTrades` ini untuk membaca:
- aggression bias
- cluster
- sweep
- buy/sell follow-through
- sebagian bukti spoof / accumulation

Padahal itu bukan tape/trade stream riil.

**Dampak:**
- intelligence layer tampak canggih, tetapi sebagian berbasis proxy kasar
- hasil spoof / cluster / accumulation tidak boleh dianggap setara dengan trade-flow nyata

**Kesimpulan audit:**
Microstructure **ada**, tetapi **belum cukup valid untuk disebut normal/akurat tinggi**.

**Catatan implementasi kontrak jujur (runtime):**
- `TradePrint` wajib memuat `source` dan `quality` untuk membedakan tape riil vs proxy inferred.
- `MarketSnapshot` wajib memuat `recentTradesSource` agar consumer tahu provenance data trade-flow.
- Evidence microstructure, warning edge, dan explainer harus menyebut ketika basisnya proxy inferred.

---

### P0.3 — Monitoring Telegram memang berpotensi tidak sinkron karena memakai sumber data berbeda
**Masalah:**
Beberapa panel Telegram membaca data dari `HotlistService`, panel lain membaca dari `StateService`, dan sebagian status mencampur keduanya.

**Contoh konsekuensi:**
- hotlist panel bisa kosong, tetapi opportunity/state masih ada
- status top signal bisa berbeda dari hotlist panel
- setelah restart, snapshot state lama bisa ada, tapi cache hotlist in-memory belum rehydrate

**Kenapa ini kritis:**
User melihat bot dari Telegram. Kalau read-model Telegram pecah, user mengira “otak bot rusak” walaupun yang rusak sebenarnya sinkronisasi antar cache.

**Kesimpulan audit:**
Keluhan “monitoring tidak sinkron” **valid dan punya dasar source-code nyata**.

---

### P0.4 — `HotlistService` tidak direhydrate dari persistence saat startup
**Masalah:**
State persistence menyimpan `lastHotlist`, tetapi `HotlistService` hanya punya cache in-memory dan tidak terlihat di-load kembali saat startup.

**Dampak:**
Setelah restart:
- state snapshot bisa punya hotlist lama
- service hotlist bisa kosong sampai scan berikutnya
- Telegram hotlist dan panel lain berpotensi beda isi

**Kesimpulan audit:**
Ini bukan asumsi. Ini celah desain sinkronisasi startup.

**Update verifikasi source (2026-03-25):**
- `HotlistService` sekarang sudah punya method `rehydrate(entries)` untuk mengisi ulang cache hotlist dari snapshot persistence.
- Wiring startup di `createApp()` sudah memanggil `hotlistService.rehydrate(state.get().lastHotlist)` sesudah fase `runtime.state.load`.
- Guard probe `tests/startup_hotlist_rehydrate_probe.ts` ditambahkan agar startup gagal verifikasi jika wiring `state.load() -> hotlist rehydrate` hilang/regresi.

---

### P0.5 — `lastSignals` di state bukan full signal result, melainkan `pumpCandidates`
**Masalah:**
Runtime menghitung semua `scored`, tetapi state menyimpan `lastSignals` dari `pumpCandidates`, bukan dari semua hasil scoring.

**Dampak:**
Nama field menyesatkan.
Komponen lain bisa salah mengira `lastSignals` adalah seluruh universe signal terakhir, padahal itu sudah subset kandidat.

**Kesimpulan audit:**
Ada mismatch semantics antara nama data dan isi data.

---

## P1 — temuan berat tapi bukan pembunuh langsung

### P1.1 — Definisi “major pair” tidak konsisten antar modul
**Masalah:**
Ada modul yang menilai major pair dengan satu aturan, modul lain dengan aturan berbeda.

Contoh inkonsistensi:
- discovery scorer bisa menganggap `usdt_*` major
- pair classifier bisa menganggap `sol` major
- modul lain hanya melihat `btc_` / `eth_`

**Dampak:**
- ranking discovery bisa berbeda logika dengan ranking signal
- pembatasan major pair share bisa tidak selaras
- pair tertentu bisa diperlakukan sebagai major di satu tempat, micro/mid di tempat lain

**Kesimpulan audit:**
Ini celah konsistensi domain model.

---

### P1.2 — Historical context memakai proxy, bukan hasil trade benar-benar menang/kalah
**Masalah:**
`recentWinRate` dan `recentFalseBreakRate` dibangun dari history opportunity/anomaly, bukan dari outcome trading nyata yang sudah closed dan tervalidasi.

**Dampak:**
Probability layer dan historical context terlihat canggih, tetapi tidak sepenuhnya grounded ke PnL/outcome riil.

**Kesimpulan audit:**
History intelligence **ada**, tetapi **masih semi-sintetis**.

---

### P1.3 — History intelligence tidak tampak direhydrate penuh dari file history saat startup
**Masalah:**
History memang diappend ke file, tetapi store in-memory tidak tampak di-reload penuh saat startup.

**Dampak:**
- regime/pattern/history context akan dingin lagi setelah restart
- confidence awal setelah restart bisa berbasis history dangkal

**Kesimpulan audit:**
Persistence ada, tetapi reuse memori historinya belum utuh.

---

### P1.4 — Actionability hotlist terlalu sempit
**Masalah:**
Manual buy di UI hanya actionable jika `edgeValid && recommendedAction === ENTER`.

**Dampak:**
- pair yang `CONFIRM_ENTRY` atau `PREPARE_ENTRY` tetap muncul di hotlist tetapi tidak bisa diambil manual dari flow tertentu
- user bisa merasa UI “kontradiktif”: pair terlihat menarik tapi langsung diblok

**Kesimpulan audit:**
Ini bukan bug fatal, tapi mismatch UX-decision layer.

---

## P2 — celah desain / kualitas / observability

### P2.1 — Pair history “win rate” dan “false break rate” rawan overclaim secara istilah
Nama metrik memberi kesan outcome truth, padahal sumbernya masih opportunity proxy.

### P2.2 — Market watch / hotlist / intelligence report memakai potongan model yang berbeda
Secara operasional ini menyulitkan debugging karena user melihat tiga panel yang tidak selalu berasal dari snapshot yang identik.

### P2.3 — Discovery dan signal layer sama-sama punya ranking, tetapi boundary kontraknya belum sepenuhnya bersih
Masih ada potensi overlap tanggung jawab antara discovery candidate selection, pump candidate feed, signal shortlist, dan hotlist.

### P2.4 — Sebagian label monitoring masih bisa membuat operator menyangka itu live truth padahal ada unsur heuristik/proxy
Khususnya di spoof/pattern/intelligence.

---

## Daftar signal dan logic yang benar-benar ditemukan

## Discovery / candidate layer
- volume acceleration
- price expansion
- breakout pressure
- spread quality
- depth bonus
- orderbook imbalance
- bucket assignment:
  - ANOMALY
  - ROTATION
  - STEALTH
  - LIQUID_LEADER
- major pair cap

## Baseline signal layer
- volume spike
- breakout retest
- silent accumulation
- hot rotation
- orderbook imbalance
- spread tightening
- price acceleration
- trade burst
- slippage penalty
- liquidity penalty
- overextension penalty
- spoof penalty
- tier bonus

## Microstructure / intelligence layer
- accumulation detector
- spoof detector
- iceberg detector
- trade cluster detector
- aggression bias
- sweep score
- liquidity quality score
- exhaustion risk score

## Opportunity layer
- pump probability
- continuation probability
- trap probability
- confidence
- edge validation
- entry timing: EARLY / READY / LATE / AVOID
- recommended action:
  - WATCH
  - PREPARE_ENTRY
  - CONFIRM_ENTRY
  - AVOID
  - ENTER

## Trading / risk layer
- min score to alert
- min score to buy
- min confidence
- min pump probability
- spoof risk block threshold
- max open positions
- max position size
- max pair spread
- cooldown
- duplicate pair position guard
- duplicate active order guard
- stop loss
- take profit
- trailing stop
- aggressive buy price from best ask + slippage bps
- stale buy timeout cancel
- startup recovery open orders
- callback reconciliation

---

## Yang benar-benar bisa diklaim “sudah ada”

Boleh diklaim ada:
- runtime orchestration nyata
- discovery engine nyata
- signal engine nyata
- opportunity engine nyata
- microstructure heuristic nyata
- history/pattern/regime nyata
- risk engine nyata
- execution engine nyata
- Telegram control plane nyata
- worker pool nyata
- persistence nyata
- callback server nyata

Tidak boleh diklaim berlebihan:
- seluruh signal sudah normal
- volume analytics sudah valid penuh
- trade-flow intelligence setara trade tape asli
- Telegram monitoring sudah sinkron penuh
- historical win-rate sudah outcome-grounded penuh
- intelligence sudah production-grade presisi tinggi

---

## Jawaban eksplisit atas pertanyaan inti

### Apakah seluruh sinyal sudah berfungsi normal, baik di sistem maupun di monitoring Telegram?
**Jawaban:** **BELUM.**

Lebih tepatnya:
- sinyal **hidup dan benar-benar dihitung**
- tetapi **tidak semuanya normal/valid secara kualitas**
- monitoring Telegram **hidup**, tetapi **belum konsisten/sinkron**

### Apakah Core Trading System, Intelligence Layer, Market Analysis, Opportunity benar-benar terimplementasi?
**Jawaban:** **YA, mayoritas benar-benar terimplementasi nyata.**

Tetapi:
- sebagian outputnya masih berbasis proxy heuristik
- beberapa fondasi datanya masih lemah/salah
- sinkronisasi antar read-model belum rapi

---

## Ringkasan final paling jujur

Repo ini **bukan palsu** dan **bukan cuma gimmick Telegram**. Otak bot memang ada.

Tetapi repo ini juga **belum layak diklaim seluruh sinyalnya normal** karena audit forensik menemukan celah nyata di:
- basis volume signal,
- inferensi trade-flow,
- sinkronisasi monitoring Telegram,
- konsistensi major pair,
- dan grounding historical intelligence.

## Verdict final forensik

**BOT PUNYA OTAK NYATA, TAPI OTAKNYA MASIH CACAT DI BEBERAPA TITIK KRITIS.**

**Status akhir:**
- **Implementasi nyata:** YA
- **Seluruh sinyal normal:** TIDAK
- **Monitoring Telegram sinkron penuh:** TIDAK
- **Perlu perbaikan keras sebelum dipercaya penuh:** YA
