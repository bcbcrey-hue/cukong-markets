# Tahap 0A — Audit Jalur Keputusan Auto-Entry Aktual

Tanggal audit: 2026-03-27

## 1) Audit ringkas awal

Kondisi runtime aktual (berdasarkan wiring source yang hidup saat `createApp()`):

- `OpportunityEngine.assess()` membentuk `recommendedAction` (`WATCH|AVOID|SCOUT_ENTER|ADD_ON_CONFIRM|CONFIRM_ENTRY|PREPARE_ENTRY`) dari kombinasi timing, probability, microstructure, dan threshold confidence. Ini **belum** keputusan final eksekusi. 
- `app.ts` masih memegang runtime selector final kandidat (`selectRuntimeEntryCandidate`) sebelum eksekusi dipanggil.
- `ExecutionEngine.decideAutoExecution()` masih melakukan keputusan bisnis tambahan lagi (re-check score/confidence/pump/timing/recommendedAction) sebelum `buy()`.
- `RiskEngine.checkCanEnter()` dipanggil di `ExecutionEngine.buy()` sebagai gate terakhir; risk tidak sekadar teknis, tetapi ikut memutus lane (`SCOUT`/`ADD_ON_CONFIRM`) dan beberapa rule entry bisnis.

Kesimpulan sebaran keputusan final saat ini:

1. **opportunityEngine**: membentuk hint keputusan (`recommendedAction`) + context.
2. **app.ts**: memfilter + memilih kandidat runtime.
3. **executionEngine**: memutuskan ulang shouldEnter (double decision).
4. **riskEngine**: gate terakhir + lane-dependent business constraints.

Risiko mismatch/bypass/duplikasi yang ditemukan:

- Ada **duplikasi rule entry** antara `app.ts` selector (`isRuntimeEntryEligible`) dan `executionEngine.decideAutoExecution()`.
- Ada **potensi bypass runtime selector** untuk jalur non-runtime (mis. manual buy/handler yang langsung memanggil `execution.buy`) karena selector hanya dipakai loop auto runtime.
- `recommendedAction` bukan keputusan final tunggal karena tetap bisa di-veto/diubah di execution+risk.

## 2) Peta jalur keputusan aktual (runtime hidup)

Urutan aktual:

`snapshot/signal -> opportunity assessment -> runtime candidate filtering -> runtime candidate selection -> execution auto-entry decision -> risk gate -> buy execution`

### 2.1 Opportunity assessment

- **File**: `src/domain/intelligence/opportunityEngine.ts`
- **Function**: `assess(snapshot, signal)`
- **Input**: `MarketSnapshot`, `SignalCandidate`, history context, feature pipeline/probability/entry timing.
- **Kondisi kunci**:
  - invalid edge/timing buruk => `recommendedAction='AVOID'`
  - `SCOUT_WINDOW` + micro-thin healthy + pre-pump pressure + confidence memadai => `SCOUT_ENTER`
  - `CONFIRM_WINDOW` + continuation kuat => `ADD_ON_CONFIRM`
  - continuation kuat umum => `CONFIRM_ENTRY`
  - score >= 60 => `PREPARE_ENTRY`
- **Output keputusan**: `OpportunityAssessment` berisi `recommendedAction`, `entryStyle`, `pumpState`, dll.
- **Consumer berikutnya**: `app.ts` (market-scan loop -> `selectRuntimeEntryCandidate`).

### 2.2 Runtime candidate filtering + selection

- **File**: `src/app.ts`
- **Function**: `isRuntimeEntryEligible(candidate, settings)`
- **Input**: `OpportunityAssessment`, `BotSettings`
- **Kondisi kunci**:
  - wajib `edgeValid`
  - `recommendedAction` hanya `ENTER|SCOUT_ENTER|ADD_ON_CONFIRM`
  - `pumpProbability >= minPumpProbability`
  - `confidence >= minConfidence`
- **Output keputusan**: boolean eligible.
- **Consumer berikutnya**: `selectRuntimeEntryCandidate`.

- **File**: `src/app.ts`
- **Function**: `selectRuntimeEntryCandidate(opportunities, settings)`
- **Input**: list opportunity + settings
- **Kondisi kunci**:
  - prioritas lane: `SCOUT_ENTER+ANOMALY` > `SCOUT_ENTER+STEALTH` > `ADD_ON_CONFIRM` > fallback eligible tertinggi.
  - sorting pakai pair class priority `MICRO > MID > MAJOR`, lalu `finalScore`.
- **Output keputusan**: satu kandidat runtime (atau `undefined`).
- **Consumer berikutnya**: market-scan loop memanggil `executionEngine.attemptAutoBuy(selectedRuntimeCandidate)` jika mode `FULL_AUTO`.

### 2.3 Execution entry gate

- **File**: `src/domain/trading/executionEngine.ts`
- **Function**: `decideAutoExecution(candidate)`
- **Input**: candidate (Signal/Opportunity) + settings internal.
- **Kondisi kunci**:
  - trading mode OFF => reject
  - score < alert => WATCH
  - score < buy => PREPARE_ENTRY
  - confidence < min => AVOID
  - jika opportunity: `SCOUT_ENTER` atau `ADD_ON_CONFIRM` => allow enter cepat
  - jika opportunity umum: cek ulang `edgeValid`, `pumpProbability`, `entryTiming`
- **Output keputusan**: `AutoExecutionDecision` (`shouldEnter`, `action`, `reasons`).
- **Consumer berikutnya**: `attemptAutoBuy`.

- **File**: `src/domain/trading/executionEngine.ts`
- **Function**: `attemptAutoBuy(signal)`
- **Input**: kandidat terpilih runtime
- **Kondisi kunci**:
  - hanya lanjut jika `decision.shouldEnter` dan `tradingMode===FULL_AUTO`
  - skip jika tidak ada default account atau ada active BUY order.
- **Output keputusan**: skip reason string atau lanjut `buy(...)`.
- **Consumer berikutnya**: `buy`.

### 2.4 Risk gate + buy execution

- **File**: `src/domain/trading/executionEngine.ts`
- **Function**: `buy(accountId, signal, amountIdr, source)`
- **Input**: account, candidate, settings, open positions, cooldown.
- **Kondisi kunci**:
  - panggil `risk.checkCanEnter(...)`.
  - jika `allowed=false` => throw error (entry stop).
- **Output keputusan**: order submit/simulate + position open jika lolos.
- **Consumer berikutnya**: order manager / position manager / exchange client.

- **File**: `src/domain/trading/riskEngine.ts`
- **Function**: `checkCanEnter(input)`
- **Input**: account, settings, signal/opportunity, open positions, amount, cooldown.
- **Kondisi kunci**:
  - lane diturunkan dari `recommendedAction` (`SCOUT_ENTER` => 0.3x size, `ADD_ON_CONFIRM` => 0.55x).
  - cek account enabled, harga referensi valid, min score/confidence, spread, max position size/open positions, same pair rule, cooldown, anti-spoof.
  - jika opportunity: cek `edgeValid`, min pump probability, timing blocked states, add-on specific rules.
- **Output keputusan**: `RiskCheckResult` (`allowed`, `reasons`, `entryLane`, `adjustedAmountIdr`).
- **Consumer berikutnya**: `ExecutionEngine.buy()`.

## 3) Daftar titik keputusan yang harus dipindah ke policy layer

### 3.1 Harus jadi milik policy layer (future)

1. Keputusan final **enter/wait/skip** yang saat ini tersebar di:
   - `OpportunityEngine.recommendedAction`
   - `app.ts` `isRuntimeEntryEligible/selectRuntimeEntryCandidate`
   - `ExecutionEngine.decideAutoExecution`
2. Prioritas lane kandidat runtime (`SCOUT anomaly/stealth/add-on/fallback`) yang saat ini ada di `app.ts`.
3. Pengikatan konteks opportunity + regime + lane jadi satu output keputusan final sebelum execution.

### 3.2 Tetap milik risk guardrail

1. Validasi account enabled, max position size, max open positions, cooldown.
2. Hard anti-spoof threshold block.
3. Validasi teknis harga referensi/nominal/quantity valid.
4. Stop/takeprofit/trailing stop builder.

### 3.3 Tetap milik execution

1. Idempotency & duplicate active order guard.
2. Submit/cancel/reconcile order exchange.
3. Simulasi/live execution persistence + journaling + summary.

### 3.4 Hanya hint/context (bukan final decision)

1. `recommendedAction` dari opportunity.
2. `entryStyle`, `pumpState`, `riskContext`, `historicalMatchSummary`.
3. `finalScore` sebagai ranking signal, bukan keputusan tunggal.

## 4) File yang disentuh untuk Tahap 0A ini

### 4.1 Wajib disentuh sekarang

- `docs/decision_path_audit_stage_0A.md`
  - Menyimpan hasil audit 0A secara permanen di repo agar tidak hilang/implisit.

### 4.2 Opsional (disentuh karena sinkronisasi dokumentasi)

- `README.md`
  - Menambahkan referensi eksplisit ke dokumen audit 0A agar jalur validasi + status implementasi tidak ambigu.

### 4.3 Sengaja tidak disentuh (di luar scope 0A)

- `src/domain/*` logic implementation (tidak ada refactor policy engine penuh).
- UX Telegram, market/feed/history yang tidak wajib untuk audit ini.
- Branch protection/ruleset GitHub (external setting).

## 5) Validasi yang dipakai untuk bukti audit

Command validasi resmi yang dijalankan:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck:probes`
4. `npm run build`
5. `npm run probe:list`
6. `npm run probe:audit`
7. `npm run test:probes`
8. `npm run verify`
9. `npm run runtime:contract`

Hasil: seluruh command PASS pada lingkungan audit ini.

## 6) Status CI / merge gate (jujur)

- Workflow `.github/workflows/ci.yml` sudah menjalankan urutan validasi yang diminta.
- Workflow juga mem-publish context `verify-runtime-contract/combined` agar commit status gabungan tidak kosong.
- **Blocker eksternal tetap ada**: aturan “PR tidak boleh merge kalau CI gagal” harus dipaksa via GitHub Branch Protection/Ruleset, tidak bisa dijamin dari source code saja.

## 7) Verdict untuk Tahap 0A

**LAYAK MERGE TERBATAS UNTUK TAHAP 0A**

Alasan:
- Jalur keputusan aktual sudah terpetakan dari source + probe runtime yang hidup.
- Titik keputusan final tersebar sudah didaftarkan eksplisit.
- Belum ada implementasi DecisionPolicyEngine final (memang belum scope Tahap 0A).
