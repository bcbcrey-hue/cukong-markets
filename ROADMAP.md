## Roadmap implementasi matang dan eksplisit

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

