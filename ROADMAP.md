# Roadmap — Cukong-Markets

## 1\. Ringkasan eksekutif

Cukong-Markets adalah backend TypeScript untuk operasi market Indodax dengan kontrol utama via Telegram. Sistem ini bukan hanya bot chat, tetapi gabungan dari:

* runtime app
* scanner market
* scoring/signal
* intelligence/opportunity engine
* execution engine
* order/position state
* callback reconciliation
* HTTP health server
* backtest/replay
* shadow-run non-destruktif

Target akhir yang masuk akal untuk project ini bukan sekadar “bot bisa jalan”, tetapi:

1. bot bisa start/stop dengan aman,
2. bot bisa observasi market dan memberi keputusan yang bisa dijelaskan,
3. bot bisa eksekusi buy/sell sesuai mode,
4. bot bisa recovery saat order status ambigu,
5. bot bisa diaudit dari Telegram, log, health endpoint, dan bukti eksekusi,
6. bot bisa diuji secara non-destruktif sebelum live trading benar-benar diaktifkan.

\---

## 2\. Tujuan bisnis dan fungsi riil bot

### 2.1 Tujuan bisnis utama

Tujuan bisnis yang paling logis dari source saat ini adalah:

* membantu operator memantau peluang pair di Indodax,
* memberi shortlist pair yang layak diperhatikan,
* mendukung eksekusi manual, semi-otomatis, atau full-auto,
* menjaga keselamatan operasional dengan risk guard, callback verification, recovery logic, dan emergency control,
* menyediakan jejak audit yang cukup untuk mengecek apa yang terjadi sebelum, saat, dan sesudah trade.

### 2.2 Tujuan bisnis yang BELUM terbukti penuh

Yang belum terbukti penuh dari source/probe saja:

* profitabilitas strategi di market nyata,
* stabilitas live trading jangka panjang di VPS production,
* kesiapan incident response/operator untuk kondisi exchange aneh,
* pembuktian live order nyata end-to-end dalam jam/hari operasi produksi.

Jadi roadmap harus jujur membedakan:

* **fungsi sistem sudah ada**, dan
* **fungsi bisnis sudah menghasilkan outcome nyata di produksi**.

\---

## 3\. Peta fungsi utama bot berdasarkan source

### 3.1 Runtime dan bootstrap

Peran:

* load module runtime,
* pastikan direktori data/log ada,
* buat app,
* start app,
* fail loudly jika bootstrap rusak.

Makna operasional:

* bot ini memang dirancang sebagai aplikasi backend, bukan script Telegram sekali jalan.

Tujuan tahap ini:

* startup harus deterministik,
* kegagalan harus terlihat jelas,
* direktori runtime harus konsisten.

### 3.2 App orchestration

Peran:

* menyusun semua service inti,
* load persistence/state/settings/accounts/orders/positions/journal/health,
* start worker pool,
* start HTTP app server,
* start callback server,
* start Telegram bot,
* start polling loop,
* update health/readiness.

Makna operasional:

* ini adalah “wiring pusat”.
* hampir semua readiness live bergantung pada kestabilan file ini.

### 3.3 Telegram sebagai control plane utama

Peran:

* main menu dan submenu,
* start/stop runtime,
* status,
* market watch/hotlist/intelligence/logs,
* manual buy/manual sell,
* settings dan risk,
* accounts,
* backtest,
* shadow-run,
* emergency controls.

Makna operasional:

* Telegram di sini bukan aksesori; dia adalah panel operasi utama operator.

Tujuan:

* operator harus bisa menjalankan bot tanpa shell untuk aksi rutin,
* navigasi harus konsisten,
* flow sensitif harus aman dan jelas.

### 3.4 Account management

Peran:

* simpan akun runtime di `data/accounts/accounts.json`,
* tetap menerima upload format legacy array,
* bisa add manual/delete/reload,
* punya default account,
* metadata storage tersimpan.

Makna operasional:

* bot ini dibuat untuk bisa memakai banyak account, tetapi tetap dengan satu jalur storage runtime yang konsisten.

Tujuan:

* kredensial tidak ambigu,
* path storage konsisten,
* migrasi dari format lama tidak memutus operasional.

### 3.5 Market watcher

Peran:

* ambil ticker dan orderbook Indodax,
* pilih pair target berdasarkan volume,
* bangun snapshot market,
* simpan history ringkas,
* infer trade print dari perubahan ticker/volume.

Makna operasional:

* ini sumber observasi pasar untuk pipeline berikutnya.

Tujuan:

* scanner harus cukup cepat, cukup stabil, dan tidak liar dalam pemilihan pair.

### 3.6 Signal engine

Peran:

* ubah market snapshot menjadi signal candidate,
* hitung score, confidence, warning, regime, imbalance, spread, liquidity, change 1m/5m.

Makna operasional:

* ini lapisan “apakah pair ini menarik atau tidak”.

Tujuan:

* setiap kandidat pair punya alasan yang bisa dijelaskan,
* score bukan angka kosong.

### 3.7 Opportunity / intelligence engine

Peran:

* pakai historical context + microstructure + probability + edge validation + entry timing,
* hasilkan `OpportunityAssessment` dengan finalScore, pumpProbability, trapProbability, spoofRisk, recommendedAction.

Makna operasional:

* ini lapisan keputusan yang lebih matang daripada signal kasar.
* titik ini adalah jembatan antara observasi market dan keputusan entry.

Tujuan:

* peluang harus dinilai bukan hanya dari momentum, tetapi juga risiko jebakan dan kualitas timing.

### 3.8 Worker pool

Peran:

* jalankan feature task, pattern task, dan backtest task di worker thread,
* fallback inline jika worker mati/tidak aktif,
* punya timeout, respawn, dan metadata runtime worker.

Makna operasional:

* worker dipakai untuk menjaga beban intelligence/backtest tidak menahan runtime utama.

Tujuan:

* produksi tidak tergantung pada dev-only tsx worker,
* worker path dist harus benar di environment production.

### 3.9 Execution engine

Peran:

* auto decision,
* manual order / auto buy / manual sell,
* simulated vs live mode,
* sync order aktif,
* reconcile order dari exchange,
* cancel stale buy,
* recover order saat startup,
* emergency cancel all / sell all,
* shadow-run non-destruktif.

Makna operasional:

* ini jantung bot.
* hampir semua risiko live trading berasal dari file ini.

Tujuan:

* order creation aman,
* order ambiguity tidak bikin bot buta,
* posisi dan order tetap sinkron dengan exchange sebisa mungkin.

### 3.10 Position \& order lifecycle

Peran:

* order disimpan lokal,
* fill delta diubah jadi perubahan posisi,
* buy fill membuka/menambah posisi,
* sell fill menutup sebagian/penuh posisi,
* mark-to-market update memengaruhi unrealized PnL,
* hasil trade dipublish ke summary.

Makna operasional:

* bot ini bukan sekadar submit order; ia juga mencoba memelihara model portofolio lokal.

Tujuan:

* operator bisa melihat posisi dan PnL dengan masuk akal,
* exit logic bekerja atas posisi nyata yang tercatat.

### 3.11 Callback server

Peran:

* terima callback Indodax di path stabil `/indodax/callback`,
* validasi host,
* validasi signature/timestamp/nonce jika auth required,
* simpan event callback,
* panggil reconciliation ke execution engine.

Makna operasional:

* ini jalur penting untuk mempercepat sinkronisasi order dari exchange ke state lokal.

Tujuan:

* callback aman,
* callback tidak bisa dipalsukan dengan mudah,
* callback rejection tercatat.

### 3.12 HTTP app server dan health

Peran:

* expose `/healthz`, `/livez`, `/`,
* tampilkan readiness/live status,
* tampilkan callback config dan execution mode,
* bantu VPS/proxy/operator cek status runtime.

Makna operasional:

* ini penting untuk deploy, monitoring, dan reverse proxy.

Tujuan:

* operator dan infra bisa tahu bot sehat atau tidak tanpa Telegram.

### 3.13 Summary, journal, dan bukti audit

Peran:

* publish execution summary,
* publish trade outcome summary,
* simpan JSONL/history,
* broadcast notifikasi ke Telegram,
* simpan log journal terstruktur.

Makna operasional:

* ini lapisan audit trail.

Tujuan:

* setiap perubahan penting harus meninggalkan jejak.

### 3.14 Backtest

Peran:

* replay snapshot historis,
* hasilkan signal/opportunity selama replay,
* simulasi open/exit posisi,
* hitung outcome metrics,
* simpan hasil backtest.

Makna operasional:

* dipakai sebagai alat evaluasi strategi dan sanity check, bukan bukti live readiness.

Tujuan:

* parameter strategi bisa diuji sebelum menyentuh live mode.

### 3.15 Shadow-run

Peran:

* jalur non-destruktif ke exchange nyata,
* cek public market, private auth, dan reconciliation read model,
* simpan evidence hasil uji,
* diblok saat runtime utama masih RUNNING.

Makna operasional:

* ini adalah jembatan paling penting antara “lulus probe source” dan “berani ke live”.

Tujuan:

* membuktikan konektivitas dan kesiapan akun tanpa submit order destruktif.

\---

## 4\. Alur kerja bot dari start sampai trade

### 4.1 Boot

1. env dibaca,
2. direktori runtime dibuat,
3. persistence/bootstrap dijalankan,
4. state/settings/accounts/orders/positions/journal/health di-load,
5. worker pool disiapkan,
6. HTTP app server start,
7. callback server start bila aktif,
8. startup recovery order live dijalankan,
9. posisi dievaluasi,
10. Telegram start,
11. polling loop aktif,
12. health/readiness di-set ready.

### 4.2 Loop observasi market

1. market scan periodik jalan,
2. ticker + depth diambil,
3. snapshot disimpan,
4. signal dihitung,
5. opportunity dihitung,
6. hotlist di-update,
7. state snapshot disimpan,
8. posisi aktif di-mark ke harga terbaru.

### 4.3 Jalur keputusan entry

1. opportunity teratas dipilih,
2. rule strategy + risk dicek,
3. bila `FULL\_AUTO` dan lolos threshold, `attemptAutoBuy()` dipanggil,
4. bila manual, operator pilih pair di Telegram lalu masukkan nominal IDR.

### 4.4 Jalur eksekusi buy

1. validasi account,
2. pastikan tidak ada active buy order pada pair/account sama,
3. risk check enter,
4. validasi reference price, entry price, quantity,
5. buat order lokal,
6. jika simulated: mark filled lokal dan buka posisi,
7. jika live: submit ke exchange,
8. simpan exchangeOrderId bila ada,
9. sync order dari exchange,
10. publish summary.

### 4.5 Jalur eksekusi sell

1. pilih posisi,
2. hitung quantity yang akan dijual,
3. cek active sell order,
4. buat order lokal,
5. simulated atau live submit,
6. sync hasil fill,
7. update posisi,
8. publish execution summary dan trade outcome.

### 4.6 Jalur recovery dan ambiguity

1. sync active orders berkala,
2. coba cocokkan lewat openOrders,
3. jika tidak cukup, cek history,
4. jika masih ambigu, tandai `submission\_uncertain`,
5. jika terlalu lama tak terpecahkan, tandai `submission\_uncertain\_unresolved`,
6. emergency cancel tidak memaksa cancel order ambigu tanpa `exchangeOrderId`.

### 4.7 Jalur callback

1. callback diterima,
2. host/signature/timestamp/nonce diverifikasi,
3. event disimpan,
4. `exchangeOrderId` diambil,
5. reconciliation dijalankan,
6. order/position bisa berubah bila callback cocok.

\---

## 5\. Penilaian jujur kondisi saat ini

## 5.1 Yang sudah matang di level source/probe

* bootstrap/runtime terstruktur,
* probe verify resmi ada,
* official probes sudah menutup banyak jalur penting,
* Telegram control plane sudah terhubung nyata,
* callback security/reconciliation sudah punya jalur nyata,
* worker production runtime sudah dipikirkan,
* submission-uncertain handling sudah serius,
* ada health endpoint,
* ada backtest,
* ada shadow-run.

## 5.2 Yang sudah matang tapi tetap butuh validasi lapangan

* order sync/recovery,
* callback security di balik proxy/domain nyata,
* worker dist runtime di VPS nyata,
* pacing/rate-limit terhadap exchange nyata,
* akun real multi-account,
* observability jangka panjang,
* perilaku saat proses restart/redeploy.

## 5.3 Yang belum boleh diklaim matang penuh

* siap live trading production end-to-end,
* profitabilitas strategi,
* ketahanan operasional berhari-hari,
* robustness terhadap semua edge-case exchange nyata.

\---

## 6\. Definisi “point inti” dan “siap live”

## 6.1 Point inti

Point inti project ini tercapai bila:

1. fungsi bot benar-benar lengkap secara operasional,
2. seluruh jalur utama bisa dijelaskan dari source,
3. operator bisa menjalankan dan mengendalikan bot,
4. proof verify source/build/probe sudah rapih,
5. runtime di VPS bisa hidup sehat,
6. shadow-run ke exchange nyata lulus.

## 6.2 Siap live

Status **SIAP LIVE** baru layak dipakai jika semua syarat ini terpenuhi:

1. source verify resmi lulus,
2. deploy VPS sehat,
3. callback server sehat di domain nyata,
4. health/readiness valid,
5. Telegram control plane stabil,
6. shadow-run real exchange lulus,
7. eksekusi mode live diuji dengan guard ketat,
8. emergency flow bekerja,
9. rollback dan operator SOP jelas,
10. penggunaan live dimulai bertahap, bukan langsung all-in.

\---

## 7\. Roadmap implementasi matang dan eksplisit

## Fase 0 — Bekukan definisi kebenaran

### Tujuan

Mencegah project bergerak liar antara “terlihat bagus” vs “benar-benar siap dipakai”.

### Yang harus dianggap source of truth

* source repo saat ini,
* jalur verify resmi,
* env contract nyata,
* perilaku runtime nyata di VPS,
* hasil shadow-run dan live-safe checks.

### Deliverable

* satu dokumen status canonical,
* satu daftar syarat “SIAP LIVE”,
* satu daftar syarat “BELUM BOLEH DIKLAIM”.

### Done jika

* semua pihak paham bahwa lulus probe ≠ otomatis siap live.

Status saat ini:

* **praktis sudah tercapai**.

\---

## Fase 1 — Rapikan proof repo dan artefak final

### Tujuan

Menutup tahap audit/repo-verification secara bersih.

### Fokus

* pisahkan `test\_reports` final vs historical,
* indeks artefak final,
* pastikan README, REFACTOR\_LOG, SESSION\_CONTEXT\_NEXT sinkron,
* pertahankan proof literal untuk verify path.

### Fungsi bisnis

* auditor, operator, dan sesi berikutnya tidak salah membaca status repo.

### Implementasi nyata

* buat struktur folder `test\_reports/final` dan `test\_reports/history`,
* pindahkan bukti final canonical ke folder khusus,
* tambahkan `test\_reports/README.md`,
* dokumentasikan warning environment non-blocking.

### Done jika

* orang baru bisa melihat repo dan paham bukti final dalam beberapa menit.

### Risiko bila dilewati

* repo terlihat “setengah jadi” padahal inti teknisnya sudah jauh lebih matang.

Status saat ini:

* **nyaris selesai; tinggal perapihan presentasi bukti**.

\---

## Fase 2 — Validasi runtime nyata di VPS

### Tujuan

Membuktikan bahwa wiring source benar-benar hidup di environment target.

### Fokus teknis

* process start,
* env terbaca benar,
* direktori data/log terbentuk,
* `/healthz` dan `/livez` benar,
* Telegram bot benar-benar connect,
* callback server listen di port/bind yang benar,
* worker path resolve benar di runtime deploy.

### Fungsi bisnis

* bot benar-benar bisa dioperasikan di server, bukan hanya lulus di repo.

### Implementasi nyata

1. deploy build terbaru,
2. jalankan app dengan env final,
3. cek:

   * health response,
   * livez response,
   * root endpoint,
   * port app,
   * port callback,
   * koneksi Telegram,
   * file state/journal/health terbentuk,
4. restart service,
5. cek state setelah restart,
6. cek log startup phase.

### Done jika

* bot bisa start, stop, restart, dan tetap konsisten tanpa intervensi manual aneh.

### Blocker umum

* env salah,
* domain/proxy salah route,
* callback host mismatch,
* Telegram token/user whitelist salah,
* permission file/dir salah,
* worker dist path tidak ketemu di production.

Status saat ini:

* **belum boleh dianggap selesai hanya dari repo**.

\---

## Fase 3 — Validasi observasi market dan state internal

### Tujuan

Membuktikan jalur scanner → signal → opportunity → hotlist → report benar-benar terisi di runtime nyata.

### Fokus

* market watcher jalan berkala,
* state hotlist dan opportunities terisi,
* reports Telegram konsisten,
* mark-to-market posisi aktif update.

### Fungsi bisnis

* operator harus bisa melihat nilai bot sebelum percaya pada bot.

### Implementasi nyata

1. hidupkan runtime dalam mode aman (`ALERT\_ONLY` atau simulated),
2. biarkan scanner berjalan beberapa siklus,
3. cek:

   * hotlist muncul,
   * intelligence report muncul,
   * spoof/pattern tidak kosong terus,
   * journal mencatat loop penting,
   * snapshot opportunity tersimpan,
4. bandingkan output Telegram dengan file snapshot lokal.

### Done jika

* bot benar-benar menghasilkan observasi market yang konsisten dan dapat dijelaskan.

### Blocker umum

* API public lambat,
* pair universe terlalu sempit/terlalu lebar,
* worker timeout,
* hotlist kosong terus karena threshold terlalu keras.

Status saat ini:

* **fiturnya sudah ada, tapi validasi lapangan masih dibutuhkan**.

\---

## Fase 4 — Validasi akun dan exchange non-destruktif (shadow-run)

### Tujuan

Membuktikan akun real, auth real, dan jalur read-model exchange bekerja tanpa menempatkan order nyata.

### Fokus

* public market,
* private auth (`getInfo`),
* `openOrders`,
* `orderHistory` / `orderHistoriesV2`,
* penyimpanan evidence shadow-run,
* Telegram summary shadow-run.

### Fungsi bisnis

* ini gerbang utama sebelum live trading.

### Implementasi nyata

1. stop runtime utama,
2. jalankan shadow-run dari Telegram,
3. cek evidence archive,
4. cek hasil per-account,
5. pastikan verdict minimal: **SIAP SHADOW-RUN AMAN**,
6. bila gagal, perbaiki tepat di penyebabnya.

### Done jika

* public market lulus,
* private auth lulus,
* reconciliation read model lulus,
* evidence tersimpan,
* tidak ada tindakan destruktif ke exchange.

### Blocker umum

* API key salah,
* izin API tidak cukup,
* pair uji tidak cocok,
* clock skew/signature issue,
* data/history path tidak writable.

Status saat ini:

* **jalur sudah ada, tapi pembuktian real exchange masih harus dilakukan**.

\---

## Fase 5 — Guarded live-readiness sebelum order nyata

### Tujuan

Memastikan semua guard keselamatan aktif sebelum live mode dibuka.

### Fokus

* trading mode,
* execution mode,
* risk settings,
* cooldown,
* max positions,
* buy slippage,
* timeout buy,
* callback auth required,
* emergency controls,
* operator SOP.

### Fungsi bisnis

* mengurangi peluang kerusakan akibat salah konfigurasi lebih daripada salah strategi.

### Implementasi nyata

1. pastikan default awal tetap aman (`OFF` / `ALERT\_ONLY` / simulated sesuai SOP),
2. review setiap parameter risk,
3. pastikan callback security required di production,
4. simulasi emergency flows:

   * pause auto,
   * pause all,
   * cancel all,
   * sell all,
5. cek bahwa order ambiguous tidak dibatalkan serampangan,
6. pastikan operator tahu arti setiap mode.

### Done jika

* operator bisa menjelaskan dan menjalankan seluruh kontrol darurat tanpa bingung.

### Blocker umum

* settings bagus di source tapi salah di runtime,
* operator tidak paham mode,
* emergency flow belum pernah dicoba di environment nyata.

Status saat ini:

* **sebagian source sudah siap, tapi SOP lapangan belum terbukti**.

\---

## Fase 6 — Limited live launch

### Tujuan

Masuk ke live trading dengan radius risiko kecil.

### Prinsip

* jangan langsung FULL\_AUTO besar,
* jangan langsung multi-account banyak,
* jangan langsung banyak pair,
* jangan langsung ukuran posisi besar.

### Implementasi nyata

Urutan yang paling waras:

1. mulai dari 1 account default,
2. pair terbatas,
3. ukuran posisi sangat kecil,
4. trading mode konservatif dulu,
5. pantau setiap summary dan journal,
6. validasi callback dan recovery setelah order nyata pertama,
7. cek bahwa posisi/order lokal cocok dengan exchange.

### Tujuan bisnis

* membuktikan sistem bisa survive trade nyata pertama dengan aman.

### Done jika

* setidaknya ada operasi live terbatas yang:

  * order submit benar,
  * status sinkron,
  * posisi tercatat benar,
  * close/cancel benar,
  * log dan summary masuk akal,
  * tidak perlu recovery manual aneh.

### Blocker umum

* exchange response ambigu,
* callback tidak masuk,
* posisi lokal berbeda dari exchange,
* operator salah menafsirkan summary.

Status saat ini:

* **belum tercapai**.

\---

## Fase 7 — Production stabilization

### Tujuan

Membuat live operation tahan terhadap waktu, restart, noise, dan error nyata.

### Fokus

* restart/redeploy safety,
* recovery saat startup,
* stale buy cancel,
* submission uncertain workflow,
* disk usage/log rotation,
* observability jangka panjang,
* incident playbook.

### Implementasi nyata

1. lakukan restart saat ada order/position aktif di skenario aman,
2. cek recovery startup,
3. cek health pasca restart,
4. cek callback pasca restart,
5. cek file state/history tidak korup,
6. buat SOP insiden:

   * callback gagal,
   * order uncertain,
   * Telegram putus,
   * exchange read-model timeout,
   * server restart.

### Fungsi bisnis

* sistem tidak rapuh saat dunia nyata tidak rapi.

### Done jika

* operator punya prosedur jelas untuk error-error utama.

Status saat ini:

* **belum terbukti penuh**.

\---

## Fase 8 — Strategi dan outcome bisnis

### Tujuan

Naik dari “sistem hidup” menjadi “sistem bernilai”.

### Fokus

* evaluasi kualitas signal,
* evaluasi false positive,
* evaluasi exit quality,
* evaluasi trap/spoof detection,
* evaluasi parameter risk,
* evaluasi pair universe,
* evaluasi hasil backtest vs live reality.

### Fungsi bisnis

* memastikan bot tidak hanya aman, tetapi juga berguna.

### Implementasi nyata

1. kumpulkan outcome trade nyata,
2. bandingkan dengan backtest dan hotlist/opportunity sebelum trade,
3. cari pola pair yang sering false breakout,
4. tuning threshold,
5. dokumentasikan konfigurasi yang dipakai.

### Done jika

* ada loop perbaikan strategi berbasis data, bukan feeling.

Status saat ini:

* **baru bisa dimulai setelah limited live berjalan**.

\---

## 8\. Urutan prioritas paling realistis dari sekarang

### Paling dekat dan wajib dulu

1. rapikan artefak final repo,
2. validasi runtime nyata di VPS,
3. validasi observasi market berjalan,
4. jalankan shadow-run real exchange,
5. validasi emergency + callback + recovery di runtime nyata.

### Setelah itu baru layak bicara live

6. limited live launch kecil,
7. review outcome trade nyata pertama,
8. stabilisasi operasi,
9. tuning strategi berbasis data.

\---

## 9\. Checklist jujur: kapan boleh bilang “SESUAI”, “BELUM SESUAI”, “SIAP LIVE”

### Boleh bilang “SESUAI” bila

* source dan verify repo sinkron,
* fitur inti terhubung nyata,
* proof verify resmi ada.

### Harus bilang “BELUM SESUAI” bila

* ada klaim besar di docs yang belum ada di source,
* jalur verify tidak menutup fitur yang diklaim,
* Telegram/menu hanyalah placeholder,
* callback/recovery hanya tampak ada tetapi tidak terhubung.

### Boleh bilang “SIAP LIVE” bila

* verify repo lulus,
* runtime VPS lulus,
* shadow-run real exchange lulus,
* callback real domain lulus,
* health/livez valid,
* operator emergency flow paham,
* limited live berhasil tanpa mismatch besar.

\---

## 10\. Verdict roadmap saat ini

### Yang sudah selesai secara substansi

* arsitektur bot inti,
* verify source/probe,
* Telegram control plane,
* execution/recovery model,
* callback security model,
* shadow-run path,
* backtest path.

### Yang berada di titik inti sekarang

* project ini sudah berada di **ujung tahap repo/source verification**.
* point inti berikutnya bukan refactor besar lagi, tetapi **validasi runtime nyata dan exchange-safe validation**.

### Yang masih memisahkan project ini dari “SIAP LIVE”

* validasi VPS nyata,
* validasi callback/domain nyata,
* shadow-run real exchange,
* limited live operation kecil yang sukses,
* SOP operator dan incident handling.

## Kesimpulan akhir

Roadmap paling jujur adalah:

* **bukan** lanjut refactor besar-besaran,
* **melainkan** lanjut ke pembuktian operasional bertahap.

Dengan kata lain:

* **inti source bot ini sudah terbentuk dan cukup matang**,
* tetapi **SIAP LIVE** baru sah setelah melewati pembuktian runtime nyata + shadow-run + limited live guarded launch.

