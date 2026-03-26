ROADMAP LOGIC UPGRADE FINAL — DENGAN DECISION POLICY LAYER
1) Status dokumen ini
Dokumen ini adalah versi final roadmap upgrade otak bot yang menambahkan Decision Policy Engine tanpa keluar dari jalur target roadmap baru yang sudah ada.
Prinsip yang dikunci:
source code repo aktual tetap sumber kebenaran utama
ROADMAP-REFACTOR-LOGIC.md dianggap sudah selesai sebagai roadmap lama
ROADMAP_LOGIC_UPGRADE.md adalah roadmap target upgrade saat ini
target A–F tetap dipertahankan
tidak ada ML baru yang disisipkan di layer policy ini
tidak ada redesign besar
perubahan harus bertahap, eksplisit, dan tetap realistis terhadap wiring repo saat ini
---
2) Audit jujur kondisi sistem saat ini
Pemetaan peran layer saat ini
MarketWatcher + SignalEngine = sensor awal
opportunityEngine = mata yang melihat peluang
RiskEngine = penjaga / rem
executionEngine = tangan / eksekutor order
Gap inti yang teridentifikasi
Sistem belum memiliki Decision Policy Layer eksplisit yang menjadi satu-satunya sumber keputusan final.
Kondisi saat ini secara logika masih seperti ini:
sensor menghasilkan snapshot dan score
opportunity layer mengubahnya menjadi assessment + `recommendedAction`
runtime memilih kandidat dari hasil opportunity
execution langsung mencoba entry terhadap kandidat terpilih
risk dipakai sebagai guard / rem, tetapi bukan sebagai otak keputusan tunggal
Arti gap ini
Saat ini:
regime sudah ada, tetapi masih lebih banyak menjadi input konteks, belum menjadi pengendali keputusan final
discovery sudah ada, tetapi belum dipaksa menjadi quality gate resmi terakhir
risk sudah ada, tetapi belum diikat ke satu layer policy yang menjadi satu-satunya sumber keputusan entry / skip / sizing
execution masih menerima kandidat hasil runtime selection, bukan hasil policy final yang eksplisit
Kesimpulan audit
Benar: sistem saat ini masih dominan scoring-based + runtime selection-based, belum context-aware decision engine penuh.
---
3) Verdict final penambahan roadmap baru
STATUS
Saat ini sistem belum memiliki decision policy layer eksplisit.
Regime, discovery, score, probability, dan risk masih berfungsi sebagai input yang tersebar, bukan sebagai pengendali keputusan utama yang tunggal.
TARGET FINAL BARU
Tambahkan Decision Policy Engine sebagai satu-satunya sumber keputusan entry / skip / sizing.
Definisi tegas
Decision Policy Engine adalah layer yang memutuskan:
apakah pair boleh masuk atau tidak boleh masuk
kapan pair harus WAIT
seberapa besar sizeMultiplier yang dipakai
seberapa agresif eksekusi boleh berjalan
alasan keputusan apa saja yang melatarinya
Dengan kata lain:
`opportunityEngine` tidak lagi menjadi sumber keputusan final entry
`RiskEngine` tetap menjadi rem / guardrail, tetapi bukan pengambil keputusan bisnis utama
`executionEngine` hanya mengeksekusi output policy, bukan menafsirkan ulang peluang dari nol
---
4) Requirement wajib Decision Policy Engine
Requirement inti
Semua keputusan entry wajib melalui `decisionPolicyEngine`.
Rule wajib
Semua keputusan entry harus melewati decisionPolicyEngine
Regime harus bisa memblokir trade
`DISTRIBUTION` = block / very defensive
`TRAP_RISK` = block
Regime harus bisa mengubah agresivitas
`EXPANSION` = boleh lebih agresif
`QUIET` = lebih sabar / defensif
Discovery harus menjadi quality gate minimum
kandidat discovery lemah tidak boleh langsung lolos hanya karena score tinggi
Output keputusan wajib eksplisit
`action` = `ENTER | SKIP | WAIT`
`sizeMultiplier`
`aggressiveness`
`reasons`
opportunityEngine tidak boleh langsung entry
executionEngine hanya mengeksekusi hasil decision
Larangan
jangan ubah target logic Batch A–F
jangan tambah ML di layer policy ini
jangan redesign besar
jangan memindahkan policy ke executionEngine
jangan membiarkan `app.ts` tetap menjadi tempat utama logika keputusan final tersebar
---
5) Prinsip desain baru: ubah dari scoring-based menjadi context-aware decision engine
Sebelum
`score -> recommendedAction -> runtime pilih kandidat -> execution coba entry`
Sesudah
`sensor -> opportunity context -> risk context -> decisionPolicyEngine -> execution`
Prinsip utamanya
Score tetap dipakai, tetapi bukan lagi sumber keputusan final tunggal.
Yang menjadi keputusan final adalah policy berbasis konteks, minimal dari:
market regime
discovery quality
opportunity quality
risk block / warning
trap / spoof / continuation context
sizing policy
aggressiveness policy
Jadi score berubah fungsi menjadi:
salah satu input penting,
bukan penentu final tunggal.
---
6) Posisi Decision Policy Layer di roadmap baru
Keputusan penting
Batch Baru A–F tetap dipertahankan.
Akan tetapi, roadmap baru sekarang wajib punya Decision Policy Layer sebagai layer lintas-batch yang mengikat seluruh jalur baru.
Cara menempatkannya tanpa merusak A–F
A tetap = Real Trade Feed Truth Layer
B tetap = Future Gainer / Trending Prediction Engine
C tetap = Portfolio & Capital Management
D tetap = Self-Evaluation / Learning Loop
E tetap = Execution Realism Upgrade
F tetap = Validation & Shadow Live for New Brain
Penambahan final yang dikunci
Tambahkan satu bagian baru:
Layer Wajib Baru — Decision Policy Engine
Layer ini bukan pengganti A–F, tetapi pengunci keputusan yang harus:
mulai didesain sejak roadmap baru dimulai,
sudah punya bentuk stabil sebelum Batch C dan E dianggap benar-benar selesai, karena sizing dan execution realism tidak boleh berjalan tanpa policy final,
menjadi penerima input dari A, B, C, dan D,
menjadi pengirim keputusan resmi ke E,
menjadi objek pembuktian di F.
Urutan eksekusi praktis yang benar
Batch A memperkuat truth layer pasar
Decision Policy Engine v1 dibangun secara rule-based
Batch B nanti boleh menambah input prediction ke policy
Batch C sizing/capital wajib tunduk ke output policy
Batch D learning hanya boleh menyesuaikan policy dengan guardrail
Batch E execution wajib hanya mengeksekusi output policy
Batch F wajib membuktikan policy layer ini benar-benar hidup
Catatan penting:
policy v1 tidak butuh ML
policy v1 boleh dibangun lebih dulu memakai input yang sudah ada sekarang
nanti saat Batch B jadi, prediction cukup menjadi input tambahan, bukan otak pengganti
---
7) Spesifikasi eksplisit Decision Policy Engine
Nama layer
`decisionPolicyEngine`
Tanggung jawab tunggal
Menjadi single source of final decision untuk:
entry
skip
wait
size multiplier
aggressiveness level
Input minimum v1
`decisionPolicyEngine` minimal menerima input berikut:
`OpportunityAssessment`
`RiskCheckResult`
`marketRegime`
`discoveryBucket` / discovery quality
`pumpProbability`
`confidence`
`trapProbability`
`spoofRisk`
`entryTiming`
settings runtime / strategy / risk yang relevan
Output minimum wajib
```ts
{
  action: 'ENTER' | 'SKIP' | 'WAIT';
  sizeMultiplier: number;
  aggressiveness: 'LOW' | 'NORMAL' | 'HIGH';
  reasons: string[];
}
```
Aturan keputusan minimum
Regime policy
`TRAP_RISK` => `SKIP`
`DISTRIBUTION` => `SKIP`
`QUIET` => boleh `WAIT` atau `ENTER` kecil jika syarat scout sangat kuat
`EXPANSION` => boleh naikkan aggressiveness bila risk tidak block
`ACCUMULATION` / `BREAKOUT_SETUP` => boleh jadi lane entry yang valid bila discovery dan risk mendukung
Discovery policy
discovery quality rendah => `SKIP` atau `WAIT`
discovery quality menengah => tidak boleh agresif penuh
discovery quality tinggi => boleh lanjut ke sizing/aggressiveness lebih tinggi
Risk policy
jika `RiskEngine` block => policy tidak boleh override menjadi `ENTER`
risk warning boleh menurunkan `sizeMultiplier`
risk warning boleh menurunkan `aggressiveness`
Sizing policy
policy menentukan `sizeMultiplier`
`RiskEngine` tetap menjaga cap final
artinya policy mengatur niat sizing, risk menjaga batas keselamatan
Aggressiveness policy
`HIGH` hanya boleh saat konteks kuat, bukan cuma karena score tinggi
`LOW` untuk quiet / uncertainty / thin-book belum matang
`NORMAL` untuk setup valid tetapi belum ekspansif
---
8) Dampak ke layer yang sudah ada
MarketWatcher + SignalEngine
Tetap jadi sensor awal.
Tidak perlu diubah menjadi decision engine.
Tugasnya tetap:
menangkap market state
membentuk score / feature / signal candidate
opportunityEngine
Tetap jadi mata.
Tetapi outputnya harus diposisikan ulang menjadi:
context assessment,
bukan otak keputusan final.
Artinya:
`recommendedAction` yang sekarang ada harus diturunkan statusnya menjadi hint / pre-decision context
keputusan final entry/skip/wait dipindah ke `decisionPolicyEngine`
RiskEngine
Tetap jadi penjaga / rem.
Tidak dijadikan otak utama, tetapi wajib menjadi input keras bagi policy.
Artinya:
risk boleh block
risk boleh batasi sizing
risk boleh turunkan aggressiveness
tetapi keputusan final formal tetap keluar dari `decisionPolicyEngine`
executionEngine
Tetap jadi tangan / eksekutor.
Artinya:
jangan lagi menafsirkan peluang sendiri
jangan lagi menerima kandidat mentah dari runtime selection
terima hasil decision yang sudah final
---
9) Integrasi final yang wajib
Integrasi runtime
`app.ts` tidak boleh lagi menjadi tempat keputusan entry final tersebar.
Runtime flow target:
market scan
signal generation
opportunity assessment
risk check
`decisionPolicyEngine.decide(...)`
hanya jika action `ENTER`, runtime boleh kirim ke execution
Integrasi candidate selection
Seleksi kandidat runtime harus berpindah dari pola:
filter `recommendedAction`
sort score
menjadi pola:
policy decision per kandidat
hanya kandidat `ENTER` yang eligible
ranking final berdasarkan output decision + quality context yang sudah disahkan policy
Integrasi execution
`executionEngine` hanya boleh menerima objek keputusan final, misalnya:
pair
action
sizeMultiplier
aggressiveness
reasons
context ringkas untuk audit/log
Integrasi observability
Reason dari policy harus bisa muncul di:
journal/log
summary operator
hotlist / ranking bila relevan
probe validation
---
10) File/area yang kemungkinan wajib disentuh saat implementasi
Minimal
`src/core/types.ts`
`src/domain/intelligence/opportunityEngine.ts`
`src/domain/trading/riskEngine.ts`
`src/domain/trading/executionEngine.ts`
`src/app.ts`
`src/domain/decision/decisionPolicyEngine.ts` (baru)
Mungkin ikut disentuh bila perlu sinkronisasi output
`src/services/summaryService.ts`
`src/services/reportService.ts`
probe tests yang memverifikasi runtime selection / entry flow / decision reasons
Batasan sentuhan
hanya sentuh area yang memang dibutuhkan untuk wiring policy final
jangan refactor liar ke modul yang tidak terkait
jangan buka scope baru di luar jalur decision layer
---
11) Acceptance criteria final untuk penambahan ini
Decision Policy Layer baru dianggap benar bila semua ini terpenuhi:
Tidak ada jalur auto-entry yang bypass policy
Regime `DISTRIBUTION` dan `TRAP_RISK` benar-benar bisa block trade
`EXPANSION` dan `QUIET` benar-benar mempengaruhi aggressiveness
Discovery benar-benar menjadi minimum quality gate
Output decision eksplisit ada:
`action`
`sizeMultiplier`
`aggressiveness`
`reasons`
opportunityEngine tidak lagi menjadi pengambil keputusan final entry
executionEngine hanya mengeksekusi hasil decision
Log/journal dapat menjelaskan kenapa pair ENTER / WAIT / SKIP
Probe dapat membuktikan flow ini benar-benar hidup
---
12) Dampak ke roadmap baru A–F
Batch A — Real Trade Feed Truth Layer
Tetap sama.
Tambahan makna:
hasil A akan menjadi input truth yang lebih kuat untuk policy
Batch B — Future Gainer / Trending Prediction Engine
Tetap sama.
Tambahan makna:
output prediction nanti masuk sebagai input tambahan policy, bukan pengganti policy
Batch C — Portfolio & Capital Management
Tetap sama.
Tambahan makna:
sizing adaptif wajib mengikuti decision policy, bukan berdiri sendiri
Batch D — Self-Evaluation / Learning Loop
Tetap sama.
Tambahan makna:
learning hanya boleh menyentuh parameter policy secara aman, bukan membuat sistem override guardrail secara liar
Batch E — Execution Realism Upgrade
Tetap sama.
Tambahan makna:
execution realism bekerja di bawah keputusan policy, bukan menjadi otak keputusan
Batch F — Validation & Shadow Live for New Brain
Tetap sama.
Tambahan makna:
Batch F wajib menambahkan pembuktian khusus bahwa decision policy layer benar-benar jadi sumber keputusan final
---
13) Final keputusan roadmap yang harus dipegang
roadmap lama tetap dianggap selesai terpisah
roadmap baru A–F tetap dipertahankan
Decision Policy Engine wajib ditambahkan sebagai layer baru yang eksplisit
policy ini tidak boleh memakai ML di versi awal
policy ini harus menjadi penghubung resmi antara context, risk, sizing, dan execution
sistem harus bergeser dari scoring-based selection menjadi context-aware decision engine
`recommendedAction` existing tidak lagi diperlakukan sebagai keputusan final, melainkan context hint
`executionEngine` tidak boleh menjadi tempat logika keputusan bisnis utama
`app.ts` tidak boleh tetap menjadi pusat logika keputusan final yang tercecer
---
14) VERDICT FINAL PENAMBAHAN ROADMAP BARU
FINAL DAN TEGAS
Penambahan Decision Policy Engine memang perlu, valid, dan seharusnya dimasukkan ke roadmap baru sekarang.
Alasan tegas
Karena saat ini sistem:
sudah punya sensor,
sudah punya opportunity,
sudah punya risk,
sudah punya execution,
tetapi belum punya brain layer final yang eksplisit dan tunggal.
Keputusan akhir
Roadmap upgrade otak bot yang baru harus diperbarui dari pola:
scoring-heavy runtime selection
menjadi:
context-aware decision architecture
Rumus final arsitektur target
Sensor -> Opportunity Context -> Risk Context -> Decision Policy Engine -> Execution
Itulah bentuk final yang harus dipegang untuk roadmap baru ini.
