# Cukong-Markets

Backend TypeScript untuk bot operasional market Indodax dengan UI utama di Telegram.

Package/app naming final yang dipakai sekarang: `cukong-markets`.

## Status jujur repo saat ini

### Sudah implemented & connected di repo

- `MarketWatcher -> SignalEngine -> intelligence pipeline -> OpportunityAssessment -> Hotlist -> ExecutionEngine`
- domain `intelligence`, `microstructure`, `history`, `backtest`, dan `workers`
- hardening execution nyata: `openOrders`-first sync, fallback `getOrder`, fallback history, duplicate BUY/SELL guard, stale BUY timeout cancel
- startup recovery langsung diikuti evaluasi open positions (tidak menunggu tick `position-monitor` pertama)
- execution summary + trade outcome summary ke persistence + journal + Telegram notifier
- callback server Indodax terpisah port, env-driven, dan persist event/state
- callback accepted dapat memicu reconciliation order aktif berbasis `exchangeOrderId` bila payload menyertakan `order_id/orderId/id`
- Telegram operational UI 7 kategori, whitelist ketat, legacy upload account JSON, storage akun tetap di `data/accounts/accounts.json`
- RUN START/STOP di Telegram sekarang mengontrol polling runtime (resume/pause loop), bukan sekadar patch status state
- history mode `v2_prefer | v2_only | legacy` benar-benar dipakai di execution/recovery
- nginx template + renderer berbasis env

### Masih parsial

- jalur execution/recovery masih sengaja memegang compatibility layer legacy `/tapi` + Trade API 2.0 untuk recovery dan fallback; ini **parsial**, bukan final murni V2

### Tidak boleh dioverclaim

- runtime publik `https://kangtrade.top` **bukan bukti** bahwa repo ini sudah live sesuai source saat ini
- verifikasi publik terbaru menunjukkan:
  - `https://kangtrade.top/healthz` merespons HTML login page, bukan JSON health server repo ini
  - `https://kangtrade.top/indodax/callback` merespons text gate `405`, bukan respons callback server repo ini
- artinya ingress/domain publik aktif saat ini belum terbukti mengarah ke runtime repo ini

## Kontrak arsitektur yang benar

- domain publik dibentuk dari `PUBLIC_BASE_URL`
- callback publik final dibentuk dari `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- route internal inti sengaja stabil:
  - app health: `/healthz`
  - callback listener: `/indodax/callback`
- vendor outbound dipisahkan dari domain publik:
  - `INDODAX_PUBLIC_BASE_URL`
  - `INDODAX_PRIVATE_BASE_URL`
  - `INDODAX_TRADE_API_V2_BASE_URL`
- nginx hanya wiring/proxy
- Telegram tetap UI/panel utama via long polling

Contoh contract target saat ini:

```bash
PUBLIC_BASE_URL=https://kangtrade.top
INDODAX_CALLBACK_PATH=/indodax/callback
```

Hasil final callback URL:

```bash
https://kangtrade.top/indodax/callback
```

## Telegram UI operasional

Menu utama operasional memang terdiri dari 7 kategori:

1. `⚡ Execute Trade`
2. `🚨 Emergency Controls`
3. `📡 Monitoring`
4. `📦 Positions`
5. `⚙️ Settings`
6. `👤 Accounts`
7. `🧪 Backtest`

Submenu saat ini sudah memecah flow utama menjadi:

- monitoring / laporan / intelligence / spoof / pattern / logs
- positions / orders / manual buy / manual sell
- strategy settings / risk settings
- accounts list / upload / reload
- backtest run top / run all / last result

Whitelist Telegram tetap ketat lewat `TELEGRAM_ALLOWED_USER_IDS`.

## Storage dan persistence yang dipakai nyata

- akun: `data/accounts/accounts.json`
- meta akun: `data/accounts/accounts-meta.json`
- runtime state: `data/state/runtime-state.json`
- orders: `data/state/orders.json`
- positions: `data/state/positions.json`
- trades: `data/state/trades.json`
- callback events: `data/history/indodax-callback-events.jsonl`
- pair history: `data/history/pair-history.jsonl`
- anomaly events: `data/history/anomaly-events.jsonl`
- pattern outcomes: `data/history/pattern-outcomes.jsonl`
- execution summaries: `data/history/execution-summaries.jsonl`
- trade outcomes: `data/history/trade-outcomes.jsonl`
- backtest results: `data/backtest/*.json`

## Env contract

Salin `.env.example` menjadi `.env`, lalu isi minimal:

- `PUBLIC_BASE_URL`
- `APP_PORT`
- `APP_BIND_HOST`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`
- `INDODAX_CALLBACK_PATH`
- `INDODAX_CALLBACK_PORT`
- `INDODAX_CALLBACK_BIND_HOST`
- `INDODAX_CALLBACK_ALLOWED_HOST`
- `INDODAX_ENABLE_CALLBACK_SERVER`
- `INDODAX_HISTORY_MODE`
- `INDODAX_PUBLIC_BASE_URL`
- `INDODAX_PRIVATE_BASE_URL`
- `INDODAX_TRADE_API_V2_BASE_URL`
- `DATA_DIR`
- `LOG_DIR`
- `TEMP_DIR`

`.env.example` sekarang sudah sinkron dengan variabel yang benar-benar dipakai source. Path-path turunan seperti file accounts/state/history **tidak** diisi manual di env karena memang dibentuk oleh code dari `DATA_DIR`.

## Instalasi dan menjalankan lokal

```bash
yarn install
cp .env.example .env
yarn lint
yarn build
yarn dev
```

Jika `INDODAX_ENABLE_CALLBACK_SERVER=true`, callback server ikut start saat app dijalankan.

## Render nginx

Setelah `.env` siap, jalankan:

```bash
yarn render:nginx
```

Output final:

```bash
deploy/nginx/mafiamarkets.nginx.conf
```

Template nginx saat ini memang meneruskan header berikut:

- `Host`
- `X-Forwarded-Host`
- `X-Forwarded-For`
- `X-Forwarded-Proto`

## Verifikasi lokal cepat

Health app:

```bash
curl http://127.0.0.1:${APP_PORT}/healthz
```

Health callback:

```bash
curl http://127.0.0.1:${INDODAX_CALLBACK_PORT}/healthz
```

## Test / probe yang benar-benar tersedia

`package.json` saat ini hanya menyediakan script:

- `yarn lint`
- `yarn build`
- `yarn dev`
- `yarn start`
- `yarn render:nginx`

Probe repo memang tersedia, tetapi dijalankan langsung via `tsx`, bukan lewat script package khusus.

Contoh pola run probe:

```bash
set -a
source .env
set +a
DATA_DIR=/tmp/cukong-probe ./node_modules/.bin/tsx tests/http_servers_probe.ts
```

Daftar probe penting yang tersedia nyata:

- `tests/runtime_backend_regression.ts`
- `tests/worker_timeout_probe.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/execution_summary_failed_probe.ts`
- `tests/telegram_menu_navigation_probe.ts`
- `tests/telegram_slippage_confirmation_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/private_api_v2_mapping_probe.ts`
- `tests/http_servers_probe.ts`
- `tests/nginx_renderer_probe.ts`
- `tests/app_lifecycle_servers_probe.ts`

## Deploy / ingress checklist

1. Isi `.env` production yang benar
2. Jalankan `yarn build`
3. Jalankan `yarn render:nginx`
4. Terapkan `deploy/nginx/mafiamarkets.nginx.conf` ke server ingress yang benar
5. Pastikan `/healthz` menuju app server dan `/indodax/callback` menuju callback server
6. Verifikasi publik:

```bash
curl -i https://your-domain/healthz
curl -i https://your-domain/indodax/callback
```

Jika `/healthz` masih mengembalikan HTML page atau `/indodax/callback` masih mengembalikan respons gate/non-repo, maka ingress publik belum memakai wiring repo ini.

## Catatan jujur

- repo internal saat ini sudah sinkron dan tervalidasi lewat lint, build, dan seluruh probe utama
- repo ini **siap dipakai sebagai source of truth internal**, tetapi **belum boleh diklaim live publik** selama ingress/domain aktif belum benar-benar diarahkan ke runtime repo ini
- untuk audit teknis final dan status komponen blueprint, lihat `REFACTOR_LOG.md`
- untuk ringkasan sesi berikutnya, lihat `SESSION_CONTEXT_NEXT.md`
