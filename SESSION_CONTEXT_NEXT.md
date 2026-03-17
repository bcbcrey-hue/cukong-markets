# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/bcbcrey-hue/mafiamarkets-refactor-dua`

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
- runtime utama berlaku:
  `tickers + depth -> MarketWatcher -> SignalEngine -> intelligence pipeline -> OpportunityAssessment -> Hotlist -> ExecutionEngine`
- worker runtime untuk `feature`, `pattern`, dan `backtest` sudah ada
- hook Telegram untuk `Intelligence Report`, `Spoof Radar`, `Pattern Match`, dan `Backtest` sudah aktif

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

### Trading / execution
- trailing stop sudah valid karena memakai `peakPrice`
- flow simulasi buy/sell lengkap dan persist ke state
- live buy / sell / cancel baseline sudah ada
- order live menyimpan `exchangeOrderId` dan disinkronkan lewat `getOrder(...)`
- `position-monitor` sekarang memanggil `syncActiveOrders()` sebelum evaluasi exit
- duplicate active BUY/SELL guard sudah aktif
- yang belum final: agregasi partial fill buy, fee/trade-history capture, dan recovery sinkronisasi setelah restart

### Telegram
- Telegram button UI tetap UI utama
- whitelist `TELEGRAM_ALLOWED_USER_IDS` tetap aktif
- upload legacy account JSON tetap didukung
- START/STOP di Telegram mengubah state runtime, bukan bootstrap ulang proses aplikasi

### Worker / backtest
- feature worker bisa dipakai di runtime utama
- pattern worker tersedia dan lolos regression, tetapi matching live path utama masih inline
- backtest replay dari pair-history JSONL sudah aktif dan persist hasil ke `data/backtest/*.json`

---

## 3. Hal yang sudah ditutup, jangan diulang

- compile blocker TypeScript/support files
- mismatch contract app ↔ persistence ↔ state ↔ hotlist ↔ report ↔ Telegram ↔ execution
- trailing-stop unreachable logic
- arah `change24hPct` yang terbalik
- timeout deadlock / starvation pada worker pool
- sinkronisasi base URL Indodax ke env di entry client
- baseline live order sync / cancel / duplicate-guard

---

## 4. Backlog aktif yang nyata

### P0
- reconciliation multi-sumber antara `trade`, `getOrder`, `openOrders`, `orderHistory`, dan runtime state
- agregasi partial fill buy menjadi satu posisi logis
- fee / executed-trade accounting dari exchange
- recovery sinkronisasi order aktif setelah restart runtime

### P1
- pindahkan pattern matching live path ke worker runtime jika perlu offload konsisten
- bedakan lebih tegas simulated vs optimistic-live vs confirmed-live outcome
- upgrade trade-flow bila ada sumber trade print native

### P2
- final README root
- final `.env.example`

---

## 5. Next target paling logis

1. hardening live execution semantics Indodax
2. finalisasi README dan `.env.example`
3. baru setelah itu, pengayaan intelligence/Telegram lanjutan bila memang dibutuhkan

---

## 6. Rule kerja sesi berikutnya

- jangan mengulang batch lama yang sudah selesai
- jangan campur status lama dengan status implementasi terbaru
- jika ada mismatch baru, utamakan implementasi aktual repo + blueprint
- jangan overclaim live execution sudah selesai
- gunakan `REFACTOR_LOG.md` sebagai sumber detail dan file ini sebagai ringkasan eksekusi cepat

---

## 7. Validasi cepat yang bisa dipakai ulang

- `yarn lint`
- `yarn build`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-regression LOG_DIR=/tmp/mafiamarkets-audit-regression/logs TEMP_DIR=/tmp/mafiamarkets-audit-regression/tmp yarn tsx /app/tests/runtime_backend_regression.ts`
- `TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-timeout LOG_DIR=/tmp/mafiamarkets-audit-timeout/logs TEMP_DIR=/tmp/mafiamarkets-audit-timeout/tmp yarn tsx /app/tests/worker_timeout_probe.ts`
