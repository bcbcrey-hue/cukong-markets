# SESSION_CONTEXT_NEXT

Repository aktif: `https://github.com/masreykangtrade-oss/cukong-markets`

Branding/package naming final: `cukong-markets`.

Gunakan file ini sebagai ringkasan cepat yang sinkron dengan `REFACTOR_LOG.md`, `README.md`, `.env.example`, dan `package.json`.

---

## 1. Posisi project yang sekarang harus dianggap benar

- repo internal sudah sinkron dan tervalidasi
- callback publik final = `PUBLIC_BASE_URL + INDODAX_CALLBACK_PATH`
- route internal tetap stabil di `/healthz` dan `/indodax/callback`
- Telegram tetap UI utama via long polling
- akun tetap disimpan di `data/accounts/accounts.json`
- `executionMode` live vs simulated tampil eksplisit di health, Telegram, dan log startup

---

## 2. Status history/recovery Indodax

- **non-parsial untuk scope migrasi history/recovery**
- order history canonical: `GET /api/v2/order/histories`
- trade history canonical: `GET /api/v2/myTrades`
- runtime utama tidak lagi fallback ke legacy `orderHistory` / `tradeHistory`
- order history V2 sekarang memakai explicit `startTime/endTime`, bounded lookup `<= 7 hari`, dan chunked search deterministik
- `myTradesV2` memakai `symbol + orderId`

---

## 3. Method yang tetap di `/tapi` dan memang masih benar

- `trade`
- `openOrders`
- `getOrder`
- `cancelOrder`
- `getInfo`

Catatan: jangan overclaim full migration semua private API. Yang selesai adalah migrasi **history/recovery ke V2**.

---

## 4. History mode env yang berlaku

- default final: `v2_only`
- `legacy` masih tersedia hanya sebagai jalur eksplisit/manual
- `v2_prefer` dipetakan sebagai alias kompatibilitas ke `v2_only`, jadi tidak lagi membuat runtime hybrid

---

## 5. Validasi yang sudah lulus

- `yarn lint`
- `yarn typecheck:probes`
- `yarn build`
- `yarn test:probes`
- `tests/private_api_v2_mapping_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/callback_reconciliation_probe.ts`
- seluruh probe utama lain di folder `tests/`

---

## 6. Blocker tersisa

### Dalam repo

- tidak ada blocker correctness tersisa untuk scope migrasi history/recovery

### Luar repo / deploy / ingress

- domain publik aktif belum dibuktikan mengarah ke runtime repo ini

---

## 7. Next focus yang relevan

1. verifikasi deploy/infrastructure agar domain publik benar-benar memakai runtime repo ini
2. bila perlu, tambah smoke test bootstrap penuh app start → health → callback → recovery
3. pertahankan dokumentasi tetap jujur: V2 canonical untuk history/recovery, `/tapi` tetap dipakai hanya untuk method yang masih resmi
