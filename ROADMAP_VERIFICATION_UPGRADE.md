# ROADMAP VERIFICATION \& UPGRADE — CUKONG-MARKETS

> \*\*Dokumen ini dibuat berdasarkan audit eksplisit terhadap kondisi terbaru repository.\*\*
> Repository: https://github.com/masreykangtrade-oss/cukong-markets
> Tanggal Audit: 28 Maret 2026

\---

## 📊 STATUS SAAT INI

|Komponen|Status|Keterangan|

|**Backtest Kuantitatif**|❌ BELUM ADA|Prediction belum diuji historis|
|**Shadow-Live Kalibrasi**|❌ BELUM ADA|Akurasi belum diukur real-time|
|**End-to-End Exchange**|❌ BELUM ADA|Belum ada bukti di exchange sungguhan|

\---

## 🎯 TUJUAN ROADMAP INI

Membawa bot dari kondisi **"SIAP DEPLOY SOURCE"** menjadi **"TERBUKTI SIAP LIVE TRADING"** melalui tiga fase verifikasi:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VERIFICATION PIPELINE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  FASE 1: BACKTEST KUANTITATIF                                       │
│  └─ Uji formula prediksi dengan data historis                       │
│      └─ Output: Akurasi terukur, parameter terkalibrasi             │
│                                                                      │
│  FASE 2: SHADOW-LIVE KALIBRASI                                      │
│  └─ Jalankan di market real tanpa eksekusi sungguhan                │
│      └─ Output: Confidence terkalibrasi, regime detection valid     │
│                                                                      │
│  FASE 3: END-TO-END EXCHANGE                                        │
│  └─ Bukti koneksi API, order flow, dan edge cases                   │
│      └─ Output: Sistem terbukti bekerja di production               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

\---

# ═══════════════════════════════════════════════════════════════════

# FASE 1: BACKTEST KUANTITATIF

# ═══════════════════════════════════════════════════════════════════

## 1.1 Tujuan

Membuktikan bahwa `FutureTrendingPredictionEngine` memiliki akurasi yang terukur dan dapat diandalkan.

## 1.2 Scope

|Yang Diuji|Deskripsi|
|-|-|
|Direction Accuracy|Seberapa sering prediksi UP/DOWN benar?|
|Confidence Calibration|Apakah confidence 0.7 = 70% akurat?|
|Horizon Validity|Apakah 15 menit horizon optimal?|
|Regime Performance|Di kondisi market apa prediksi akurat/tidak?|
|Feature Weights|Apakah bobot feature sudah optimal?|

## 1.3 Deliverables

### 1.3.1 Data Collector Module

**File baru:** `src/domain/backtest/historicalDataCollector.ts`

```
Tujuan: Mengumpulkan data historis dari Indodax

Fitur:
├─ Fetch historical candles (OHLCV) per pair
├─ Fetch historical orderbook snapshots (jika tersedia)
├─ Fetch historical trades
├─ Store ke local database (SQLite/CSV)
└─ Period: minimal 6 bulan data

Output:
├─ data/historical/{pair}\_candles.csv
├─ data/historical/{pair}\_trades.csv
└─ data/historical/metadata.json
```

### 1.3.2 Backtest Engine

**File baru:** `src/domain/backtest/backtestEngine.ts`

```
Tujuan: Simulasi prediksi dengan data historis

Flow:
1. Load historical data
2. Reconstruct market snapshots per interval
3. Run SignalEngine → OpportunityEngine → PredictionEngine
4. Bandingkan prediksi dengan outcome aktual
5. Hitung metrik akurasi

Input:
├─ Historical data (candles, trades, orderbook)
├─ Time range (start\_date, end\_date)
├─ Pairs to test
└─ Initial capital (virtual)

Output:
├─ Total predictions made
├─ Direction accuracy (UP/DOWN/SIDEWAYS)
├─ Confidence calibration curve
├─ Win rate per confidence bucket
├─ Error analysis
└─ Regime breakdown
```

### 1.3.3 Metrics Calculator

**File baru:** `src/domain/backtest/metricsCalculator.ts`

```typescript
interface BacktestMetrics {
  // Direction Accuracy
  directionAccuracy: {
    overall: number;           // Total benar / total prediksi
    upAccuracy: number;        // UP benar / total UP
    downAccuracy: number;      // DOWN benar / total DOWN
    sidewaysAccuracy: number;  // SIDEWAYS benar / total SIDEWAYS
  };

  // Confidence Calibration
  confidenceCalibration: {
    bucket\_0\_50: number;  // Akurasi untuk confidence 0-0.5
    bucket\_50\_60: number; // Akurasi untuk confidence 0.5-0.6
    bucket\_60\_70: number; // Akurasi untuk confidence 0.6-0.7
    bucket\_70\_80: number; // Akurasi untuk confidence 0.7-0.8
    bucket\_80\_100: number; // Akurasi untuk confidence 0.8-1.0
  };

  // Expected Move Accuracy
  moveAccuracy: {
    averageError: number;      // Rata-rata error expectedMovePct
    medianError: number;       // Median error
    withinTolerance: number;   // % prediksi dalam toleransi ±0.5%
  };

  // Regime Performance
  regimePerformance: {
    expansion: RegimeMetric;
    quiet: RegimeMetric;
    trapRisk: RegimeMetric;
    distribution: RegimeMetric;
  };

  // Time-based Performance
  timePerformance: {
    byHour: Map<number, number>;     // Akurasi per jam
    byDayOfWeek: Map<number, number>; // Akurasi per hari
  };
}
```

### 1.3.4 Backtest Report Generator

**File baru:** `src/domain/backtest/reportGenerator.ts`

```
Output: Laporan backtest lengkap dalam format:
├─ JSON (machine-readable)
├─ Markdown (human-readable)
└─ HTML (visual dashboard)

Isi Laporan:
├─ Executive Summary
│   ├─ Overall accuracy
│   ├─ Recommended confidence threshold
│   └─ Recommended use cases
│
├─ Detailed Metrics
│   ├─ Direction accuracy per confidence level
│   ├─ Calibration curve
│   └─ Error distribution
│
├─ Regime Analysis
│   ├─ Performance per market regime
│   └─ When to trust/distrust prediction
│
├─ Recommendations
│   ├─ Parameter adjustments
│   ├─ Confidence threshold recommendation
│   └─ Feature weight optimization suggestions
│
└─ Appendix
    ├─ Raw data summary
    └─ Methodology notes
```

## 1.4 Acceptance Criteria

|Kriteria|Target Minimum|
|-|-|
|Data Coverage|Minimal 6 bulan, minimal 5 pair aktif|
|Total Predictions|Minimal 10,000 prediksi|
|Direction Accuracy (overall)|> 55%|
|Direction Accuracy (confidence >= 0.7)|> 65%|
|Confidence Calibration Error|< 10% (confidence 0.7 harus akurat 60-80%)|
|Report Completeness|Semua section terisi|

## 1.5 Probe Tests

**File baru:** `tests/backtest\_engine\_probe.ts`

```typescript
// Test cases:
1. Historical data loading works
2. Snapshot reconstruction is accurate
3. Prediction engine produces consistent output
4. Metrics calculation is correct
5. Report generation completes without error
6. Edge cases: missing data, corrupted data, extreme volatility
```

## 1.6 Timeline

|Milestone|Estimasi|Deliverable|
|-|-|-|
|Data Collector|3 hari|Historical data tersimpan lokal|
|Backtest Engine|5 hari|Engine bisa run end-to-end|
|Metrics Calculator|2 hari|Metrik terhitung dengan benar|
|Report Generator|2 hari|Laporan bisa di-generate|
|Probe Tests|2 hari|Semua probe pass|
|**Total**|**14 hari**|FASE 1 selesai|

## 1.7 Output Fase 1

```
┌─────────────────────────────────────────────────────────────────────┐
│ OUTPUT FASE 1: BACKTEST REPORT                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ 📊 AKURASI PREDIKSI:                                                │
│    ├─ Overall Direction Accuracy: 58.3%                             │
│    ├─ UP Accuracy: 61.2%                                            │
│    ├─ DOWN Accuracy: 55.8%                                          │
│    └─ SIDEWAYS Accuracy: 52.1%                                      │
│                                                                      │
│ 📈 CALIBRASI CONFIDENCE:                                            │
│    ├─ Confidence 0.5-0.6 → Akurasi 52%                              │
│    ├─ Confidence 0.6-0.7 → Akurasi 58%                              │
│    ├─ Confidence 0.7-0.8 → Akurasi 67% ✅ RECOMMENDED               │
│    └─ Confidence 0.8-1.0 → Akurasi 72%                              │
│                                                                      │
│ ⚠️ REKOMENDASI:                                                     │
│    ├─ Gunakan confidence threshold >= 0.7 untuk boost sizing        │
│    ├─ Jangan gunakan prediction saat regime TRAP\_RISK               │
│    └─ Horizon 15 menit optimal untuk pair MICRO, terlalu pendek    │
│       untuk pair MAJOR                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

\---

# ═══════════════════════════════════════════════════════════════════

# FASE 2: SHADOW-LIVE KALIBRASI

# ═══════════════════════════════════════════════════════════════════

## 2.1 Tujuan

Mengukur dan mengkalibrasi akurasi prediksi di kondisi market real-time tanpa risiko finansial.

## 2.2 Prinsip

```
SHADOW-LIVE = Bot berjalan di market NYATA tapi:
├─ TIDAK ada order yang dieksekusi
├─ TIDAK ada uang sungguhan yang dipertaruhkan
├─ HANYA mencatat prediksi vs outcome
└─ FOKUS pada pengukuran akurasi real-time
```

## 2.3 Scope

|Yang Diuji|Deskripsi|
|-|-|
|Real-time Prediction|Prediksi dibuat dengan data live|
|Outcome Tracking|Catat hasil aktual setelah 15 menit|
|Confidence Drift|Apakah confidence berubah saat live?|
|Regime Detection|Apakah regime detection akurat?|
|Latency Impact|Apakah delay data mempengaruhi akurasi?|

## 2.4 Deliverables

### 2.4.1 Shadow Mode Runner

**File baru:** `src/services/shadowModeRunner.ts`

```typescript
interface ShadowModeConfig {
  enabled: boolean;                    // Harus true untuk shadow mode
  pairs: string\[];                     // Pair yang dimonitor
  predictionIntervalMs: number;        // Interval prediksi (default: 60000)
  outcomeCheckIntervalMs: number;      // Interval cek outcome (default: 60000)
  logPredictions: boolean;             // Log setiap prediksi
  logOutcomes: boolean;                // Log setiap outcome
  maxConcurrentPairs: number;          // Maksimal pair bersamaan
}

class ShadowModeRunner {
  // Start shadow mode
  async start(config: ShadowModeConfig): Promise<void>;

  // Stop shadow mode
  async stop(): Promise<void>;

  // Get current predictions
  getActivePredictions(): Prediction\[];

  // Get accuracy metrics
  getAccuracyMetrics(): AccuracyMetrics;

  // Get calibration status
  getCalibrationStatus(): CalibrationStatus;
}
```

### 2.4.2 Prediction Tracker

**File baru:** `src/services/predictionTracker.ts`

```typescript
interface TrackedPrediction {
  id: string;
  pair: string;
  timestamp: number;
  
  // Prediction data
  prediction: {
    direction: 'UP' | 'DOWN' | 'SIDEWAYS';
    confidence: number;
    expectedMovePct: number;
    strength: 'WEAK' | 'MODERATE' | 'STRONG';
    calibrationTag: string;
  };

  // Market context saat prediksi
  context: {
    price: number;
    regime: MarketRegime;
    pumpProbability: number;
    trapProbability: number;
    spoofRisk: number;
  };

  // Outcome (diisi setelah 15 menit)
  outcome?: {
    priceAfter15m: number;
    actualMovePct: number;
    actualDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
    predictionCorrect: boolean;
    errorPct: number;
  };

  // Status
  status: 'PENDING' | 'RESOLVED' | 'EXPIRED';
}
```

### 2.4.3 Calibration Engine

**File baru:** `src/domain/calibration/calibrationEngine.ts`

```typescript
interface CalibrationEngine {
  // Hitung calibration score berdasarkan history
  calculateCalibration(predictions: TrackedPrediction\[]): CalibrationScore;

  // Adjust confidence berdasarkan calibration
  adjustConfidence(rawConfidence: number, context: MarketContext): number;

  // Detect confidence drift
  detectConfidenceDrift(): DriftReport;

  // Generate calibration recommendations
  generateRecommendations(): CalibrationRecommendation\[];
}

interface CalibrationScore {
  // Brier Score (semakin rendah semakin baik, 0 = perfect)
  brierScore: number;

  // Calibration Error (rata-rata |predicted\_prob - actual\_freq|)
  calibrationError: number;

  // Sharpness (seberapa berani prediksi, 1 = selalu 0 atau 1)
  sharpness: number;

  // Reliability Diagram data
  reliabilityCurve: { predicted: number, actual: number }\[];
}
```

### 2.4.4 Shadow Mode Dashboard

**File baru:** `src/services/shadowModeDashboard.ts`

```
Output ke Telegram:

╔══════════════════════════════════════════════════════════════╗
║              🌑 SHADOW MODE STATUS                            ║
╠══════════════════════════════════════════════════════════════╣
║ Runtime: 2h 34m                                               ║
║ Predictions Made: 47                                          ║
║ Predictions Resolved: 32                                      ║
║ Pending: 15                                                   ║
╠══════════════════════════════════════════════════════════════╣
║ 📊 ACCURACY (Last 32):                                        ║
║    ├─ Overall: 62.5%                                          ║
║    ├─ UP predictions: 66.7% (12/18)                           ║
║    ├─ DOWN predictions: 57.1% (4/7)                           ║
║    └─ SIDEWAYS: 57.1% (4/7)                                   ║
╠══════════════════════════════════════════════════════════════╣
║ 📈 CALIBRATION:                                               ║
║    ├─ Confidence 0.5-0.6 → 48% actual                         ║
║    ├─ Confidence 0.6-0.7 → 61% actual                         ║
║    ├─ Confidence 0.7-0.8 → 69% actual ✅                      ║
║    └─ Confidence 0.8+ → 75% actual                            ║
╠══════════════════════════════════════════════════════════════╣
║ ⚠️ DRIFT DETECTED:                                            ║
║    └─ Confidence 0.6-0.7 overconfident by 8%                  ║
║    └─ Recommendation: Lower threshold to 0.65                 ║
╚══════════════════════════════════════════════════════════════╝
```

### 2.4.5 Shadow Mode Persistence

**File baru:** `src/storage/shadowModeStore.ts`

```
Menyimpan ke file:
├─ data/shadow/predictions\_{date}.jsonl   // Satu file per hari
├─ data/shadow/metrics\_{date}.json        // Metrik harian
├─ data/shadow/calibration.json           // Status kalibrasi terkini
└─ data/shadow/recommendations.json       // Rekomendasi parameter
```

## 2.5 Acceptance Criteria

|Kriteria|Target Minimum|
|-|-|
|Runtime Duration|Minimal 7 hari kontinu|
|Total Predictions|Minimal 500 prediksi|
|Pending Rate|< 5% (prediction harus resolve)|
|Calibration Error|< 15%|
|Drift Detection|Sistem bisa detect drift otomatis|
|Dashboard Updates|Real-time ke Telegram setiap jam|

## 2.6 Probe Tests

**File baru:** `tests/shadow\_mode\_probe.ts`

```typescript
// Test cases:
1. Shadow mode start/stop works correctly
2. Predictions are tracked properly
3. Outcomes are resolved correctly after horizon
4. Metrics are calculated accurately
5. Calibration detects drift
6. Persistence works across restart
7. Edge cases: network disconnect, API failure, extreme volatility
```

## 2.7 Timeline

|Milestone|Estimasi|Deliverable|
|-|-|-|
|Shadow Mode Runner|3 hari|Bot bisa jalan shadow mode|
|Prediction Tracker|2 hari|Prediksi ter-track dengan benar|
|Calibration Engine|3 hari|Kalibrasi bekerja otomatis|
|Dashboard|2 hari|Telegram updates real-time|
|Persistence|1 hari|Data tersimpan aman|
|Probe Tests|2 hari|Semua probe pass|
|Live Testing|7 hari|Run kontinu 7 hari|
|**Total**|**20 hari**|FASE 2 selesai|

## 2.8 Output Fase 2

```
┌─────────────────────────────────────────────────────────────────────┐
│ OUTPUT FASE 2: CALIBRATION REPORT                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ 📊 HASIL 7 HARI SHADOW-LIVE:                                        │
│    ├─ Total Prediksi: 847                                           │
│    ├─ Resolved: 812 (95.9%)                                         │
│    └─ Pending/Expired: 35 (4.1%)                                    │
│                                                                      │
│ 📈 AKURASI PER CONFIDENCE:                                          │
│    ├─ 0.50-0.60: Actual 49% (calibrated: no change)                 │
│    ├─ 0.60-0.70: Actual 56% (calibrated: adjust to 0.57)            │
│    ├─ 0.70-0.80: Actual 68% (calibrated: no change) ✅              │
│    └─ 0.80-1.00: Actual 74% (calibrated: no change)                 │
│                                                                      │
│ 🎯 REKOMENDASI PARAMETER:                                           │
│    ├─ Min Confidence untuk boost sizing: 0.70 (unchanged)           │
│    ├─ Confidence adjustment factor untuk 0.6-0.7: ×0.95              │
│    └─ Ignore prediction saat regime TRAP\_RISK/DISTRIBUTION          │
│                                                                      │
│ ⚠️ PERINGATAN:                                                      │
│    ├─ Akurasi turun 12% saat volume spike                           │
│    ├─ Horizon 15m terlalu pendek untuk pair dengan spread > 1%      │
│    └─ SideWAYS prediction tidak reliable (52% saja)                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

\---

# ═══════════════════════════════════════════════════════════════════

# FASE 3: END-TO-END EXCHANGE EVIDENCE

# ═══════════════════════════════════════════════════════════════════

## 3.1 Tujuan

Membuktikan bahwa sistem bekerja end-to-end dengan exchange sungguhan, termasuk semua edge cases.

## 3.2 Prinsip

```
END-TO-END = Bukti nyata bahwa:
├─ API authentication bekerja
├─ Order bisa masuk ke orderbook
├─ Order bisa di-cancel
├─ Balance tracking akurat
├─ Emergency exit bekerja
└─ Error handling robust
```

## 3.3 Scope

|Yang Diuji|Deskripsi|
|-|-|
|API Authentication|API key, signature, rate limiting|
|Order Flow|Create, cancel, partial fill|
|Balance Tracking|Reconcile dengan exchange|
|Position Management|Open, close, track|
|Error Handling|Timeout, API down, network error|
|Emergency Exit|Exit saat market extreme|

## 3.4 Deliverables

### 3.4.1 Exchange Test Suite

**File baru:** `tests/exchange/e2eExchangeTestSuite.ts`

```typescript
interface ExchangeTestSuite {
  // Test API connectivity
  testApiConnectivity(): Promise<TestResult>;

  // Test authentication
  testAuthentication(): Promise<TestResult>;

  // Test balance query
  testBalanceQuery(): Promise<TestResult>;

  // Test order creation (small amount)
  testOrderCreation(): Promise<TestResult>;

  // Test order cancellation
  testOrderCancellation(): Promise<TestResult>;

  // Test orderbook query
  testOrderbookQuery(): Promise<TestResult>;

  // Test trade history query
  testTradeHistoryQuery(): Promise<TestResult>;

  // Test rate limiting handling
  testRateLimiting(): Promise<TestResult>;

  // Test timeout handling
  testTimeoutHandling(): Promise<TestResult>;

  // Test error recovery
  testErrorRecovery(): Promise<TestResult>;

  // Run all tests
  runAll(): Promise<OverallTestResult>;
}
```

### 3.4.2 Small Amount Live Test

**File baru:** `tests/exchange/smallAmountLiveTest.ts`

```
Tujuan: Test dengan uang SANGAT KECIL

Konfigurasi:
├─ Pair: pair dengan harga rendah (misal: token IDR < 100)
├─ Amount: minimal order (misal: 10,000 IDR worth)
├─ Mode: LIMIT order (tidak market untuk kontrol harga)
└─ Expected: Order masuk, bisa cancel, tidak ada slippage extreme

Test Cases:
1. Buy order creation
2. Order appears in orderbook
3. Order cancellation
4. Balance reconciliation
5. Trade history update
```

### 3.4.3 Emergency Exit Test

**File baru:** `tests/exchange/emergencyExitTest.ts`

```
Tujuan: Bukti bahwa emergency exit bekerja

Scenario:
1. Open position kecil
2. Simulate emergency condition (via test flag)
3. Verify bot exits position
4. Verify balance correct after exit

Success Criteria:
├─ Exit triggered dalam waktu < 30 detik
├─ Exit price dalam spread wajar
└─ Balance ter-reconcile dengan benar
```

### 3.4.4 Network Resilience Test

**File baru:** `tests/exchange/networkResilienceTest.ts`

```
Tujuan: Test handling network issues

Test Cases:
1. Simulate API timeout
   └─ Bot harus retry dengan backoff
   └─ Tidak crash
   └─ Log error dengan jelas

2. Simulate API rate limit
   └─ Bot harus backoff
   └─ Resume setelah rate limit selesai

3. Simulate network disconnect
   └─ Bot harus detect disconnect
   └─ Reconnect gracefully
   └─ Resume operation tanpa data loss

4. Simulate API maintenance
   └─ Bot harus detect maintenance
   └─ Pause operation
   └─ Resume setelah maintenance selesai
```

### 3.4.5 Reconciliation Test

**File baru:** `tests/exchange/reconciliationTest.ts`

```
Tujuan: Verifikasi data consistency

Test Cases:
1. Balance reconciliation
   ├─ Compare local balance vs exchange balance
   └─ Alert jika mismatch > threshold

2. Order reconciliation
   ├─ Compare local open orders vs exchange
   └─ Cleanup orphan orders

3. Position reconciliation
   ├─ Verify position matches trade history
   └─ Detect missing/duplicate trades

4. Trade history reconciliation
   ├─ Compare local trades vs exchange
   └─ Backfill jika ada gap
```

### 3.4.6 Production Readiness Checklist

**File baru:** `docs/production\_readiness\_checklist.md`

```markdown
# Production Readiness Checklist

## Pre-Deployment

### Configuration
- \[ ] All env vars set correctly
- \[ ] API keys valid and have correct permissions
- \[ ] Telegram bot token valid
- \[ ] Allowed user IDs configured

### Security
- \[ ] API secrets not in git
- \[ ] Callback server auth configured
- \[ ] TLS/SSL configured (if public endpoint)

### Monitoring
- \[ ] Logging configured
- \[ ] Error alerts set up
- \[ ] Health check endpoint accessible

### Risk Management
- \[ ] Max position size set conservatively
- \[ ] Max daily loss limit configured
- \[ ] Emergency exit tested

## Deployment

### Infrastructure
- \[ ] VPS has enough resources
- \[ ] Database persistence configured
- \[ ] Auto-restart on crash (systemd/supervisor)

### Network
- \[ ] Outbound connectivity verified
- \[ ] DNS resolution working
- \[ ] Firewall rules correct

### Validation
- \[ ] All E2E tests passed
- \[ ] Shadow mode run for 7+ days
- \[ ] Small amount test successful

## Post-Deployment

### Monitoring
- \[ ] First 24h monitored closely
- \[ ] Telegram alerts working
- \[ ] Balance reconciles correctly

### Documentation
- \[ ] Runbook created
- \[ ] Rollback procedure documented
- \[ ] Emergency contacts list ready
```

## 3.5 Acceptance Criteria

|Kriteria|Target|
|-|-|
|API Connectivity|100% success rate|
|Authentication|All API calls authenticated|
|Small Amount Test|5+ successful test trades|
|Order Creation|< 2 detik latency|
|Order Cancellation|< 2 detik latency|
|Emergency Exit|< 30 detik execution|
|Network Resilience|No crash on timeout/disconnect|
|Reconciliation|100% balance match|

## 3.6 Probe Tests

**File baru:** `tests/exchange/e2e\_exchange\_probe.ts`

```typescript
// Test cases:
1. API connectivity check passes
2. Authentication works
3. Balance query returns valid data
4. Order creation works
5. Order cancellation works
6. Rate limiting handled gracefully
7. Timeout handled gracefully
8. Network disconnect recovered
9. Balance reconciles after operations
10. Emergency exit executes correctly
```

## 3.7 Timeline

|Milestone|Estimasi|Deliverable|
|-|-|-|
|Exchange Test Suite|4 hari|Semua test cases ready|
|Small Amount Live Test|3 hari|Test trades berhasil|
|Emergency Exit Test|2 hari|Exit proven working|
|Network Resilience Test|3 hari|Error handling robust|
|Reconciliation Test|2 hari|Data consistency proven|
|Production Checklist|1 hari|Checklist lengkap|
|Probe Tests|2 hari|Semua probe pass|
|Documentation|2 hari|Runbook dan docs|
|**Total**|**19 hari**|FASE 3 selesai|

## 3.8 Output Fase 3

```
┌─────────────────────────────────────────────────────────────────────┐
│ OUTPUT FASE 3: PRODUCTION READINESS CERTIFICATE                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ ✅ EXCHANGE API VERIFIED                                             │
│    ├─ Authentication: PASSED                                         │
│    ├─ Rate Limiting: HANDLED                                         │
│    └─ Error Recovery: ROBUST                                         │
│                                                                      │
│ ✅ ORDER FLOW VERIFIED                                               │
│    ├─ Create Order: PASSED (avg 1.2s)                               │
│    ├─ Cancel Order: PASSED (avg 0.8s)                               │
│    └─ Partial Fill: HANDLED                                          │
│                                                                      │
│ ✅ EMERGENCY EXIT VERIFIED                                           │
│    ├─ Trigger Time: < 5s                                             │
│    ├─ Execution Time: < 20s                                          │
│    └─ Slippage: < 1%                                                 │
│                                                                      │
│ ✅ NETWORK RESILIENCE VERIFIED                                       │
│    ├─ Timeout Recovery: PASSED                                       │
│    ├─ Disconnect Recovery: PASSED                                    │
│    └─ Rate Limit Handling: PASSED                                    │
│                                                                      │
│ ✅ RECONCILIATION VERIFIED                                           │
│    ├─ Balance Match: 100%                                            │
│    ├─ Order Match: 100%                                              │
│    └─ Trade Match: 100%                                              │
│                                                                      │
│ 📋 STATUS: READY FOR LIVE TRADING                                   │
│    └─ Start with conservative settings                              │
│    └─ Monitor closely for first 7 days                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

\---

# ═══════════════════════════════════════════════════════════════════

# RINGKASAN TIMELINE

# ═══════════════════════════════════════════════════════════════════

## Timeline Keseluruhan

```
MINGGU 1-2:  FASE 1 - BACKTEST KUANTITATIF
             └─ 14 hari kerja
             └─ Output: Akurasi prediction terukur

MINGGU 3-5:  FASE 2 - SHADOW-LIVE KALIBRASI
             └─ 20 hari kerja (termasuk 7 hari live testing)
             └─ Output: Confidence terkalibrasi

MINGGU 6-8:  FASE 3 - END-TO-END EXCHANGE
             └─ 19 hari kerja
             └─ Output: Sistem terbukti di production

TOTAL:       \~53 hari kerja (\~8 minggu)
```

## Gantt Chart

```
        MINGGU 1  |  MINGGU 2  |  MINGGU 3  |  MINGGU 4  |  MINGGU 5  |  MINGGU 6  |  MINGGU 7  |  MINGGU 8
        ----------|------------|------------|------------|------------|------------|------------|------------
FASE 1  ████████████████████                                                
        Backtest                                                             

FASE 2            ████████████████████████████████████████                  
                  Shadow-Live Kalibrasi                                     

FASE 3                              ████████████████████████████████████████
                                    End-to-End Exchange                     
```

\---

# ═══════════════════════════════════════════════════════════════════

# FILE YANG PERLU DIBUAT

# ═══════════════════════════════════════════════════════════════════

## Fase 1: Backtest

|File|Tujuan|
|-|-|
|`src/domain/backtest/historicalDataCollector.ts`|Kumpulkan data historis|
|`src/domain/backtest/backtestEngine.ts`|Engine simulasi|
|`src/domain/backtest/metricsCalculator.ts`|Hitung metrik|
|`src/domain/backtest/reportGenerator.ts`|Generate laporan|
|`src/domain/backtest/types.ts`|Type definitions|
|`tests/backtest\_engine\_probe.ts`|Probe tests|
|`scripts/run-backtest.ts`|CLI runner|

## Fase 2: Shadow-Live

|File|Tujuan|
|-|-|
|`src/services/shadowModeRunner.ts`|Shadow mode orchestration|
|`src/services/predictionTracker.ts`|Track prediksi dan outcome|
|`src/domain/calibration/calibrationEngine.ts`|Kalibrasi otomatis|
|`src/services/shadowModeDashboard.ts`|Telegram dashboard|
|`src/storage/shadowModeStore.ts`|Persistence|
|`tests/shadow\_mode\_probe.ts`|Probe tests|

## Fase 3: End-to-End

|File|Tujuan|
|-|-|
|`tests/exchange/e2eExchangeTestSuite.ts`|Test suite lengkap|
|`tests/exchange/smallAmountLiveTest.ts`|Test dengan uang kecil|
|`tests/exchange/emergencyExitTest.ts`|Test emergency exit|
|`tests/exchange/networkResilienceTest.ts`|Test network issues|
|`tests/exchange/reconciliationTest.ts`|Test data consistency|
|`docs/production\_readiness\_checklist.md`|Deployment checklist|
|`docs/runbook.md`|Operational runbook|

\---

# ═══════════════════════════════════════════════════════════════════

# NPM SCRIPTS BARU

# ═══════════════════════════════════════════════════════════════════

```json
{
  "scripts": {
    "backtest": "tsx scripts/run-backtest.ts",
    "backtest:report": "tsx scripts/run-backtest.ts --report",
    
    "shadow:start": "tsx scripts/shadow-mode.ts --start",
    "shadow:stop": "tsx scripts/shadow-mode.ts --stop",
    "shadow:status": "tsx scripts/shadow-mode.ts --status",
    "shadow:report": "tsx scripts/shadow-mode.ts --report",
    
    "test:e2e": "tsx tests/exchange/e2eExchangeTestSuite.ts",
    "test:e2e:small": "tsx tests/exchange/smallAmountLiveTest.ts",
    "test:e2e:emergency": "tsx tests/exchange/emergencyExitTest.ts",
    "test:e2e:network": "tsx tests/exchange/networkResilienceTest.ts",
    "test:e2e:reconcile": "tsx tests/exchange/reconciliationTest.ts",
    
    "verify:full": "npm run verify \&\& npm run backtest \&\& npm run shadow:report"
  }
}
```

\---

# ═══════════════════════════════════════════════════════════════════

# ENV VARIABLES BARU

# ═══════════════════════════════════════════════════════════════════

```bash
# .env.example additions

# ========================================
# BACKTEST CONFIGURATION
# ========================================
BACKTEST\_START\_DATE=2025-01-01
BACKTEST\_END\_DATE=2025-12-31
BACKTEST\_PAIRS=btcidr,ethidr,usdtidr
BACKTEST\_INITIAL\_CAPITAL=10000000
BACKTEST\_OUTPUT\_DIR=./backtest\_results

# ========================================
# SHADOW MODE CONFIGURATION
# ========================================
SHADOW\_MODE\_ENABLED=false
SHADOW\_MODE\_PREDICTION\_INTERVAL\_MS=60000
SHADOW\_MODE\_MAX\_PENDING=100
SHADOW\_MODE\_LOG\_PREDICTIONS=true
SHADOW\_MODE\_CALIBRATION\_THRESHOLD=0.1

# ========================================
# E2E TEST CONFIGURATION
# ========================================
E2E\_TEST\_ENABLED=false
E2E\_TEST\_SMALL\_AMOUNT\_IDR=10000
E2E\_TEST\_PAIR\_FOR\_TEST=btcidr
E2E\_TEST\_DRY\_RUN=true
```

\---

# ═══════════════════════════════════════════════════════════════════

# RISIKO DAN MITIGASI

# ═══════════════════════════════════════════════════════════════════

## Risiko Fase 1: Backtest

|Risiko|Dampak|Mitigasi|
|-|-|-|
|Data historis tidak lengkap|Backtest tidak valid|Gunakan multiple sumber data|
|Look-ahead bias|Hasil backtest optimis|Strict point-in-time data|
|Overfitting|Parameter tidak generalisasi|Out-of-sample testing|

## Risiko Fase 2: Shadow-Live

|Risiko|Dampak|Mitigasi|
|-|-|-|
|API rate limit|Prediksi tertinggal|Implementasi proper rate limiting|
|Market condition berubah|Kalibrasi tidak valid|Re-calibration periodic|
|Bot crash|Data hilang|Persistence setiap prediksi|

## Risiko Fase 3: End-to-End

|Risiko|Dampak|Mitigasi|
|-|-|-|
|Test trade rugi|Kerugian finansial|Gunakan amount minimal|
|API key compromised|Keamanan terganggu|Gunakan API key terpisah untuk test|
|Production failure|Downtime|Rollback procedure siap|

\---





📊 Data Lifecycle \& Cleanup Policy

1\. Backtest Results (On-Demand)

Data Type

Retention

Cleanup Trigger

Hasil Backtest (JSON)	7-14 hari	Otomatis setelah periode berlalu

Log Detail per Run	24-48 jam	Otomatis setelah analisis selesai

Summary/Report (PDF)	Permanen	Tidak dihapus (arsip operator)

Aggregate Metrics	Permanen	Disimpan untuk baseline kalibrasi



Mekanisme:



text



Run Backtest → Hasil lengkap (JSON) → 48 jam → Cleanup otomatis

&#x20;                    ↓

&#x20;           Summary disimpan permanen (untuk baseline)

Kontrol: Operator bisa trigger cleanup manual kapan saja via command.



# ═══════════════════════════════════════════════════════════════════

# FINAL VERDICT

# ═══════════════════════════════════════════════════════════════════

Setelah menyelesaikan roadmap ini:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FINAL STATUS AFTER ROADMAP                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ✅ SOURCE CODE VERIFIED                                             │
│  ✅ BACKTEST QUANTITATIF COMPLETED                                   │
│  ✅ SHADOW-LIVE CALIBRATION COMPLETED                                │
│  ✅ END-TO-END EXCHANGE EVIDENCE COMPLETED                           │
│                                                                      │
│  STATUS: ✅ READY FOR LIVE TRADING                                  │
│                                                                      │
│  DENGAN CATATAN:                                                    │
│  ├─ Mulai dengan position size konservatif                          │
│  ├─ Monitor ketat selama 30 hari pertama                            │
│  ├─ Ready untuk rollback kapan saja                                 │
│  └─ Continuous calibration setiap bulan                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

\---

**Dokumen ini dibuat berdasarkan audit eksplisit repository cukong-markets pada 28 Maret 2026.**

