# Mafiamarkets Refactor TIGA

Backend TypeScript untuk bot intelijen market Indodax dengan UI operasional utama di Telegram.

## Status aktual repo

Runtime utama repo yang berlaku sekarang:

`tickers + depth -> MarketWatcher -> SignalEngine -> intelligence pipeline -> OpportunityAssessment -> Hotlist -> ExecutionEngine`

Yang sudah terverifikasi di repo lokal:

- `yarn install` selesai
- `yarn lint` lulus
- `yarn build` lulus
- `tests/runtime_backend_regression.ts` lulus
- `tests/worker_timeout_probe.ts` lulus
- `tests/live_execution_hardening_probe.ts` lulus
- `tests/execution_summary_failed_probe.ts` lulus
- `tests/telegram_menu_navigation_probe.ts` lulus
- `tests/telegram_slippage_confirmation_probe.ts` lulus
- testing agent iteration 8 juga menyatakan backend pass tanpa issue blocking

Status implementasi end-to-end yang aktif:

- scanner market + hotlist berbasis `OpportunityAssessment`
- intelligence pipeline (microstructure, history, probability, edge validation, entry timing)
- worker runtime untuk feature/pattern/backtest
- backtest replay dari pair-history JSONL
- live execution hardening baseline (openOrders-first sync, getOrder -> orderHistory/tradeHistory fallback, duplicate guard, aggressive BUY, TP default 15%)
- execution summary dan trade outcome summary ke Telegram/journal/log/persistence
- Telegram UI sudah dirapikan menjadi menu hierarkis 7 kategori, bukan flat dashboard lama

## Telegram UI operasional

Main Menu sekarang **hanya** berisi 7 kategori:

1. `⚡ Execute Trade`
2. `🚨 Emergency Controls`
3. `📡 Monitoring / Laporan`
4. `📦 Positions / Orders / Manual Trade`
5. `⚙️ Settings`
6. `👤 Accounts`
7. `🧪 Backtest`

Struktur baru yang aktif:

- `Execute Trade` → Start Bot, Stop Bot, Status, Kembali
- `Emergency Controls` → Pause Auto, Pause All, Cancel All Orders, Sell All Positions, Kembali
- `Monitoring / Laporan` → Market Watch, Hotlist, Intelligence Report, Spoof Radar, Pattern Match, Logs, Kembali
- `Positions / Orders / Manual Trade` → Positions, Orders, Manual Buy, Manual Sell, Buy Slippage X bps, Kembali
- `Settings` → Strategy Settings, Risk Settings, Kembali
- `Accounts` → Accounts → List Accounts, Upload JSON, Reload Accounts, Kembali
- `Backtest` → Backtest → Run Top Pair, Run All Recent, Last Result, Kembali

Aturan UX yang aktif sekarang:

- menu navigasi memakai namespace callback `NAV`, terpisah dari callback aksi trading
- semua submenu punya tombol `Kembali`
- submenu nested kembali ke parent yang tepat, bukan selalu lompat membingungkan ke root
- callback lama untuk aksi live tetap dipertahankan agar tidak memutus wiring fitur yang sudah ada

## Slippage BUY

Status slippage yang aktif sekarang:

- default `buySlippageBps = 60`
- max `maxBuySlippageBps = 150`
- tombol `Buy Slippage X bps` sudah dipindahkan ke submenu `Positions / Orders / Manual Trade`
- execution engine tetap memakai aggressive buy limit dari `bestAsk + slippage bps` dan clamp ke `maxBuySlippageBps`
- jika user Telegram memasukkan nilai di atas `150 bps`, bot memberi warning dan minta konfirmasi; jika user balas `LANJUT`, nilai aman yang disimpan adalah `150 bps`
- settings lama dengan default legacy `25/80` dimigrasikan ke `60/150`

## Fitur execution summary & trade outcome summary

### Execution summary

Event berikut menghasilkan summary yang konsisten:

- BUY submitted
- BUY partially filled
- BUY filled
- BUY canceled / failed
- SELL submitted
- SELL partially filled
- SELL filled
- SELL canceled / failed

Channel minimum yang aktif:

- Telegram broadcast ke `TELEGRAM_ALLOWED_USER_IDS`
- journal JSONL
- log operasional pino
- persistence JSONL khusus summary

File persistence summary:

- `data/history/execution-summaries.jsonl`
- `data/history/trade-outcomes.jsonl`

### Trade outcome summary

Trade outcome summary final hanya ditulis ketika posisi benar-benar `CLOSED`.

Semantik akurasi yang dipakai:

- `SIMULATED`
- `OPTIMISTIC_LIVE`
- `PARTIAL_LIVE`
- `CONFIRMED_LIVE`

## Struktur repo penting

```text
src/
  app.ts
  bootstrap.ts
  config/
  core/
  domain/
    accounts/
    backtest/
    history/
    intelligence/
    market/
    microstructure/
    settings/
    signals/
    trading/
  integrations/
    indodax/
    telegram/
  services/
  storage/
  workers/
tests/
REFACTOR_LOG.md
SESSION_CONTEXT_NEXT.md
mafiamarkets-blueprint.md
```

## Environment

Salin nilai dari `.env.example` ke `.env` lalu isi token/kredensial yang benar.

Variabel paling penting:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`
- `DATA_DIR`
- `LOG_DIR`
- `TEMP_DIR`
- `INDODAX_PUBLIC_BASE_URL`
- `INDODAX_PRIVATE_BASE_URL`
- `BUY_SLIPPAGE_BPS`
- `MAX_BUY_SLIPPAGE_BPS`

## Perintah utama

```bash
yarn install
yarn lint
yarn build
yarn dev
```

## Probe / regression penting

```bash
TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-regression LOG_DIR=/tmp/mafiamarkets-audit-regression/logs TEMP_DIR=/tmp/mafiamarkets-audit-regression/tmp yarn tsx /app/tests/runtime_backend_regression.ts

TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-audit-timeout LOG_DIR=/tmp/mafiamarkets-audit-timeout/logs TEMP_DIR=/tmp/mafiamarkets-audit-timeout/tmp yarn tsx /app/tests/worker_timeout_probe.ts

TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-live-hardening-probe-self LOG_DIR=/tmp/mafiamarkets-live-hardening-probe-self/logs TEMP_DIR=/tmp/mafiamarkets-live-hardening-probe-self/tmp yarn tsx /app/tests/live_execution_hardening_probe.ts

TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-it6-failed-self LOG_DIR=/tmp/mafiamarkets-it6-failed-self/logs TEMP_DIR=/tmp/mafiamarkets-it6-failed-self/tmp yarn tsx /app/tests/execution_summary_failed_probe.ts

TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-telegram-menu LOG_DIR=/tmp/mafiamarkets-telegram-menu/logs TEMP_DIR=/tmp/mafiamarkets-telegram-menu/tmp yarn tsx /app/tests/telegram_menu_navigation_probe.ts

TELEGRAM_BOT_TOKEN=testtoken TELEGRAM_ALLOWED_USER_IDS=1 DATA_DIR=/tmp/mafiamarkets-it8-slip-self LOG_DIR=/tmp/mafiamarkets-it8-slip-self/logs TEMP_DIR=/tmp/mafiamarkets-it8-slip-self/tmp yarn tsx /app/tests/telegram_slippage_confirmation_probe.ts
```

## Data runtime yang dihasilkan

- `data/accounts/accounts.json`
- `data/state/runtime-state.json`
- `data/state/orders.json`
- `data/state/positions.json`
- `data/state/trades.json`
- `data/state/journal.jsonl`
- `data/history/pair-history.jsonl`
- `data/history/anomaly-events.jsonl`
- `data/history/pattern-outcomes.jsonl`
- `data/history/execution-summaries.jsonl`
- `data/history/trade-outcomes.jsonl`
- `data/backtest/*.json`

## Catatan kejujuran status

- jalur broadcast summary ke Telegram sudah ada, tetapi delivery Telegram live belum divalidasi end-to-end pada sesi ini
- `recentTrades` di market intelligence masih inferred dari delta volume lokal, belum native trade feed exchange
- reconciliation fee / weighted fill sudah memakai `tradeHistory` bila tersedia; fallback saat detail exchange tidak lengkap masih punya backlog lanjutan
- probe backend memakai fake exchange client / fake Telegram harness, bukan validasi live exchange atau live delivery Telegram

Lihat `REFACTOR_LOG.md` untuk status final lengkap dan `SESSION_CONTEXT_NEXT.md` untuk handoff ringkas sesi berikutnya.
