# Batch B Fase 2 — Shadow-Live Calibration Report

Run ID: shadow-phase2-target-1774711044521
Generated At (UTC): 2026-03-28T15:17:24.582Z

## Ringkasan Tracking
- Total prediction: 1
- Resolved: 1
- Pending: 0
- Expired: 0
- Insufficient-data: 0

## Akurasi per Confidence Bucket
- LOW: akurasi=0.00% resolved=0 pending=0
- MID: akurasi=0.00% resolved=0 pending=0
- HIGH: akurasi=100.00% resolved=1 pending=0

## Drift & Calibration
- Mean absolute confidence calibration gap: 0.22000
- Expected calibration error (ECE): 0.22000
- Mean drift horizon: 0.00 menit
- P95 drift horizon: 0.00 menit
- Confidence mismatch count: 0

## Rekomendasi Adjustment
- Pertahankan threshold saat ini; lanjut monitor mismatch confidence harian.

## Warning Area Prediction
- Sample resolved masih kecil; rekomendasi threshold bersifat sementara.

## Keterbatasan Pengujian
- Outcome hanya bisa di-resolve jika snapshot reference + snapshot horizon tersedia di pair-history runtime.
- Status pending/insufficient-data tidak boleh diartikan sebagai akurasi buruk/baik; hanya menandakan coverage belum cukup.
- Ini kalibrasi shadow-live prediction Batch B, bukan bukti final live-readiness dan bukan market-real capital validation.

> Batas jujur: ini lapisan lanjutan shadow-live calibration prediction Batch B, bukan pengganti Batch F dan bukan market-real capital validation.
