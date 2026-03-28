# Fase 3 — Market-Real Validation Report

Run ID: phase3-57bef6bc-3830-489f-b60e-99625cb4bff2
Generated At (UTC): 2026-03-28T15:17:50.509Z
Verdict readiness: BELUM_SIAP_MERGE

## capital_exposure
Validasi batas allocated/allowed + exposure pair-class/discovery dari runtime evidence.
- [PASS] capital-allocated-bounded (SOURCE_PROBE, otomatis) | notes=policyIntent=180000; allowed=0; allocated=0
- [PASS] capital-exposure-limits-respected (SOURCE_PROBE, otomatis)

## exchange_reconciliation_resilience
Validasi cancel/uncertain/recovery seeded + shadow-live evidence + manual market-real boundary.
- [PASS] exchange-cancel-uncertain-bounded (SOURCE_PROBE, otomatis) | notes=Canceled 1 active orders; unresolved 1 submission-uncertain orders
- [PASS] exchange-recovery-evidence-present (SOURCE_PROBE, otomatis) | notes=exchangeCancelEvidence=1
- [FAIL] shadow-live-proof-reuse (SHADOW_LIVE, otomatis) | notes=Belum ada shadow evidence di archive. Jalankan: RUN_REAL_EXCHANGE_SHADOW=1 npm run probe:shadow-live
- [FAIL] market-real-manual-evidence-ingested (MARKET_REAL, manual) | notes=Belum ada evidence manual. Gunakan: npm run validate:phase3:market-real-check -- <json-file>

## emergency_recovery
Validasi emergency exit + consistency evidence summaries/outcomes.
- [PASS] emergency-summary-persisted (SOURCE_PROBE, otomatis) | notes=emergencyExecutionSummary=2; tradeOutcomes=0

## Readiness Checklist
- phase3-source-probe-suite: PASS (SOURCE_PROBE) — Suite source/probe untuk capital + exchange ops + emergency harus lulus
- phase3-shadow-live-proof: MANUAL_REQUIRED (SHADOW_LIVE) — Strict shadow-live proof harus tersedia dari evidence archive
- phase3-market-real-proof: MANUAL_REQUIRED (MARKET_REAL) — Market-real proof harus berasal dari evidence manual exchange nyata

## Batas Bukti
- Source/probe proof: Dibuktikan oleh validate:phase3 seeded/non-destruktif terhadap runtime path lokal.
- Shadow-live proof: Dibuktikan oleh verify:shadow-live + evidence archive ShadowRunEvidence.
- Market-real proof: Dibuktikan lewat evidence manual real exchange yang di-ingest, bukan dari seeded probe.

## Limitations
- Source/probe proof tidak boleh disamakan dengan market-real proof.
- Ruleset GitHub branch protection tetap harus diverifikasi di setting repository.
- Shadow-live proof belum full-pass dari evidence archive latest run.
- Market-real proof masih manual-required atau ada check manual yang gagal.

> Kejujuran readiness: laporan ini tidak boleh mengklaim market-real pass tanpa environment exchange nyata.
