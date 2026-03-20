# REFACTOR_LOG

Repository aktif: `- https://github.com/masreykangtrade-oss/cukong-markets`

Branding/package naming final yang berlaku: `cukong-markets`.

Dokumen ini adalah source of truth final untuk status implementasi repo saat ini.

---

## 1. Kesimpulan desain saat ini

Repo ini sudah sinkron secara internal untuk arsitektur backend Telegram-first yang env-driven.

Yang benar di source sekarang:

- callback publik final dibentuk dari `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- route internal inti sengaja stabil di `/healthz` dan `/indodax/callback`
- vendor outbound Indodax dipisahkan dari domain publik
- nginx hanya renderer/proxy, bukan source of truth bisnis
- Telegram tetap UI utama via long polling
- storage akun tetap di `data/accounts/accounts.json`
- mode trading tetap `OFF | ALERT_ONLY | SEMI_AUTO | FULL_AUTO`

Kesimpulan final:

- **repo internal:** sinkron dan tervalidasi
- **runtime publik aktif:** belum sinkron dengan repo ini

---

## 2. Audit area repo final

| Area | Status final | Ringkasan bukti |
| --- | --- | --- |
| root docs/config | implemented & connected | `README.md`, `REFACTOR_LOG.md`, `SESSION_CONTEXT_NEXT.md` kini sinkron; `.env.example` ditambahkan karena sebelumnya tidak ada |
| `src/config` | implemented & connected | `env.ts` membentuk callback URL final, validasi path tetap `/indodax/callback`, dan memisahkan domain publik vs vendor endpoint |
| `src/core` | implemented & connected | type contracts runtime/intelligence/execution lengkap dan dipakai lint/build/probe |
| `src/storage` | implemented & connected | `JsonStore` + `JsonLinesStore` benar-benar dipakai persistence state/history/summary |
| `src/services` | implemented & connected | persistence, state, health, journal, report, summary, polling, worker pool terhubung ke app |
| `src/domain/accounts` | implemented & connected | legacy upload JSON diterima, validasi nyata, storage tetap `data/accounts/accounts.json` |
| `src/domain/settings` | implemented & connected | settings dimuat/simpan, trading mode/slippage/take profit benar-benar mengubah state runtime; `executionMode` live/simulated kini punya jalur resmi Telegram |
| `src/domain/market` | implemented & connected | market snapshot, ticker/orderbook features, hotlist update, pair universe nyata dipakai di app |
| `src/domain/signals` | implemented & connected | scoring strategy dan `SignalEngine` dipakai sebelum opportunity assessment |
| `src/domain/intelligence` | implemented & connected | feature pipeline, probability, edge validation, timing, score explainer, opportunity engine saling terhubung |
| `src/domain/microstructure` | implemented & connected | accumulation/spoof/iceberg/cluster detector nyata dipakai oleh `FeaturePipeline` |
| `src/domain/history` | implemented & connected | pair history, anomaly, context, regime, pattern match nyata dipakai oleh `OpportunityEngine` |
| `src/domain/backtest` | implemented & connected | replay loader, simulated replay, metrics, persistence hasil backtest nyata |
| `src/domain/trading` | implemented but partial | execution/recovery/hardening nyata, callback reconciliation by exchangeOrderId sudah terhubung, tetapi restart safety lintas storage lokal masih parsial |
| `src/integrations/indodax` | implemented & connected | public API, private `/tapi`, V2 mapping, callback server, dan post-process callback ke execution reconciliation nyata dipakai |
| `src/integrations/telegram` | implemented & connected | whitelist, callback router, 7 kategori menu, upload handler, handlers nyata terhubung ke service; RUN START/STOP kini mengontrol polling runtime; execution mode live/simulated kini bisa diubah resmi dari Telegram |
| `src/server` | implemented & connected | app server `/healthz` nyata, expose callback contract runtime |
| `src/workers` | implemented & connected | feature/pattern/backtest worker nyata dipakai lewat `WorkerPoolService` |
| `tests` | implemented & connected | probe lint/build/runtime/execution/history/telegram/nginx/app lifecycle semua ada dan lulus; callback reconciliation end-to-end kini ikut tervalidasi |
| `scripts` | implemented & connected | `render-nginx-conf.mjs` benar-benar membaca env dan merender config `cukong-markets.nginx.conf` |
| `deploy/nginx` | implemented & connected | template + rendered output sinkron dengan env contract repo |
| `.env.example` | implemented & connected | sekarang sinkron penuh dengan variabel yang benar-benar dipakai source |
| `package.json` | implemented & connected | script resmi `typecheck:probes`, `test:probes`, dan `verify` kini ada di samping build/dev/start/lint/render |
| `tsconfig.json` | implemented & connected | build/typecheck source `src/**/*.ts` lulus; probe kini ikut typecheck lewat `tsconfig.probes.json` |

---

## 3. Status komponen besar blueprint

| Komponen | Status final |
| --- | --- |
| `MarketWatcher` | implemented & connected |
| `SignalEngine` | implemented & connected |
| `OpportunityAssessment / intelligence pipeline` | implemented & connected |
| `microstructure` | implemented & connected |
| `history` | implemented & connected |
| `backtest` | implemented & connected |
| `workers` | implemented & connected |
| `ExecutionEngine` | implemented but partial |
| Telegram operational UI | implemented & connected |
| callback server | implemented & connected |
| nginx renderer | implemented & connected |
| public runtime ingress | exists but not yet proven in public runtime |

Catatan penting:

- `ExecutionEngine` sudah kuat untuk correctness internal, tetapi tetap **parsial** karena recovery masih mengandalkan jalur compatibility legacy `/tapi` + V2.
- public runtime ingress tidak boleh dinaikkan statusnya karena bukti publik sekarang justru menunjukkan domain aktif belum mengarah ke runtime repo ini.

---

## 4. Pemisahan concern yang berlaku

### 4.1 Internal route yang sengaja stabil

- `/healthz`
- `/indodax/callback`

### 4.2 Source of truth env

- `PUBLIC_BASE_URL`
- `APP_PORT`
- `APP_BIND_HOST`
- `INDODAX_CALLBACK_PATH`
- `INDODAX_CALLBACK_PORT`
- `INDODAX_CALLBACK_BIND_HOST`
- `INDODAX_CALLBACK_ALLOWED_HOST`
- `INDODAX_ENABLE_CALLBACK_SERVER`
- `INDODAX_HISTORY_MODE`
- `INDODAX_PUBLIC_BASE_URL`
- `INDODAX_PRIVATE_BASE_URL`
- `INDODAX_TRADE_API_V2_BASE_URL`
- `TELEGRAM_ALLOWED_USER_IDS`

### 4.3 Yang dibentuk otomatis oleh code/template

- callback publik final = `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- `server_name` nginx dari `PUBLIC_BASE_URL`
- upstream app dari `APP_BIND_HOST + APP_PORT`
- upstream callback dari `INDODAX_CALLBACK_BIND_HOST + INDODAX_CALLBACK_PORT`
- path storage akun/state/history/backtest dari `DATA_DIR`

---

## 5. Status contract Indodax

Status final: **hybrid legacy + V2** dengan batas concern yang jelas.

### Legacy `/tapi` yang masih dipakai nyata

- `getInfo`
- `trade`
- `cancelOrder`
- `openOrders`
- `orderHistory`
- `tradeHistory`
- `getOrder`

### Trade API 2.0 yang dipakai nyata

- `GET /api/v2/order/histories`
- `GET /api/v2/myTrades`

### Hal yang benar-benar terhubung

- base endpoint V2: `INDODAX_TRADE_API_V2_BASE_URL`
- header auth: `X-APIKEY`
- signature: HMAC SHA512 atas query string
- history mode runtime: `v2_prefer | v2_only | legacy`
- `ExecutionEngine` benar-benar memilih jalur history sesuai mode tersebut

---

## 6. Status Telegram operational UI

Status final: **implemented & connected**.

Yang benar-benar ada:

- whitelist ketat lewat `TELEGRAM_ALLOWED_USER_IDS`
- main menu 7 kategori
- navigation callback router nyata dan tervalidasi probe
- legacy upload account JSON tetap diterima
- perubahan `buy slippage` dan `take profit` dari Telegram benar-benar menyimpan settings
- perubahan `executionMode` `SIMULATED` ↔ `LIVE` dari Telegram benar-benar menyimpan settings dan mematikan/menyalakan flag simulasi yang relevan
- menu backtest benar-benar men-trigger `BacktestEngine`

---

## 7. Status execution / recovery / hardening

Status final: **implemented but partial**.

Yang benar-benar ada di source dan lulus probe:

- openOrders-first reconciliation
- fallback `getOrder`
- fallback `orderHistory` / `orderHistoriesV2`
- fallback `tradeHistory` / `myTradesV2`
- duplicate BUY guard nyata
- duplicate SELL guard nyata
- stale aggressive BUY timeout cancel nyata
- recovery order/fill/position setelah restart nyata
- repeated partial BUY fill digabung ke satu posisi logis per pair/account
- fee / executed trade detail / weighted average fill dipakai untuk reconciliation
- take profit default 15% nyata di settings/risk
- execution summary + trade outcome summary nyata

Yang masih harus ditulis jujur sebagai parsial:

- jalur recovery tetap memelihara compatibility legacy + V2

---

## 8. Status callback / nginx / public runtime

### Callback server

Status: **implemented & connected**.

Yang benar-benar ada:

- bind host/port/path env-driven
- allowed host filter nyata
- prioritas `Host` langsung atas spoofed `X-Forwarded-Host`
- persist callback event dan callback state
- callback accepted memicu post-process untuk reconcile order aktif berdasarkan `exchangeOrderId` bila payload menyertakan `order_id/orderId/id`
- `/healthz` kini menampilkan `executionMode` eksplisit, sehingga operator tidak lagi hanya melihat `tradingEnabled`

### Nginx renderer

Status: **implemented & connected**.

Yang benar-benar ada:

- render `server_name` dari `PUBLIC_BASE_URL`
- render upstream app/callback dari env
- render callback block hanya bila callback server enabled

### Public runtime aktif

Status: **blocked by deploy/runtime access outside repo**.

Verifikasi publik terbaru:

- `https://kangtrade.top/healthz` merespons HTML login page, bukan JSON health server repo ini
- `POST https://kangtrade.top/indodax/callback` merespons `fail`, bukan `ok` dari callback server repo ini

Makna statusnya:

- repo ini bukan masalah utama untuk callback/app wiring internal
- ingress/domain publik aktif saat ini belum memakai runtime repo ini

---

## 9. Hal yang ditutup dalam sesi ini

- mismatch docs vs source dibersihkan
- `.env.example` yang sebelumnya tidak ada sekarang ditambahkan dan disinkronkan ke source nyata
- README dibersihkan agar tidak overclaim live/public runtime
- `REFACTOR_LOG.md` dibersihkan menjadi satu log final tanpa status lama yang bentrok
- `SESSION_CONTEXT_NEXT.md` disinkronkan ke README, REFACTOR_LOG, `.env.example`, dan `package.json`
- startup sekarang menjalankan `evaluateOpenPositions()` langsung setelah `recoverLiveOrdersOnStartup()`
- Telegram RUN START/STOP sekarang mengontrol polling runtime (bukan hanya set state)
- callback accepted sekarang bisa men-trigger reconciliation order live by `exchangeOrderId`
- `executionMode` live vs simulated sekarang tampil di health, Telegram status, dan log startup
- jalur resmi Telegram untuk `Execution Simulated` / `Execution Live` sekarang ada
- `PollingService.stats()` kini menghitung `activeJobs` dari job yang benar-benar aktif
- source of truth interval sekarang dipisah tegas: `market-scan` memakai `settings.scanner.marketWatchIntervalMs`, sedangkan job polling runtime memakai `settings.scanner.pollingIntervalMs`
- contract `manualOrder()` BUY sekarang menolak request tanpa `price` valid
- artifact nginx sekarang sinkron ke branding final `cukong-markets.nginx.conf`
- jalur resmi `yarn typecheck:probes`, `yarn test:probes`, dan `yarn verify` sekarang ada
- probe `tests/callback_reconciliation_probe.ts` sekarang menembus `order_id/orderId/id -> reconcileFromCallback()`

---

## 10. Hal yang sengaja dipertahankan

- branding/package naming: `cukong-markets`
- Telegram sebagai UI utama
- whitelist user Telegram
- legacy upload account JSON
- storage akun di `data/accounts/accounts.json`
- mode trading `OFF | ALERT_ONLY | SEMI_AUTO | FULL_AUTO`
- compatibility layer legacy `/tapi` + V2 selama masih dibutuhkan untuk recovery/history

---

## 11. Validasi nyata yang lulus

- `yarn lint`
- `yarn typecheck:probes`
- `yarn build`
- `yarn test:probes`
- `tests/private_api_v2_mapping_probe.ts`
- `tests/nginx_renderer_probe.ts`
- `tests/http_servers_probe.ts`
- `tests/telegram_menu_navigation_probe.ts`
- `tests/telegram_slippage_confirmation_probe.ts`
- `tests/callback_reconciliation_probe.ts`
- `tests/worker_timeout_probe.ts`
- `tests/runtime_backend_regression.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/execution_summary_failed_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/app_lifecycle_servers_probe.ts`
- live exchange round-trip nyata via `ExecutionEngine`: BUY lalu SELL `xrp_idr` selesai dengan trade outcome `CONFIRMED_LIVE`

---

## 12. Blocker jujur yang tersisa

### Dalam repo

- tidak ada blocker P0 correctness yang tersisa dari hasil audit ini

### Di luar repo / deploy / ingress / runtime aktif

- domain publik aktif belum mengarah ke runtime repo ini
- nginx server aktif di domain publik belum terbukti memakai hasil render config dari repo ini
- karena itu live-readiness publik masih terblokir oleh deploy/runtime access, bukan oleh wiring internal repo

---

## 13. Ringkasan tegas

Repo ini sekarang sudah sinkron secara internal, jujur secara dokumentasi, dan siap dipakai sebagai konteks sesi berikutnya. Yang belum terbukti bukan lagi source wiring internal repo, tetapi domain publik/infrastructure aktif di luar repo ini.
