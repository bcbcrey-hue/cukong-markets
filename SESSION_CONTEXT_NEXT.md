# SESSION CONTEXT NEXT

Project: mafiamarkets
Repository: https://github.com/masreykangtrade-oss/mafiamarkets

Gunakan file ini sebagai konteks utama sebelum melanjutkan refactor pada sesi berikutnya.

## Rule kerja yang tetap berlaku

- Jangan mengulang refactor yang sudah tercatat di REFACTOR_LOG.md
- Ikuti blueprint project
- Fokus hanya pada batch lanjutan berikutnya
- Semua hasil refactor yang sudah dibuat harus dianggap saling terhubung
- Jangan memecah jalur runtime yang sudah dibangun:
  app/bootstrap -> market -> signal -> trading

## Keputusan arsitektur yang wajib dipertahankan

- Telegram button UI tetap menjadi UI utama
- whitelist TELEGRAM_ALLOWED_USER_IDS tetap dipakai
- legacy upload account JSON tetap didukung
- runtime accounts tetap di data/accounts/accounts.json
- src/app.ts tetap menjadi wiring utama
- execution shell tetap mengikuti arsitektur runtime yang sudah dibangun

## Progress yang sudah selesai pada sesi ini

### Batch 1E selesai
Cakupan:
- reportService
- accountValidator
- accountStore
- accountRegistry
- app.ts
- bootstrap.ts

Hasil:
- contract env/path disejajarkan ke pola camelCase aktif
- account runtime storage disejajarkan
- validator accounts diperketat
- registry accounts dijadikan façade runtime
- report service distabilkan
- app.ts dijadikan wiring utama
- bootstrap.ts diperingkas untuk startup runtime

### Batch 2A selesai
Cakupan:
- integrations/indodax/publicApi.ts
- integrations/indodax/privateApi.ts
- integrations/indodax/client.ts
- domain/market/pairUniverse.ts
- domain/market/marketWatcher.ts
- domain/market/hotlistService.ts

Hasil:
- baseline scanner Indodax sudah dibuat
- ticker + depth sudah bisa dibangun jadi market snapshot
- pair ranking/hotlist baseline sudah tersedia
- app runtime sudah punya jalur ke market layer

### Batch 2B selesai
Cakupan:
- domain/market/tickerSnapshot.ts
- domain/market/orderbookSnapshot.ts
- domain/market/pairClassifier.ts
- domain/signals/strategies/volumeSpike.ts
- domain/signals/strategies/orderbookImbalance.ts
- domain/signals/strategies/silentAccumulation.ts
- domain/signals/strategies/breakoutRetest.ts
- domain/signals/strategies/hotRotation.ts
- domain/signals/scoreCalculator.ts
- domain/signals/signalEngine.ts

Hasil:
- ticker features dan orderbook features sudah dibangun
- pair classification/tier/regime hint sudah ada
- strategy scoring baseline sudah dipecah
- scoreCalculator sudah menghasilkan score/confidence/reasons/warnings/contributions
- signalEngine sudah disejajarkan ke SignalCandidate aktif

### Batch 2C selesai
Cakupan:
- domain/trading/orderManager.ts
- domain/trading/positionManager.ts
- domain/trading/riskEngine.ts
- domain/trading/executionEngine.ts

Hasil:
- order layer sudah pindah ke OrderRecord aktif
- position layer sudah pindah ke PositionRecord aktif
- risk layer sudah memakai SignalCandidate + BotSettings aktif
- execution layer sudah tersambung ke account/settings/state/risk/indodax/order/position/journal
- baseline auto/manual execution sudah tersedia
- emergency cancel / sell-all helpers sudah tersedia

## Jalur runtime hasil sesi ini

App wiring yang harus dianggap berlaku:
- bootstrap menyiapkan runtime directories
- app membuat persistence/state/settings/journal/accounts/order/position/health/report
- app membuat Indodax market baseline
- app membangun signal pipeline
- app membangun trading pipeline
- polling runtime mengalir dari market scan -> signal -> hotlist -> execution monitor -> health heartbeat

## Mismatch penting yang sudah ditutup

- env lama uppercase vs env camelCase aktif
- account store lama vs runtime account file aktif
- signal output lama vs SignalCandidate aktif
- trading runtime lama vs OrderRecord/PositionRecord/BotSettings aktif

## Batasan yang masih tersisa

- SignalCandidate aktif belum membawa execution-ready entry price eksplisit
- executionEngine masih memakai inferEntryPrice() sebagai bridge sementara
- layer intelligence belum dibuat
- layer microstructure belum dibuat
- layer history belum dibuat
- workers belum dibuat
- backtest belum dibuat

## Target refactor berikutnya

### Prioritas berikutnya: Batch 3A
Fokus:
- src/domain/intelligence/*
- src/domain/microstructure/*
- src/domain/history/*

Tujuan:
- menambahkan validasi lanjutan terhadap signal
- mendeteksi trap/spoof/fake breakout/flow quality
- menambahkan reasoning yang lebih dalam sebelum execution
- mengurangi gap antara signal baseline dan execution decision

### Setelah itu: Batch 3B
Fokus:
- src/workers/*
- src/domain/backtest/*

Tujuan:
- memindahkan loop berat ke worker bila perlu
- menambahkan jalur evaluasi/backtest
- menyiapkan sistem untuk validasi strategi lebih kuat

## Instruksi untuk sesi berikutnya

- Mulai langsung dari Batch 3A
- Jangan ulang Batch 1E, 2A, 2B, 2C
- Semua patch baru harus menjaga kompatibilitas dengan hasil sesi ini
- Jika ada mismatch type/contract, prioritaskan jalur runtime yang sudah dibentuk pada sesi ini sebagai baseline utama
