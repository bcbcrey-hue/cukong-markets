# SESSION_CONTEXT_NEXT

Repository aktif: `- https://github.com/masreykangtrade-oss/cukong-markets`

Branding/package naming final: `cukong-markets`.

Gunakan file ini sebagai ringkasan cepat yang sinkron dengan `REFACTOR_LOG.md`, `README.md`, `.env.example`, dan `package.json`.

---

## 1. Posisi project yang harus dianggap benar

- repo internal sudah sinkron dan tervalidasi
- callback publik final = `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- route internal tetap stabil di `/healthz` dan `/indodax/callback`
- Telegram tetap UI utama via long polling
- akun tetap disimpan di `data/accounts/accounts.json`
- `.env.example` sekarang ada dan sinkron dengan source nyata
- `executionMode` live vs simulated sekarang tampil eksplisit di `/healthz`, Telegram status, dan log startup

---

## 2. Status komponen blueprint besar

- implemented & connected: `MarketWatcher`, `SignalEngine`, intelligence pipeline / `OpportunityAssessment`, microstructure, history, backtest, workers, Telegram operational UI, callback server, nginx renderer
- implemented but partial: `ExecutionEngine` karena recovery/history masih hybrid legacy `/tapi` + V2 dan restart safety masih bergantung storage lokal
- exists but not yet proven in public runtime: public ingress `/healthz` dan `/indodax/callback`

---

## 3. Concern separation yang berlaku

- publik: `PUBLIC_BASE_URL` + `INDODAX_CALLBACK_PATH`
- internal route stabil: `/healthz`, `/indodax/callback`
- vendor outbound: `INDODAX_PUBLIC_BASE_URL`, `INDODAX_PRIVATE_BASE_URL`, `INDODAX_TRADE_API_V2_BASE_URL`
- nginx: render/proxy dari env
- Telegram: UI/panel utama

---

## 4. Status contract Indodax

- status final: hybrid legacy + V2
- legacy masih dipakai untuk `trade`, `cancelOrder`, `openOrders`, `orderHistory`, `tradeHistory`, `getOrder`
- V2 nyata dipakai untuk `GET /api/v2/order/histories` dan `GET /api/v2/myTrades`
- history mode nyata: `v2_prefer | v2_only | legacy`

---

## 5. Hal yang sudah ditutup

- docs vs source sekarang sinkron
- `.env.example` yang sempat tidak ada sudah ditambahkan
- README tidak lagi overclaim live/public runtime
- source of truth dipusatkan ke `REFACTOR_LOG.md`
- jalur resmi Telegram untuk `Execution Simulated` / `Execution Live` sudah ada
- jalur resmi `yarn typecheck:probes`, `yarn test:probes`, dan `yarn verify` sudah ada

---

## 6. Blocker tersisa

### Dalam repo

- tidak ada blocker P0 correctness dari hasil audit ini
- probe callback reconciliation berbasis payload callback real (`order_id/orderId/id`) sekarang sudah ada dan lulus
- live exchange round-trip `xrp_idr` via `ExecutionEngine` sudah terbukti `CONFIRMED_LIVE`

### Luar repo / deploy / ingress

- domain publik aktif belum mengarah ke runtime repo ini
- verifikasi publik terbaru: `/healthz` masih mengembalikan HTML page, `POST /indodax/callback` masih mengembalikan `fail`

---

## 7. Package / validasi cepat

- script package yang ada: `lint`, `typecheck:probes`, `test:probes`, `verify`, `build`, `dev`, `start`, `render:nginx`
- probe tetap bisa dijalankan via `tsx tests/*.ts`, tetapi jalur resmi sekarang adalah `yarn test:probes`
- validasi yang lulus: `yarn lint`, `yarn typecheck:probes`, `yarn build`, `yarn test:probes`, seluruh probe utama di folder `tests/`, dan live round-trip `xrp_idr`

---

## 8. Next focus yang relevan

1. selaraskan deploy/infrastructure agar domain publik benar-benar memakai runtime repo ini
2. tambah probe integrasi bootstrap penuh yang menyatukan app start → `/healthz` → callback → recovery → status report sebagai satu smoke test
3. bila perlu, sederhanakan compatibility layer legacy + V2 setelah jalur live publik benar-benar stabil
