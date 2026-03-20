Berikut daftar tegas yang saya perintahkan **wajib diperbaiki** dari hasil audit source.

Catatan jujur dulu: daftar ini sudah berbasis file inti runtime/trading/Telegram/HTTP/persistence/tests yang berhasil saya audit langsung, tetapi **belum bisa saya klaim 100% seluruh tree repo tanpa sisa** karena listing rekursif repo dari connector tidak lengkap. Jadi ini adalah **daftar aktual dan keras dari area yang sudah terbukti paling load-bearing**. harap kamu audit lagi sebelum melakukan implementasi di bawah ini:

## File yang sudah saya audit langsung

Root/docs/config:
`README.md`, `REFACTOR_LOG.md`, `SESSION_CONTEXT_NEXT.md`, `cukong-markets-blueprint.md`, `package.json`, `tsconfig.json`, `scripts/render-nginx-conf.mjs`

Runtime/core/services:
`src/bootstrap.ts`, `src/app.ts`, `src/config/env.ts`, `src/core/scheduler.ts`, `src/core/shutdown.ts`, `src/core/types.ts`, `src/storage/jsonStore.ts`, `src/services/persistenceService.ts`, `src/services/stateService.ts`, `src/services/healthService.ts`, `src/services/journalService.ts`, `src/services/reportService.ts`, `src/services/summaryService.ts`, `src/services/pollingService.ts`

Accounts/settings/trading:
`src/domain/accounts/accountStore.ts`, `accountRegistry.ts`, `accountValidator.ts`, `src/domain/settings/settingsService.ts`, `src/domain/trading/orderManager.ts`, `positionManager.ts`, `riskEngine.ts`, `executionEngine.ts`

Telegram/HTTP/Indodax:
`src/integrations/telegram/bot.ts`, `handlers.ts`, `uploadHandler.ts`, `auth.ts`, `callbackRouter.ts`, `src/integrations/indodax/callbackServer.ts`, `src/server/appServer.ts`

Probe yang saya baca:
`tests/http_servers_probe.ts`, `tests/telegram_menu_navigation_probe.ts`, `tests/live_execution_hardening_probe.ts`

## Daftar semua yang harus diperbaiki agar benar-benar siap live

### P0 — wajib beres sebelum repo boleh dibilang siap live

1. **Pisahkan dengan tegas status “LIVE” vs “SIMULATED”, lalu tampilkan di health dan Telegram.**
   Ini blocker paling serius. Default settings saat ini masih `dryRun: true` dan `paperTrade: true`, sementara engine akan tetap simulasi bila `uiOnly`, `dryRun`, atau `paperTrade` aktif. Tetapi status runtime/health yang ditampilkan ke operator hanya melihat `tradingMode !== OFF` dan emergency stop, bukan mode eksekusi riil. Akibatnya operator bisa melihat “trading on” padahal bot masih simulasi. Itu sangat berbahaya untuk live-readiness. Perbaikan minimal: tambahkan field eksplisit seperti `executionMode: SIMULATED | LIVE`, tampilkan di `/healthz`, Telegram status, dan log startup.    

2. **Buat jalur resmi untuk mengubah bot dari simulasi ke live.**
   Saat ini yang terlihat di Telegram handler hanya pengaturan `trading mode`, `buy slippage`, dan `take profit`. Dari wiring yang saya audit, tidak ada jalur operator yang jelas untuk mematikan `dryRun`, `paperTrade`, dan `uiOnly`. Kalau memang live mode harus bisa dioperasikan nyata, harus ada satu jalur resmi: lewat env, file settings, atau menu Telegram admin—dan harus tervalidasi jelas. Tanpa itu, klaim “siap live” masih belum bersih.    

3. **Perbaiki README dan logika verifikasi publik untuk callback.**
   README sekarang memakai respons `405` pada `/indodax/callback` sebagai indikasi bahwa domain publik belum mengarah ke runtime repo ini. Itu salah kaprah, karena callback server di source memang sengaja mengembalikan `405 fail` untuk method selain `POST`. Jadi verifikasi publik callback harus diubah: jangan pakai `GET`, tetapi pakai `POST` dengan host/header yang sesuai. Kalau dokumentasi ini dibiarkan, operator bisa salah diagnosa deploy.   

4. **Pastikan `.env.example` benar-benar ada, sinkron, dan bisa dipakai onboarding/deploy.**
   README menjadikan `.env.example` sebagai langkah utama onboarding (`cp .env.example .env`), tetapi dalam audit ini file itu tidak berhasil saya verifikasi dari branch `main`. Jadi ini harus dianggap blocker dokumentasi-operasional sampai terbukti ada dan sinkron dengan `env.ts`. Jangan biarkan README menyuruh memakai file yang tidak benar-benar tersedia atau sudah tidak sinkron. `env.ts` sendiri punya kontrak env yang cukup banyak dan spesifik, jadi contoh env harus nyata, lengkap, dan sesuai.  

5. **Tambahkan jalur validasi resmi repo untuk probes/tests, bukan daftar manual.**
   Saat ini `package.json` hanya punya `build`, `dev`, `render:nginx`, `start`, dan `lint`, sedangkan `tsconfig.json` hanya meng-include `src/**/*.ts`. Jadi probe di `tests/**/*.ts` tidak otomatis ikut typecheck/lint normal repo, walaupun README mengklaim banyak probe penting tersedia. Untuk repo yang ingin disebut siap live, harus ada minimal satu jalur resmi seperti `yarn test:probes` atau `yarn verify`, dan idealnya file test/probe ikut typechecked lewat tsconfig terpisah atau include yang jelas.   

6. **Tambahkan probe callback-driven reconciliation yang benar-benar menembus `order_id/orderId/id -> reconcileFromCallback()`.**
   Wiring callback ke execution memang ada: callback accepted akan mengambil `order_id/orderId/id` lalu memanggil reconciliation order aktif. Tetapi dari probe yang saya audit langsung, yang benar-benar dites baru health/callback acceptance dan execution hardening umum; saya belum melihat probe end-to-end yang memastikan payload callback real benar-benar mengubah state order yang aktif. Untuk live trading, ini wajib.    

### P1 — sangat penting untuk kestabilan operasional

7. **Perbaiki bug metrik `activeJobs` di `PollingService`.**
   `LightScheduler.list()` sudah menyimpan status `active` per job, tetapi `PollingService.stats()` mengembalikan `activeJobs: jobs.length`, jadi angka job aktif bisa salah walaupun polling sedang stop. Ini kelihatannya kecil, tapi bisa merusak health/observability dan membuat operator salah membaca runtime. Perbaikan minimal: hitung `activeJobs` dari `jobs.filter(job => job.active).length`.  

8. **Tentukan satu source of truth untuk interval scanner/polling, lalu wire secara konsisten.**
   `env.ts` dan `ScannerSettings` punya `pollingIntervalMs` dan `marketWatchIntervalMs`, tetapi di wiring `app.ts` job `market-scan` didaftarkan langsung memakai `env.pollingIntervalMs`. Dari jalur yang saya audit, belum terlihat pemakaian operasional yang tegas untuk `settings.scanner.marketWatchIntervalMs`. Ini membingungkan dan berpotensi bikin operator merasa setting berubah padahal scheduler tetap jalan dengan nilai lain. Pilih satu sumber kebenaran dan rapikan.    

9. **Perbaiki contract `manualOrder()` untuk BUY.**
   Di jalur generic `manualOrder()`, notional buy dihitung dari `(request.price ?? 0) * request.quantity`. Itu artinya kalau `price` kosong, notional bisa jadi nol dan flow menjadi tidak sehat. Memang Telegram manual buy saat ini tidak memakai method itu secara langsung, tetapi method publik seperti ini tetap harus dibersihkan supaya contract-nya tidak menyesatkan. 

10. **Samakan naming artifact deploy dengan branding final repo.**
    Branding final yang tertulis adalah `cukong-markets`, tetapi renderer nginx masih memakai path/template/output bernama `mafiamarkets.nginx.conf`. Ini bukan blocker correctness, tetapi jelas berpotensi bikin deploy/operator bingung, apalagi kalau ada lebih dari satu repo atau artefak lama di server. Rapikan naming agar satu bahasa dari package name sampai deploy artifact.  

### P2 — penting untuk kejujuran status dan maintainability live

11. **Rapikan klaim dokumentasi agar selalu mengikuti source, bukan sebaliknya.**
    Secara source, repo ini memang nyata dan banyak wiring penting sudah hidup. Tetapi README dan log dokumennya masih cenderung terlalu percaya diri di beberapa kalimat. Untuk repo yang mau dijadikan source of truth internal, dokumentasi harus “lebih hati-hati daripada source”, bukan lebih berani. Fokusnya: tulis apa yang benar-benar terbukti, apa yang masih parsial, dan apa yang belum bisa dibuktikan dari deploy publik.   

12. **Tambahkan satu probe “live-readiness smoke test” yang menyatukan jalur utama.**
    Repo ini sudah punya probe yang terpisah-pisah untuk HTTP server, Telegram navigation, dan execution hardening. Langkah berikutnya yang layak adalah satu smoke test yang memastikan bootstrap → app start → `/healthz` → callback acceptance → startup recovery → status report berjalan konsisten sebagai satu paket. Ini penting agar “siap live” tidak hanya hasil menjumlahkan probe terpisah.     

## Ringkasan paling tegas

1. **Jangan biarkan status bot bilang trading aktif kalau engine masih simulasi.**
2. **Sediakan jalur resmi untuk mengubah mode simulasi ke live.**
3. **Betulkan README dan SOP verifikasi callback publik.**
4. **Pastikan `.env.example` nyata dan sinkron.**
5. **Resmikan jalur `verify/test/probe` repo.**
6. **Tambahkan probe callback reconciliation end-to-end.**
7. **Perbaiki observability kecil yang menyesatkan seperti `activeJobs`.**
8. **Rapikan source-of-truth interval scheduler dan contract manual order.**

## Verdict akhir saat ini

