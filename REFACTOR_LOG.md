# REFACTOR_LOG

Repository aktif: `https://github.com/masreykangtrade-oss/cukong-markets`

Branding/package naming final yang berlaku: `cukong-markets`.

Dokumen ini merefleksikan status source aktual setelah migrasi history/recovery Indodax ke V2 diselesaikan.

---

## 1. Kesimpulan tegas saat ini

- **history/recovery/reconcile untuk scope migrasi sekarang non-parsial**
- order history runtime canonical ke `GET /api/v2/order/histories`
- trade history runtime canonical ke `GET /api/v2/myTrades`
- runtime V2 utama tidak lagi fallback ke legacy `orderHistory` / `tradeHistory`
- method private API lain seperti `trade`, `openOrders`, `getOrder`, dan `cancelOrder` tetap memakai `/tapi` karena dokumentasi resmi masih menyatakannya valid

---

## 2. Perubahan source inti yang benar-benar selesai

### `src/integrations/indodax/privateApi.ts`

- `orderHistoriesV2()` sekarang mengikuti docs resmi V2 secara ketat:
  - hanya kirim `symbol`, `startTime`, `endTime`, `limit`, `sort`
  - **tidak lagi** mengirim `orderId` ke endpoint order history
  - validasi range maksimum 7 hari per request
- `myTradesV2()` tetap memakai `symbol + orderId` sesuai docs resmi
- normalizer response diselaraskan ke payload resmi V2 (`orderId`, `clientOrderId`, `symbol`, `side`, `oriQty`, `executedQty`, `tradeId`, `commission`, `commissionAsset`, dll)

### `src/domain/trading/executionEngine.ts`

- `loadTradeStats()` canonical ke V2 untuk runtime normal
- `loadOrderHistorySnapshot()` canonical ke V2 untuk runtime normal
- recovery order history V2 sekarang memakai:
  - windowed search eksplisit berbasis waktu lokal order
  - batas `<= 7 hari` per request
  - chunked lookup deterministik ke belakang/ke depan bila window awal tidak cukup
  - stop segera saat order target ditemukan
  - journal yang jelas saat target order tidak ditemukan
- fallback runtime ke legacy `orderHistory` / `tradeHistory` di jalur utama dihapus
- trade stats V2 tetap dipakai untuk partial fill, weighted average fill, fee, dan update posisi

### `src/config/env.ts`

- default final `INDODAX_HISTORY_MODE` sekarang `v2_only`
- `v2_prefer` dipertahankan hanya sebagai alias kompatibilitas ke `v2_only`
- `legacy` tetap tersedia sebagai jalur eksplisit/manual, bukan jalur normal production

### `src/app.ts`

- heartbeat health dan startup log kini menampilkan `historyMode`
- status runtime memperjelas apakah jalur history sedang `V2_CANONICAL` atau `LEGACY_EXPLICIT`

### Probe yang diperbarui

- `tests/private_api_v2_mapping_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/callback_reconciliation_probe.ts`

---

## 3. Status contract Indodax yang sekarang benar

### Canonical V2 untuk history/recovery

- `GET /api/v2/order/histories`
- `GET /api/v2/myTrades`

### `/tapi` yang tetap sah dan memang masih dipakai

- `getInfo`
- `trade`
- `openOrders`
- `getOrder`
- `cancelOrder`

Catatan jujur:

- repo ini **tidak** mengklaim full migration semua private API
- yang selesai di sini adalah **migrasi history/recovery ke V2**

---

## 4. Status komponen besar

| Komponen | Status final | Catatan |
| --- | --- | --- |
| `src/domain/trading/ExecutionEngine` | implemented & connected | history/recovery V2 canonical, recovery non-hybrid untuk scope migrasi |
| `src/integrations/indodax` | implemented & connected | wrapper V2 + `/tapi` resmi berjalan berdampingan sesuai docs |
| callback server | implemented & connected | callback accepted tetap memicu reconcile order aktif |
| Telegram operational UI | implemented & connected | UX utama tetap dipertahankan |
| nginx renderer | implemented & connected | env-driven dan sinkron ke branding final |
| public runtime ingress | belum terbukti dari repo ini | butuh verifikasi deploy/runtime terpisah |

---

## 5. Validasi nyata yang lulus

- `yarn install`
- `yarn lint`
- `yarn typecheck:probes`
- `yarn build`
- `yarn test:probes`
- `tests/private_api_v2_mapping_probe.ts`
- `tests/indodax_history_v2_probe.ts`
- `tests/live_execution_hardening_probe.ts`
- `tests/callback_reconciliation_probe.ts`
- `tests/runtime_backend_regression.ts`
- `tests/http_servers_probe.ts`
- `tests/app_lifecycle_servers_probe.ts`
- `tests/telegram_menu_navigation_probe.ts`
- `tests/telegram_slippage_confirmation_probe.ts`
- `tests/execution_summary_failed_probe.ts`
- `tests/nginx_renderer_probe.ts`
- `tests/worker_timeout_probe.ts`

Probe history/recovery kini membuktikan hal berikut:

- recovery order history V2 tetap bekerja untuk order `> 24 jam`
- recovery order history V2 tetap bekerja untuk order `> 7 hari` lewat chunked lookup
- `myTradesV2` benar-benar memakai `orderId`
- startup recovery tidak lagi membutuhkan legacy `orderHistory` / `tradeHistory`
- callback reconcile tetap hidup

---

## 6. Blocker jujur yang tersisa

### Dalam repo

- tidak ada blocker correctness untuk scope migrasi history/recovery yang tersisa

### Di luar repo

- domain publik aktif belum dibuktikan mengarah ke runtime repo ini
- jadi yang belum terbukti sekarang adalah deploy/runtime publik, bukan lagi wiring source history/recovery

---

## 7. Ringkasan akhir

Source repo sekarang sinkron, jujur, dan siap dipakai sebagai source of truth internal. Jalur history/recovery Indodax sudah canonical ke V2 dan tidak lagi hybrid pada runtime utama.
