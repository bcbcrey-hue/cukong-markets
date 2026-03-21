A) VERDICT GLOBAL
BELUM SIAP LIVE

B) RINGKASAN EKSEKUTIF
Yang kuat: wiring arsitektur inti memang nyata: bootstrap → createApp → start runtime, persistence/state load, polling jobs, execution engine, server HTTP healthz, callback server, dan Telegram handler terhubung langsung dalam lifecycle runtime. Bukan sekadar file ada.

Yang lemah/kritis: bukti “live trading benar-benar aman di exchange nyata” belum ada di repo; mayoritas pembuktian masih probe/simulasi/mock. Jalur order live memang ada di kode, tapi belum ada bukti runtime real-exchange non-destruktif dari repo ini.

Masalah readiness verifikasi: pipeline test:probes resmi saat ini rapuh/putus di environment aktual karena ketergantungan yarn + lockfile, dan runner probe hardcode cwd: '/app' dengan binary relatif ./node_modules/.bin/tsx. Ini membuat “klaim lulus probe” tidak bisa direproduksi langsung dari checkout ini.

C) TEMUAN PER AREA
1) Bootstrap & app lifecycle
ADA LOGIC + ADA WIRING: bootstrap memuat runtime modules, memastikan direktori runtime, lalu createApp() dan app.start().

ADA observability fase startup: phase wrapper dengan error cause-chain sudah ada.

Kesimpulan: lifecycle inti terhubung.

2) Config & env
ADA contract env ketat: TELEGRAM_BOT_TOKEN wajib; callback path dipaksa stabil (/indodax/callback), validasi prod-route ada.

Mismatch dokumentasi: README klaim .env.example ada, tapi pada source checkout ini tidak ditemukan file tersebut (lihat cek command di bawah). Klaim docs jadi tidak tervalidasi oleh source saat ini.

3) Telegram flow
ADA WIRING nyata: bot dibuat dengan token env, handler diregister, ada flow menu/callback/action/start-stop runtime/manual buy-sell/upload account.

ADA access control: user yang tidak allowlisted ditolak.

Kesimpulan: flow Telegram nyata terhubung.

4) Exchange / Indodax integration
Public API: ada fetch ticker/depth + retry retriable status/network.

Private API: ada sign HMAC, post trade/cancel/getOrder/openOrders, plus V2 histories/myTrades mapping normalizer.

Client wiring: IndodaxClient.forAccount mengikat credential account ke PrivateApi.

Kesimpulan: integrasi ada dan terhubung secara kode.

5) Trading execution (create/cancel/status)
Create buy/sell live & simulated ada: mode simulated dan live dipisah jelas; live submit ke api.trade.

Status sync ada: via openOrders/getOrder/orderHistoryV2/myTradesV2 fallback.

Cancel all ada: cancel ke exchange jika ada exchangeOrderId; order submission_uncertain tanpa id ditandai unresolved.

Kesimpulan: flow eksekusi nyata, tapi runtime real-exchange masih BELUM TERBUKTI.

6) Position tracking
ADA position ledger: open/applyBuyFill/closePartial/mark update + persistence.

Kesimpulan: terhubung.

7) Risk engine / safety control
ADA guard entry: max posisi, size, spread, cooldown, confidence, spoof threshold.

ADA exit guard: TP/SL/trailing stop.

Kesimpulan: risk logic nyata, bukan placeholder.

8) Callback / webhook server
ADA server callback nyata: host allowlist, path check, method check, event persistence, journaling, dan hook rekonsiliasi execution.

Kesimpulan: callback flow terhubung.

9) Healthcheck
ADA /healthz app server dan callback server health endpoint.

Kesimpulan: healthcheck ada.

10) Persistence / state / recovery
ADA storage runtime: state, settings, health, orders, positions, journal, histories, callback events/state.

ADA startup recovery: recoverLiveOrdersOnStartup() dipanggil saat start app.

Kesimpulan: persistence/recovery ada.

11) Scheduler / worker / background jobs
ADA scheduler polling jobs: market-scan, position-monitor, health-heartbeat.

ADA worker pool: thread pool + timeout + respawn + inline fallback.

Kesimpulan: background process terhubung.

12) Logging / observability
ADA structured logging + redact secret fields.

ADA startup phase logs dan error wrapping.

13) Build / lint / typecheck / probe
Build/lint/typecheck ada script-nya dan bisa dijalankan via npm (sebagian).

Probe runner bermasalah runtime path/cwd: cwd: '/app' + relative binary path.

Kesimpulan: verifikasi otomatis BELUM SIAP sebagai bukti final karena eksekusi resmi tidak stabil di checkout ini.

14) Deploy/runtime readiness
Untuk deploy source: secara struktur runtime cukup matang.

Untuk live trading: tetap BELUM SIAP LIVE (bukti real exchange belum ada + pipeline bukti resmi masih rapuh).

D) TEMUAN PER-FILE KRITIS
src/app.ts
Fungsi: komposisi dependency + lifecycle start/stop + polling orchestration + server start + callback + telegram. Dipakai runtime langsung via bootstrap. Wiring nyata. Risiko utama: jika salah satu fase gagal, status jadi ERROR (bagus), tapi klaim readiness tetap tergantung bukti eksternal yang tidak ada di repo.

src/domain/trading/executionEngine.ts
Fungsi: core execution buy/sell/sync/recovery/submission_uncertain. Dipakai langsung oleh app runtime + callback reconciliation. Logic sangat besar dan nyata. Risiko: kompleksitas tinggi; live behavior akhir tetap butuh bukti runtime exchange.

src/integrations/indodax/privateApi.ts
Fungsi: signing + private endpoint + V2 mapping histories/trades. Dipakai oleh execution engine via client/account. Risiko: mapping response fleksibel tapi bergantung format exchange yang bisa berubah; tanpa live contract test berkala, rawan drift.

src/integrations/indodax/callbackServer.ts
Fungsi: webhook receiver + allowlist + persist event + invoke reconcile hook. Dipakai runtime saat callback enabled. Wiring nyata. Risiko: autentikasi callback hanya host allowlist, belum ada signature verification payload di kode ini.

scripts/run-probes.mjs
Fungsi: runner probe resmi. Dipakai test:probes. Bug kritis: path execution hardcoded (cwd: '/app') + binary relatif. Ini bisa memutus pembuktian otomatis di environment non-/app.

package.json
Fungsi: kontrak build/lint/test. Issue readiness: script probe bergantung yarn walau environment nyata bisa jalan via npm; menyebabkan kegagalan operasional validasi.

E) DAFTAR MISMATCH DOCS VS SOURCE
README klaim .env.example “benar-benar ada”, namun pada checkout ini file tersebut tidak ada (cek command rg --files -g '.env*' menghasilkan kosong). Klaim docs tidak match kondisi source saat ini.

README klaim yarn test:probes lulus, tetapi script resmi saat ini gagal dijalankan pada environment ini (yarn lockfile/tooling issue + path issue runner probe). Jadi klaim “sudah diverifikasi” belum reproducible dari source checkout ini.

F) DAFTAR BLOCKER PALING KRITIS (urut bahaya)
Tidak ada bukti runtime real-exchange non-destruktif untuk flow live buy/sell/cancel/sync → risiko finansial langsung bila dianggap siap live.

Pipeline pembuktian resmi (test:probes) tidak robust/reproducible di checkout ini → quality gate readiness jadi lemah.

Callback security bergantung host allowlist saja (tidak terlihat signature verification payload) → spoofing risk pada layer callback jika infrastruktur perimeter lemah.

G) BUKTI YANG MASIH BELUM TERPENUHI
BELUM TERBUKTI RUNTIME: end-to-end live order accepted/rejected/partial fill di exchange real dengan artefak bukti test non-destruktif.

BELUM TERBUKTI RUNTIME: robust recovery di kondisi network partition nyata (khususnya submission_uncertain edge-case multi-order mirip).

BELUM TERBUKTI RUNTIME: reproducible official probe pass dari checkout bersih pada environment standar (tanpa asumsi /app + lockfile khusus).

H) REKOMENDASI TINDAKAN
Wajib sebelum live
Buat dan jalankan live shadow-run testplan (real exchange, nominal kecil, non-destruktif) untuk create/cancel/sync/recovery.

Perbaiki test:probes agar tidak hardcode cwd: '/app' dan tidak tergantung setup lockfile yang tidak ada.

Tambahkan autentikasi callback berbasis signature/token (bukan host allowlist saja).

Bagus diperbaiki (non-blocking immediate)
Tambah integration contract tests berkala untuk payload mapping V2.

Tambah failover metrics (latency/error-rate per endpoint exchange).

Kosmetik/dokumentasi
Sinkronkan README dengan kondisi source aktual (termasuk status .env.example dan cara run probe yang benar-benar reproducible).

Pemeriksaan yang dijalankan
✅ npm run lint

✅ npm run build

✅ npm run typecheck:probes

❌ npm run test:probes (gagal: yarn workspace/lockfile error pada environment ini)

❌ node scripts/run-probes.mjs (gagal: spawn ./node_modules/.bin/tsx ENOENT, terkait path runner)
