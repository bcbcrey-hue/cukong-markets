# Roadmap Final — Penutupan Roadmap Lama + Pembuka Upgrade Otak Bot Baru

## Status dasar yang dikunci untuk dokumen ini
- Sumber kebenaran utama tetap **source code repo aktual**.
- Dokumen roadmap repo dipakai sebagai acuan urutan batch, tetapi jika nanti source code berbeda, maka **source code menang**.
- Batch 1 sampai Batch 4 dianggap sudah berada di status selesai sesuai working context sesi ini.
- Dokumen ini bertujuan untuk:
  1. menutup roadmap lama secara rapi di **Batch 5** dan **Batch 6**,
  2. mencegah scope bocor,
  3. menyiapkan fase baru sesudah Batch 5 dan 6 merge.

---

# BAGIAN A — FINALISASI ROADMAP SAAT INI

## Ringkasan keputusan final
Roadmap lama **tidak diubah urutannya**.

Urutan final:
1. Batch 1 — Discovery & Score Pivot ✅
2. Batch 2 — Opportunity & Risk Scout Lane ✅
3. Batch 3 — Runtime Selection ✅
4. Batch 4 — Exit Scalping Intelligence ✅
5. Batch 5 — Telegram Settings + UX ⏳ finalisasi terakhir
6. Batch 6 — Probes dan Validasi ⏳ finalisasi terakhir

Setelah **Batch 5** dan **Batch 6** selesai lalu merge, roadmap lama dianggap **selesai**.

Sesudah itu baru mulai roadmap baru untuk upgrade otak bot.

---

## Kenapa Batch 5 dan 6 harus ditutup dulu
Karena yang sudah dibangun di Batch 1–4 baru benar-benar berguna bila:
- semua behavior baru bisa dioperasikan dari Telegram,
- setting baru bisa diubah dengan aman dan persist,
- ada probe yang membuktikan discovery, scout entry, hold winner, dump exit, emergency exit, dan wiring setting benar-benar jalan.

Tanpa Batch 5 dan 6, roadmap lama masih belum rapi secara operasional walaupun logika inti sudah maju.

---

# BAGIAN B — BATCH FINAL 5

## Nama batch
**Batch 5 — Telegram Settings + UX**

## Tujuan inti
Semua behavior baru hasil Batch 1–4 harus bisa:
- dilihat statusnya dari Telegram,
- dioperasikan dari Telegram,
- diubah setting pentingnya dari Telegram,
- dipersist tanpa merusak kontrak runtime,
- tetap jelas, tidak membingungkan, dan tidak menyalahi pola menu utama.

## Scope final yang DIIZINKAN
Fokus hanya pada:
- telegram handlers,
- telegram keyboards,
- callback/menu wiring,
- settings/state persistence yang memang dibutuhkan untuk mengoperasikan logika baru,
- tampilan status/ringkasan agar perilaku discovery/scout/exit baru terlihat jelas.

## Scope yang DILARANG
Jangan masuk ke:
- redesign engine discovery lagi,
- redesign opportunity engine lagi,
- redesign exit intelligence lagi,
- real trade feed,
- learning engine,
- prediction engine baru,
- portfolio engine baru,
- perubahan besar di luar kebutuhan Telegram/settings.

## Target hasil final Batch 5
Batch 5 harus menghasilkan Telegram UX yang membuat logika baru benar-benar bisa dipakai, bukan hanya ada di code.

Minimal hasil yang harus ada:
1. **Menu / submenu rapi dan konsisten**
   - Main menu tetap jelas.
   - Tombol `Kembali` harus kembali ke parent yang benar.
   - Tidak boleh ada callback buntu / menu nyasar / tombol mati.

2. **Status runtime dan karakter bot terlihat jelas**
   - User bisa melihat mode runtime.
   - User bisa melihat karakter strategi aktif secara ringkas.
   - User bisa melihat apakah pair dipilih lewat lane scout / add-on / normal.
   - User bisa melihat ringkasan kenapa posisi ditahan / kenapa dijual bila informasinya memang tersedia.

3. **Setting baru yang relevan dengan Batch 1–4 harus bisa dioperasikan**
   Minimal yang harus dipertimbangkan untuk bisa ditampilkan/diubah dari Telegram bila memang sudah ada di runtime/settings:
   - threshold discovery/scout yang memang sudah hidup,
   - threshold probability/confidence yang memang dipakai runtime,
   - cooldown / batas entry yang memang dipakai risk layer,
   - buy slippage / max slippage,
   - exit behavior yang memang sudah hidup pada Batch 4,
   - mode auto/shadow bila memang sudah tersedia di app.

4. **Persistence aman**
   - Perubahan setting dari Telegram harus masuk ke persistence resmi.
   - Setting harus tetap ada setelah restart.
   - Tidak boleh ada mismatch antara tampilan Telegram vs nilai yang benar-benar dipakai runtime.

5. **Ringkasan untuk operator lebih jujur**
   - Jangan tampilkan klaim yang tidak benar-benar dihitung.
   - Bedakan yang berupa score setup saat ini vs sinyal yang benar-benar sudah hidup.
   - Jika suatu field masih proxy/heuristik, jangan disajikan seolah data truth baru.

## File target minimal Batch 5
Target file minimal yang boleh disentuh bila memang relevan:
- `src/integrations/telegram/handlers.ts`
- `src/integrations/telegram/keyboards.ts`
- `src/integrations/telegram/bot.ts`
- `src/integrations/telegram/uploadHandler.ts`
- `src/domain/settings/settingsService.ts`
- file persistence/state/settings lain yang memang TERPAKAI untuk menyimpan perubahan setting
- file report/status text bila memang dipakai untuk menampilkan ringkasan ke Telegram

## Acceptance criteria final Batch 5
Batch 5 baru dianggap selesai bila seluruh poin ini terpenuhi:
- semua menu dan callback yang disentuh benar-benar terhubung,
- setting yang diubah dari Telegram benar-benar mengubah runtime/persistence yang dipakai,
- nilai setting tidak hilang setelah restart,
- tidak ada tombol yang hanya kosmetik,
- tidak ada klaim palsu di status/report,
- build/lint/typecheck untuk bagian yang disentuh tetap sehat,
- perubahan tetap berada di jalur UX/settings, bukan menyelundupkan batch baru.

## Residual risk yang masih boleh tersisa setelah Batch 5
Yang boleh belum selesai sesudah Batch 5:
- real exchange trade feed,
- model prediksi masa depan yang benar-benar baru,
- portfolio sizing adaptif penuh,
- self-learning loop,
- capital allocator baru.

Itu semua sengaja dipindah ke roadmap baru.

---

# BAGIAN C — PROMPT FINAL BATCH 5

Gunakan repository source code aktual sebagai sumber kebenaran utama.

Repository project GitHub:
- https://github.com/masreykangtrade-oss/cukong-markets

Dokumen roadmap acuan urutan batch:
- ROADMAP-REFACTOR-LOGIC.md di repo yang sama

WORKING CONTEXT YANG WAJIB DIPEGANG:
- Batch 1 sampai Batch 4 dianggap sudah selesai.
- Fokus sekarang HANYA Batch 5.
- Batch 5 adalah penutupan operasional untuk behavior baru hasil Batch 1–4.
- Jangan pindah ke Batch 6, jangan pindah ke roadmap baru, jangan menyelundupkan redesign engine lain.

TUJUAN BATCH 5:
Membuat semua behavior baru hasil Batch 1–4 benar-benar bisa dioperasikan dari Telegram dan setting-nya benar-benar persist serta sinkron dengan runtime nyata.

ATURAN WAJIB:
1. Audit keras source code aktual dulu sebelum mengubah apa pun.
2. Jangan asumsi.
3. Jangan overclaim.
4. Jangan bilang sudah terhubung bila belum benar-benar terpakai di flow runtime nyata.
5. Jika dokumen bertentangan dengan source code, menangkan source code.
6. Fokus sempit hanya pada Telegram UX, settings, callback/menu wiring, dan persistence yang memang dibutuhkan.
7. Jangan refactor besar keluar jalur.
8. Jangan menambah fitur batch baru seperti real trade feed, learning engine, future prediction engine, atau portfolio engine.

TARGET IMPLEMENTASI EKSPLISIT:
- audit dan rapikan `src/integrations/telegram/handlers.ts`
- audit dan rapikan `src/integrations/telegram/keyboards.ts`
- audit `src/integrations/telegram/bot.ts` bila memang ada wiring yang perlu disesuaikan
- audit `src/integrations/telegram/uploadHandler.ts` bila beririsan dengan Accounts/settings flow
- audit `src/domain/settings/settingsService.ts`
- audit layer persistence/state/settings lain yang benar-benar dipakai untuk menyimpan perubahan setting
- pastikan semua behavior baru hasil Batch 1–4 yang memang relevan untuk operator bisa dilihat / dipicu / diatur dari Telegram
- pastikan perubahan setting dari Telegram benar-benar persist dan terbaca runtime
- pastikan tidak ada callback mati, tombol buntu, atau back navigation salah parent
- pastikan tampilan status/report tetap jujur dan tidak mengklaim hal yang belum benar-benar dihitung

HASIL YANG WAJIB ADA:
- menu dan submenu rapi
- callback/router valid
- state/settings persistence sinkron
- operator bisa mengakses kontrol yang memang relevan dengan Batch 1–4
- build/lint/typecheck tetap sehat

OUTPUT YANG WAJIB KAMU BERIKAN:
1. Audit ringkas
2. Temuan per file
3. Implementasi yang dilakukan
4. File yang diubah
5. Bukti validasi
6. Gap / residual risk
7. Verdict final

VERDICT WAJIB SALAH SATU:
- SIAP MERGE
- BELUM SIAP MERGE

ATURAN VERDICT:
- Jangan bilang SIAP MERGE hanya karena CI hijau kalau UX/settings yang ditargetkan belum benar-benar hidup.
- Jangan bilang BELUM SIAP MERGE karena hal di luar scope Batch 5.
- Jika belum siap merge, buatkan prompt lanjutan yang tetap sempit dan tetap di Batch 5.

---

# BAGIAN D — BATCH FINAL 6

## Nama batch
**Batch 6 — Probes dan Validasi**

## Tujuan inti
Membuktikan secara otomatis bahwa perubahan hasil Batch 1–5 benar-benar hidup dan tidak cuma terlihat bagus di source code.

## Scope final yang DIIZINKAN
Fokus hanya pada:
- penambahan atau penyempurnaan probes,
- wiring registry probe,
- validasi end-to-end,
- validasi runtime contract,
- validasi Telegram/settings flow bila memang bisa dibuktikan tanpa keluar jalur.

## Scope yang DILARANG
Jangan masuk ke:
- redesign trading engine,
- redesign Telegram UX lagi kecuali ada bug kecil agar probe bisa valid,
- batch baru real feed / learning / portfolio / prediction,
- refactor besar di luar kebutuhan validasi.

## Target hasil final Batch 6
Minimal harus ada pembuktian otomatis untuk jalur-jalur ini:
1. discovery baru menghasilkan kandidat yang sesuai lane target,
2. runtime selection benar-benar memilih scout candidate sesuai prioritas runtime,
3. entry logic tetap realistis sesuai guard aktif,
4. hold winner tidak menjual terlalu cepat saat kondisi sehat,
5. dump exit berjalan saat struktur rusak,
6. emergency exit berjalan saat kondisi darurat,
7. settings/operasi Telegram yang disentuh Batch 5 tidak putus kontraknya,
8. jalur validasi resmi repo tetap sehat.

## File target minimal Batch 6
Target file minimal yang boleh disentuh bila memang relevan:
- file probe di `tests/` yang benar-benar diperlukan
- registry probe / runner
- `scripts/run-probes.mjs`
- `package.json` hanya bila perlu untuk registry/script validasi
- penyesuaian kecil pada helper test/probe bila memang wajib

## Acceptance criteria final Batch 6
Batch 6 baru dianggap selesai bila:
- probe untuk jalur utama yang ditargetkan benar-benar ada dan relevan,
- registry probe rapi,
- jalur validasi resmi repo tetap masuk akal,
- proof yang dihasilkan cukup untuk menyatakan Batch 1–5 benar-benar terhubung,
- tidak ada probe kosmetik yang hanya memeriksa stub lemah,
- tidak ada refactor liar di luar scope validasi.

## Jalur validasi resmi yang harus tetap dihormati
- `npm ci`
- `npm run lint`
- `npm run typecheck:probes`
- `npm run build`
- `npm run probe:list`
- `npm run probe:audit`
- `npm run test:probes`
- `npm run verify`
- `npm run runtime:contract`

## Residual risk yang masih boleh tersisa setelah Batch 6
Sesudah Batch 6 selesai, yang masih boleh belum ada adalah hal-hal di roadmap baru:
- real feed trade aktual exchange,
- future gainer/trending prediction engine,
- portfolio/capital management adaptif penuh,
- self-evaluation loop yang mengubah policy,
- auto-learning nyata.

---

# BAGIAN E — PROMPT FINAL BATCH 6

Gunakan repository source code aktual sebagai sumber kebenaran utama.

Repository project GitHub:
- https://github.com/masreykangtrade-oss/cukong-markets

Dokumen roadmap acuan urutan batch:
- ROADMAP-REFACTOR-LOGIC.md di repo yang sama

WORKING CONTEXT YANG WAJIB DIPEGANG:
- Batch 1 sampai Batch 5 dianggap sudah selesai / atau minimal perubahan Batch 5 sudah berada di branch aktif yang sedang diaudit.
- Fokus sekarang HANYA Batch 6.
- Batch 6 adalah penutupan validasi untuk seluruh roadmap lama.
- Jangan menyelundupkan redesign engine baru.

TUJUAN BATCH 6:
Menambah dan merapikan probe/validasi agar discovery, runtime selection, entry realism dasar, hold winner, dump exit, emergency exit, dan wiring Telegram/settings yang relevan benar-benar terbukti hidup.

ATURAN WAJIB:
1. Audit keras source code aktual dulu sebelum mengubah apa pun.
2. Jangan asumsi.
3. Jangan overclaim.
4. Probe harus membuktikan flow nyata, bukan hanya stub dangkal.
5. Jika dokumen bertentangan dengan source code, menangkan source code.
6. Fokus sempit hanya pada probe, validasi, registry, dan penyesuaian kecil yang memang dibutuhkan agar pembuktian valid.
7. Jangan refactor logika trading besar di luar kebutuhan probe.
8. Jangan masuk ke roadmap baru.

TARGET IMPLEMENTASI EKSPLISIT:
- audit registry probe yang sudah ada
- audit jalur validasi resmi repo
- tambah/rapikan probe end-to-end untuk:
  - discovery lane yang relevan
  - runtime selection `SCOUT_ENTER` / `ADD_ON_CONFIRM` bila memang itu yang hidup
  - hold winner tidak auto-exit saat kondisi sehat
  - dump exit saat struktur rusak
  - emergency exit saat kondisi darurat
  - wiring settings/Telegram penting dari Batch 5 bila memang bisa divalidasi secara masuk akal
- rapikan `scripts/run-probes.mjs` bila registry atau klasifikasi official/manual perlu dibenahi
- sentuh `package.json` hanya bila memang perlu untuk script validasi
- pastikan jalur validasi resmi repo tetap sehat

HASIL YANG WAJIB ADA:
- probe relevan bertambah / membaik
- registry probe rapi
- validasi resmi tidak rusak
- pembuktian cukup untuk menutup roadmap lama

OUTPUT YANG WAJIB KAMU BERIKAN:
1. Audit ringkas
2. Temuan per file
3. Implementasi yang dilakukan
4. File yang diubah
5. Bukti validasi
6. Gap / residual risk
7. Verdict final

VERDICT WAJIB SALAH SATU:
- SIAP MERGE
- BELUM SIAP MERGE

ATURAN VERDICT:
- Jangan bilang SIAP MERGE hanya karena script jalan, kalau probe yang penting masih belum benar-benar membuktikan perilaku target.
- Jangan bilang BELUM SIAP MERGE hanya karena roadmap baru belum dikerjakan.
- Jika belum siap merge, buatkan prompt lanjutan yang tetap sempit dan tetap di Batch 6.

---

# BAGIAN F — SESUDAH BATCH 5 DAN 6 MERGE

## Status roadmap lama
Setelah Batch 5 dan Batch 6 merge, maka:
- roadmap lama dianggap **SELESAI**,
- diskusi lama tentang Discovery/Scout/Runtime/Exit tidak lagi jadi batch aktif,
- peningkatan berikutnya masuk roadmap baru, bukan revisi liar ke roadmap lama.

---

# BAGIAN G — ROADMAP BARU: UPGRADE OTAK BOT

## Prinsip utama roadmap baru
Roadmap baru dibuat karena ada gap yang memang belum ditutup oleh roadmap lama:
- trade flow masih banyak berbasis proxy/estimasi,
- probability masih lebih dekat ke setup likelihood saat ini, belum benar-benar future prediction target,
- sizing belum sepenuhnya adaptif berdasarkan kekuatan sinyal,
- self-evaluation belum menjadi learning loop yang benar-benar mengubah policy,
- capital/portfolio orchestration belum menjadi layer mandiri.

## Urutan fase baru yang disarankan

### Batch Baru A — Real Trade Feed Truth Layer
Tujuan:
- masuk ke data trade feed aktual exchange,
- kurangi ketergantungan pada proxy/inferred trade flow,
- bedakan jelas mana data truth vs mana fallback proxy.

Hasil yang dicari:
- layer market data baru,
- adapter feed real-time,
- fallback policy bila feed putus,
- kontrak data trade truth yang jelas.

### Batch Baru B — Future Gainer / Trending Prediction Engine
Tujuan:
- mengubah probability dari sekadar setup likelihood menjadi prediksi horizon yang jelas.

Hasil yang dicari:
- definisi target prediksi yang eksplisit,
- labeling horizon yang jelas,
- feature set yang sesuai,
- score prediction yang jujur dan terkalibrasi.

### Batch Baru C — Portfolio & Capital Management
Tujuan:
- sinyal kuat ukuran lebih besar,
- sinyal lemah ukuran lebih kecil,
- kontrol eksposur antar posisi,
- alokasi modal tidak lagi semi-flat.

Hasil yang dicari:
- risk budget per posisi,
- max exposure per cluster/pair class,
- sizing adaptif berbasis kualitas setup,
- cap agar tidak liar di thin-book.

### Batch Baru D — Self-Evaluation / Learning Loop
Tujuan:
- sistem belajar dari hasil trade dan kualitas keputusan,
- tapi tetap dijaga agar tidak drift liar.

Hasil yang dicari:
- evaluation store yang rapi,
- feedback loop dari hasil nyata,
- adaptive threshold / ranking adjustment yang aman,
- guardrail agar learning tidak merusak kestabilan.

### Batch Baru E — Execution Realism Upgrade
Tujuan:
- naikkan realisme eksekusi di thin-book,
- masuk lebih realistis, keluar lebih realistis.

Hasil yang dicari:
- fill realism lebih baik,
- partial fill realism,
- queue/slippage behaviour lebih masuk akal,
- stress handling saat likuiditas drop.

### Batch Baru F — Validation & Shadow Live for New Brain
Tujuan:
- buktikan layer baru benar-benar valid sebelum dipercaya.

Hasil yang dicari:
- probe khusus trade feed truth,
- probe prediction calibration,
- probe portfolio sizing,
- probe learning guardrail,
- shadow-live validation baru.

---

# BAGIAN H — KEPUTUSAN FINAL YANG DIPEGANG

## Final keputusan roadmap
1. **Jangan campur roadmap baru ke Batch 5 atau 6.**
2. **Tutup roadmap lama dulu dengan Batch 5 dan 6.**
3. **Sesudah merge Batch 5 dan 6, baru mulai roadmap baru.**
4. **Roadmap baru dimulai dari Real Trade Feed Truth Layer, bukan dari auto-learning dulu.**
5. **Auto-learning tidak boleh jadi langkah pertama.**
6. **Capital management adaptif dan prediction engine baru dikerjakan sesudah fondasi data truth lebih kuat.**

---

# BAGIAN I — VERDICT STRATEGIS

## Verdict final dokumen ini
**FINAL DAN TEGAS:**
- Batch 5 dan 6 adalah penutupan roadmap saat ini.
- Upgrade otak bot baru harus dibuka sebagai roadmap lanjutan terpisah.
- Urutan yang benar: **selesaikan dan merge Batch 5 → selesaikan dan merge Batch 6 → baru mulai roadmap baru.**

