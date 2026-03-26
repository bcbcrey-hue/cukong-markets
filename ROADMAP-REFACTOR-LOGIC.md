# Roadmap Refactor Logika Cukong-Markets — Mode Agresif Thin-Book / Pre-Pump / Scalping

## Tujuan Utama
Mengubah karakter bot dari mode selektif-konservatif menjadi mode agresif yang fokus pada token micro/mid dengan orderbook tipis namun masih hidup, untuk mencoba masuk sebelum pump benar-benar matang.

Target akhirnya:
- fokus ke token “aneh” / micro / thin-book yang berpotensi digerakkan bandar
- tidak mengutamakan major pair
- bisa scout entry lebih awal sebelum pump besar terlihat jelas
- setelah buy, posisi tetap dipantau otomatis
- jika momentum pump masih valid, jangan auto sell hanya karena take profit statis tercapai
- jika ada indikasi dump / distribusi / rusak struktur, baru jalankan TP/Sell sesuai setting Telegram
- jika kondisi darurat dan tidak aman di-hold, bot boleh keluar lebih cepat tanpa menunggu target normal
- perilaku exit harus condong ke scalping aktif, bukan TP statis kaku

---

## Audit Jujur Keadaan Logika Saat Ini

### 1. Discovery masih terlalu konservatif untuk target thin-book micro
Logika sekarang masih menuntut:
- volume IDR minimum tinggi
- spread maksimum sempit
- depth minimum cukup tinggi
- major pair masih diberi porsi besar dalam shortlist

Dampak:
- banyak token micro/thin-book yang justru dicari user bisa gugur sebelum masuk radar serius
- shortlist discovery masih terlalu “rapi” untuk strategi bandar/micro-pump hunting

### 2. Major pair masih terlalu diistimewakan
Klasifikasi pair masih membagi:
- MAJOR
- MID
- MICRO

Lalu major pair masih memiliki bias positif di beberapa titik pipeline.

Dampak:
- karakter sistem masih belum sepenuhnya beralih ke hunting token kecil
- major pair masih berpeluang mengambil slot atau score yang seharusnya dialihkan ke micro anomaly

### 3. Thin orderbook masih dibaca dominan sebagai risiko, bukan peluang
Saat ini thin book masih banyak diperlakukan sebagai penalti/warning.

Dampak:
- bot belum membedakan antara:
  - thin book yang “mati / jebakan / tidak layak”
  - thin book yang “hidup / gampang disapu / potensi pre-pump”

Padahal target user justru mencari thin-book yang hidup.

### 4. Opportunity layer masih terlalu menunggu konfirmasi matang
Aksi auto entry sekarang pada praktiknya baru nyaman terjadi saat:
- edge valid
- pump probability lolos threshold
- confidence lolos threshold
- timing masih EARLY/READY
- recommendedAction = ENTER

Dampak:
- bot cenderung masuk setelah setup relatif lebih matang
- peluang scout entry awal bisa terlewat

### 5. Risk engine masih memveto terlalu banyak setup agresif
Risk layer sekarang tetap menolak ketika:
- spread terlalu lebar
- score/confidence kurang
- pump probability di bawah batas
- timing LATE/AVOID
- spoof risk di atas block threshold
- pair masih cooldown
- sudah ada posisi di pair sama

Dampak:
- walaupun discovery/opportunity dilonggarkan, bot tetap bisa gagal entry karena veto terakhir masih konservatif

### 6. Auto-buy runtime masih hanya menembak kandidat teratas umum
Loop runtime sekarang mengambil top opportunity umum, lalu hanya jika kandidat itu lolos syarat tertentu bot akan auto-buy.

Dampak:
- sistem belum punya lane khusus untuk “best micro-thin-book scout candidate”
- masih cenderung memilih kandidat terbaik versi umum, bukan target strategi baru

### 7. Exit logic masih statis: TP / SL / trailing biasa
Exit sekarang secara prinsip masih mengandalkan:
- take profit price / take profit percent
- stop loss price / stop loss percent
- trailing stop

Dampak:
- bila token sudah profit dan masih sangat kuat untuk lanjut pump, posisi tetap berisiko dijual terlalu cepat
- belum ada logika “hold the winner while pump remains healthy”
- belum ada logika darurat yang membedakan antara dump biasa dan keadaan tidak aman ekstrem

Kesimpulan audit jujur:
**source code saat ini belum selaras dengan target strategi thin-book bandar / pre-pump scalping yang user inginkan.**
Logika sekarang masih lebih dekat ke sistem selektif-konservatif daripada sistem pemburu micro anomaly agresif.

---

## Sasaran Desain Baru

Bot harus punya dua kepribadian logika:

### A. Lane Scout Entry
Masuk lebih awal, kecil, agresif, untuk token micro/thin-book yang mulai menunjukkan gejala akan digerakkan.

### B. Lane Active Scalping Exit
Setelah masuk:
- jangan buru-buru ambil TP kalau pump masih sehat
- tahan selama struktur pump masih valid
- ambil profit / sell saat ada tanda distribusi / dump / failure
- keluar paksa jika kondisi darurat benar-benar tidak aman

---

## Definisi Strategi Baru

Nama mode internal yang disarankan:
- `PUMP_SCOUT`

Aksi baru yang disarankan:
- `SCOUT_ENTER`
- `ADD_ON_CONFIRM`
- `WATCH`
- `AVOID`
- `EMERGENCY_EXIT`
- `TAKE_PROFIT_EXIT`
- `DUMP_EXIT`

Tujuan:
- `SCOUT_ENTER`: entry awal ukuran kecil saat setup micro-thin-book mulai terbentuk
- `ADD_ON_CONFIRM`: tambah ukuran ketika pump benar-benar lanjut dan struktur tetap sehat
- `DUMP_EXIT`: keluar saat distribusi / dump indication muncul
- `EMERGENCY_EXIT`: keluar tanpa tunggu TP normal bila kondisi tidak aman

---

## Roadmap Per Modul

## P0 — Balik Karakter Discovery

### File target
- `src/domain/market/pairClassifier.ts`
- `src/domain/market/discoveryScorer.ts`
- `src/domain/market/discoveryAllocator.ts`
- `src/domain/market/discoveryEngine.ts`
- `.env.example`

### Tujuan
Membuat shortlist discovery benar-benar berpihak ke micro/thin-book anomaly.

### Perubahan eksplisit

#### 1. Pair classification bias dibalik
Saat ini major masih lebih “disukai”.

Ubah menjadi:
- MICRO = prioritas utama
- MID = prioritas kedua
- MAJOR = prioritas rendah / fallback

Implementasi:
- hapus bonus strategis default untuk tier A
- tambahkan `microBias` pada pipeline discovery dan score
- major pair tetap dipantau, tapi dibatasi keras

#### 2. Ubah slot shortlist
Rekomendasi slot baru:
- `ANOMALY = 8`
- `STEALTH = 6`
- `ROTATION = 2`
- `LIQUID_LEADER = 1`

Tujuan:
- shortlist discovery didominasi anomali micro
- liquid leader hanya fallback, bukan inti

#### 3. Ubah cap major pair
Saat ini major share terlalu besar.

Rekomendasi baru:
- `DISCOVERY_MAJOR_PAIR_MAX_SHARE = 0.10 – 0.15`

Tujuan:
- major pair tidak lagi mengambil panggung utama

#### 4. Longgarkan filter discovery awal
Rekomendasi baru:
- `DISCOVERY_MIN_VOLUME_IDR = 10000000 – 25000000`
- `DISCOVERY_MAX_SPREAD_PCT = 2.5 – 3.5`
- `DISCOVERY_MIN_DEPTH_SCORE = 4 – 6`
- `MARKET_WATCH_INTERVAL_MS = 3000 – 5000`

Tujuan:
- micro pair yang sedang hidup tidak gugur terlalu cepat
- bot lebih cepat menangkap perubahan awal

#### 5. Ubah makna thin book
Saat ini thin = warning/penalty.

Strategi baru:
- `dead thin` = buang
- `live thin` = target
- `too thick/liquid` = kurang prioritas

Buat sweet spot baru untuk `depthScore`:
- `< 3` = dead
- `4–18` = target zone
- `19–30` = netral
- `> 30` = kurang menarik untuk mode scout

#### 6. Bucket classification baru
Di `discoveryScorer.ts`, bucket jangan otomatis membuat major = liquid leader yang dominan.

Bucket baru harus lebih banyak menilai:
- quote-flow jerk
- ask vacuum
- bid persistence
- early price lift
- breakout compression

---

## P1 — Refactor Score untuk Thin-Book Opportunity

### File target
- `src/domain/signals/scoreCalculator.ts`

### Tujuan
Mengubah score dari “thin-book risk-centric” menjadi “thin-book opportunity-aware”.

### Perubahan eksplisit

#### 1. Hapus bias lama
Kurangi/hapus dominasi komponen berikut:
- tier bonus major
- thin-book penalty linear
- late-move penalty yang terlalu cepat menghukum

#### 2. Tambah komponen baru
Tambahkan feature baru:
- `thinBookOpportunityScore`
- `askVacuumScore`
- `bidPersistenceScore`
- `microPairBias`
- `earlyMoveScore`
- `quoteJerkScore`
- `deadBookPenalty`

#### 3. Formula baru yang disarankan
Score total baru lebih berat ke:
- quote-flow acceleration
n- ask vacuum
- orderbook imbalance yang sehat
- early move yang belum terlalu jauh
- micro bias
- thin-book sweet spot

Contoh arah formula:
- thin tetapi masih hidup = bonus
- terlalu mati = penalti keras
- terlalu overextended = penalti
- spread masih boleh lebih longgar daripada mode lama

#### 4. Warning/reason baru
Reasons baru yang perlu muncul:
- `ask_vacuum_detected`
- `bid_persistence_detected`
- `micro_pair_bias`
- `thin_book_opportunity`
- `early_pump_formation`

Warnings baru:
- `dead_book`
- `spread_too_wild_even_for_scout`
- `move_already_blown_out`
- `suspected_spoof_flip`

---

## P2 — Opportunity Engine: dari Enter Biasa jadi Scout Mode

### File target
- `src/domain/intelligence/opportunityEngine.ts`
- `src/domain/intelligence/entryTimingEngine.ts`
- `src/core/types.ts`

### Tujuan
Mengubah layer opportunity agar bisa menghasilkan keputusan agresif bertahap, bukan cuma ENTER konservatif.

### Perubahan eksplisit

#### 1. Tambah action baru di types
Ubah union `recommendedAction` agar mendukung:
- `SCOUT_ENTER`
- `ADD_ON_CONFIRM`
- `WATCH`
- `AVOID`
- `EMERGENCY_EXIT`

#### 2. Entry timing baru
Entry timing tidak cukup hanya EARLY/READY/LATE/AVOID.

Tambahkan penilaian yang lebih cocok untuk thin-book scout:
- `SCOUT_WINDOW`
- `CONFIRM_WINDOW`
- `CHASING`
- `DEAD`

Boleh tetap dipetakan ke enum lama di tahap transisi, tapi internal scoring harus lebih spesifik.

#### 3. Rule opportunity baru
Contoh perilaku:
- jika setup thin-book sehat + quote flow naik + ask vacuum ada + pump probability cukup + belum overextended → `SCOUT_ENTER`
- jika momentum lanjut dan validasi makin kuat → `ADD_ON_CONFIRM`
- jika move sudah telat → `WATCH` atau `AVOID`
- jika trap/dump indication tinggi → `AVOID`

#### 4. Final score opportunity baru
Bobot final score perlu lebih mendukung:
- pre-pump pressure
- continuation potential
- low time-to-trigger
- microstructure asymmetry

Dan mengurangi dominasi:
- hanya pair besar yang “rapi”
- hanya setup yang sudah terlalu matang

---

## P3 — Risk Engine Dibuat 2 Lane

### File target
- `src/domain/trading/riskEngine.ts`
- `src/core/types.ts`

### Tujuan
Agar agresif di seleksi, tetapi tetap disiplin di ukuran dan survival.

### Arsitektur baru

#### 1. Lane A: Scout Entry Risk
Untuk `SCOUT_ENTER`:
- ukuran posisi awal lebih kecil: 20%–35% dari position size normal
- spread tolerance lebih longgar
- cooldown lebih pendek
- spoof threshold sedikit lebih longgar, tapi tetap aktif
- trap probability tidak langsung blok total kecuali ekstrem

#### 2. Lane B: Confirmation Add-On Risk
Untuk `ADD_ON_CONFIRM`:
- hanya tambah posisi jika continuation masih valid
- tidak tambah kalau harga sudah terlalu extended
- tidak tambah kalau ask vacuum hilang / bid persistence melemah

#### 3. Lane C: Emergency Exit Risk
Jika muncul kondisi darurat seperti:
- spread meledak terlalu besar
- imbalance berbalik tajam ke dump side
- quote flow runtuh mendadak
- peak retrace terlalu dalam untuk micro pump
- spoof flip / liquidity vanish

Maka bot harus bisa keluar tanpa menunggu TP/SL biasa.

### ExitDecision perlu diperluas
Tambahkan reason baru:
- `DUMP_EXIT`
- `EMERGENCY_EXIT`
- `SCALP_PROTECT`

---

## P4 — Runtime Auto-Buy Harus Memilih Scout Candidate, Bukan Top Umum

### File target
- `src/app.ts`

### Tujuan
Mengubah pemilihan kandidat entry dari “top overall opportunity” menjadi “best micro scout candidate”.

### Perubahan eksplisit

#### 1. Selector baru
Urutan prioritas:
1. `SCOUT_ENTER` pada bucket `ANOMALY`
2. `SCOUT_ENTER` pada bucket `STEALTH`
3. `ADD_ON_CONFIRM` yang valid
4. fallback ke kandidat umum jika tidak ada scout setup

#### 2. Prioritas pair
Urutan prioritas pair:
- MICRO
- MID
- MAJOR

#### 3. Size logic
Jika action = `SCOUT_ENTER`:
- gunakan size kecil

Jika action = `ADD_ON_CONFIRM`:
- boleh tambah sebagian, bukan full normal secara langsung

#### 4. Monitoring tetap otomatis
Setelah buy, posisi harus tetap dipantau oleh loop monitor seperti sekarang, tetapi dengan exit intelligence yang baru.

---

## P5 — Refactor Exit Menjadi Active Scalping Logic

### File target
- `src/domain/trading/riskEngine.ts`
- `src/domain/trading/executionEngine.ts`
- `src/domain/trading/positionManager.ts`
- `src/core/types.ts`

### Tujuan
Mengubah exit dari TP statis menjadi exit berbasis kondisi pump/dump.

### Prinsip baru

#### 1. Jangan auto sell hanya karena TP tercapai
Jika posisi sudah profit dan level TP tercapai tetapi:
- quote flow masih naik
- continuation probability masih tinggi
- ask masih tipis untuk disapu
- bid persistence masih kuat
- dump indication belum muncul

maka **jangan sell dulu**.

Artinya:
- TP statis menjadi `soft target`, bukan trigger mutlak
- bot boleh menahan posisi menang selama pump masih sehat

#### 2. Sell sesuai setting Telegram jika pump mulai rusak
Jika pump melemah atau muncul indikasi distribusi/dump, barulah:
- TP/SL/trailing dari Telegram dipakai sebagai guard rail
- posisi boleh dijual bertahap atau penuh sesuai desain yang dipilih

#### 3. Emergency exit override
Jika kondisi sangat tidak aman dan target lama tidak realistis tercapai:
- keluar langsung walaupun target TP/SL yang diset user belum terpenuhi

Contoh kondisi emergency:
- spread tiba-tiba memburuk ekstrem
- quote flow buy runtuh tajam
- retrace dari peak terlalu dalam untuk micro pump
- orderbook bid support hilang total
- trap probability melonjak
- market jadi tidak aman untuk di-hold lebih lama

#### 4. Tambah Exit Intelligence Layer
Sebaiknya dibuat helper/engine baru, misalnya:
- `src/domain/intelligence/exitDecisionEngine.ts`

Tugasnya:
- menilai `hold`, `scale_out`, `take_profit_exit`, `dump_exit`, `emergency_exit`

Input yang dipakai:
- current pnl
- peak pnl
- quote flow terbaru
- imbalance terbaru
- continuation probability terbaru
- trap/dump signal terbaru
- regime terbaru

#### 5. State tambahan pada position
Posisi perlu menyimpan metadata tambahan seperti:
- `entryStyle: SCOUT | CONFIRM`
- `pumpState: ACTIVE | WEAKENING | DISTRIBUTING | COLLAPSING`
- `lastContinuationScore`
- `lastDumpRisk`
- `lastScaleOutAt`
- `emergencyExitArmed`

---

## P6 — Telegram Settings Harus Mendukung Mode Baru

### File target
- `src/integrations/telegram/handlers.ts`
- keyboard/menu terkait
- state/settings service

### Tujuan
Agar user bisa mengatur perilaku scout/scalping dari Telegram.

### Setting baru yang perlu ditambah

#### Strategy Settings
- `strategyMode = NORMAL | PUMP_SCOUT`
- `scoutEntrySizePct`
- `scoutMinPumpProbability`
- `scoutMinConfidence`
- `scoutMaxSpreadPct`
- `allowMajorFallback`
- `microBiasStrength`

#### Risk / Exit Settings
- `tpMode = HARD | SOFT_TRAIL`
- `holdWinnerWhilePumpHealthy = true/false`
- `dumpExitSensitivity`
- `emergencyExitSensitivity`
- `scaleOutOnWeakness = true/false`
- `maxPeakRetracePct`
- `minimumHoldSecondsAfterScout`

### UX yang diinginkan
Telegram harus menampilkan dengan jelas:
- mode strategi aktif
- apakah TP bersifat hard atau soft
- apakah hold-winner mode aktif
- apakah emergency exit aktif
- threshold scout dan dump sensitivity

---

## P7 — Probe / Test Wajib untuk Logika Baru

### File target baru yang disarankan
- `tests/aggressive_discovery_prefers_micro_probe.ts`
- `tests/thin_book_sweet_spot_probe.ts`
- `tests/scout_enter_route_probe.ts`
- `tests/add_on_confirm_probe.ts`
- `tests/hold_winner_while_pump_healthy_probe.ts`
- `tests/dump_exit_trigger_probe.ts`
- `tests/emergency_exit_override_probe.ts`
- `tests/telegram_strategy_mode_probe.ts`

### Acceptance criteria

#### Discovery
- micro/thin-book anomaly lebih sering lolos shortlist daripada major pair biasa
- dead thin book tetap ditolak
- shortlist tidak didominasi liquid leader

#### Opportunity
- setup scout valid menghasilkan `SCOUT_ENTER`
- setup lanjutan valid menghasilkan `ADD_ON_CONFIRM`
- setup telat tidak dikejar

#### Risk
- scout entry memakai ukuran lebih kecil
- confirmation add-on tidak terjadi bila continuation rusak
- emergency exit bekerja walau TP normal belum tercapai

#### Exit
- posisi profit tidak langsung dijual bila pump masih sehat
- posisi keluar bila dump indication muncul
- posisi keluar cepat bila kondisi darurat terdeteksi

#### Telegram
- semua setting baru bisa dibaca/diubah dari UI
- status mode terlihat jelas

---

## Prioritas Eksekusi Nyata

## Batch 1 — Discovery & Score Pivot
Ubah dulu:
- pairClassifier
- discoveryScorer
- discoveryAllocator
- discoveryEngine
- scoreCalculator
- .env.example

**Tujuan batch 1:** shortlist dan score sudah benar-benar berpihak ke micro thin-book.

## Batch 2 — Opportunity & Risk Scout Lane
Ubah:
- core/types
- entryTimingEngine
- opportunityEngine
- riskEngine

**Tujuan batch 2:** bot bisa menghasilkan `SCOUT_ENTER` dan `ADD_ON_CONFIRM` dengan jalur risk yang cocok.

## Batch 3 — Runtime Selection
Ubah:
- app.ts

**Tujuan batch 3:** runtime memilih scout candidate, bukan top general candidate.

## Batch 4 — Exit Scalping Intelligence
Ubah:
- riskEngine
- executionEngine
- positionManager
- tambah exitDecisionEngine baru bila perlu

**Tujuan batch 4:** winner dibiarkan lari saat sehat, dan exit dilakukan saat dump/emergency.

## Batch 5 — Telegram UX dan Settings
Ubah:
- telegram handlers / keyboards
- settings/state persistence

**Tujuan batch 5:** semua behavior baru bisa dioperasikan dari Telegram.

## Batch 6 — Probes dan Validasi
Tambah probe end-to-end untuk discovery, entry, hold winner, dump exit, emergency exit.

---

## Verdict Audit Akhir

### Status saat ini
**BELUM SELARAS dengan strategi target user.**

### Kenapa
Karena source code saat ini masih:
- terlalu memihak pair yang lebih rapi/likuid
- masih menghukum thin-book di banyak titik
- masih auto-entry hanya setelah beberapa konfirmasi konservatif
- masih auto-exit dengan logika TP/SL/trailing statis

### Setelah roadmap ini diterapkan
Barulah bot akan lebih sesuai dengan tujuan:
- hunting micro thin-book pre-pump
- entry agresif bertahap
- monitoring otomatis setelah buy
- hold winner selama pump sehat
- exit saat dump/emergency
- perilaku scalping aktif, bukan TP statis pasif

---

## Catatan Risiko Jujur
Strategi ini memang lebih agresif dan lebih dekat ke karakter market micro pump, tetapi konsekuensinya juga lebih berbahaya:
- false breakout lebih sering
- spoof/trap lebih sering
- spread bisa memburuk cepat
- exit bisa sulit jika likuiditas hilang

Karena itu refactor harus dilakukan bersama:
- scout size kecil
- emergency exit nyata
- monitoring lebih cepat
- probe ketat
- journaling yang jujur

Tanpa itu, mode agresif bisa cepat berubah jadi mode bunuh diri.

