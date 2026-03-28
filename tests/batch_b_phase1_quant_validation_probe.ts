import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { env } from '../src/config/env';
import type { MarketSnapshot } from '../src/core/types';
import {
  BatchBPredictionPhase1Validator,
  buildBatchBPredictionPhase1Report,
} from '../src/domain/backtest/predictionValidationPhase1';
import { PersistenceService, createDefaultSettings } from '../src/services/persistenceService';
import { writeBatchBPhase1Artifacts } from '../src/services/predictionValidationReportService';

function buildSnapshot(pair: string, timestamp: number, price: number): MarketSnapshot {
  return {
    pair,
    pairClass: pair === 'btc_idr' ? 'MAJOR' : 'MID',
    discoveryBucket: 'ROTATION',
    ticker: {
      pair,
      lastPrice: price,
      bid: price * 0.999,
      ask: price * 1.001,
      high24h: price * 1.05,
      low24h: price * 0.95,
      volume24hBase: 1200,
      volume24hQuote: 1_800_000_000,
      change24hPct: 1.2,
      timestamp,
    },
    orderbook: {
      pair,
      bids: [{ price: price * 0.999, volume: 100 }],
      asks: [{ price: price * 1.001, volume: 90 }],
      bestBid: price * 0.999,
      bestAsk: price * 1.001,
      spread: price * 0.002,
      spreadPct: 0.2,
      midPrice: price,
      timestamp,
    },
    recentTrades: [
      {
        pair,
        price,
        quantity: 10,
        side: 'buy',
        timestamp,
        source: 'EXCHANGE_TRADE_FEED',
        quality: 'TAPE',
      },
    ],
    recentTradesSource: 'EXCHANGE_TRADE_FEED',
    timestamp,
  };
}

async function main() {
  const persistence = new PersistenceService();
  const start = Date.now() - 1000 * 60 * 300;

  for (let i = 0; i < 80; i += 1) {
    const ts = start + i * 60_000 * 5;
    const btcPrice = 1_000_000_000 + i * 2_000_000;
    const ethPrice = 55_000_000 + i * (i % 3 === 0 ? -120_000 : 140_000);

    await persistence.appendPairHistory({
      type: 'snapshot',
      pair: 'btc_idr',
      snapshot: buildSnapshot('btc_idr', ts, btcPrice),
      recordedAt: new Date(ts).toISOString(),
    });

    await persistence.appendPairHistory({
      type: 'snapshot',
      pair: 'eth_idr',
      snapshot: buildSnapshot('eth_idr', ts, Math.max(5_000_000, ethPrice)),
      recordedAt: new Date(ts).toISOString(),
    });
  }

  const validator = new BatchBPredictionPhase1Validator(persistence);
  const result = await validator.run({ maxEvents: 160 }, createDefaultSettings());
  const report = buildBatchBPredictionPhase1Report(result);
  const outputDir = `${env.tempDir}/phase1-artifacts-probe`;
  const artifacts = await writeBatchBPhase1Artifacts({ result, report, outputDir });

  assert.ok(result.metrics.totalPredictionCount > 0, 'runner harus menghasilkan prediction rows');
  assert.ok(result.metrics.resolvedPredictionCount > 0, 'runner harus resolve outcome historis');
  assert.ok(
    result.metrics.conservativeThresholdRecommendation.resolvedSampleCount >= 0,
    'threshold recommendation harus dihasilkan dari hasil run nyata',
  );

  await access(artifacts.jsonPath);
  await access(artifacts.markdownPath);
  await access(artifacts.pdfPath);

  const jsonRaw = await readFile(artifacts.jsonPath, 'utf8');
  const json = JSON.parse(jsonRaw) as { report: { runId: string; conservativeThresholdRecommendation: { confidenceThreshold: number } } };
  assert.equal(json.report.runId, result.runId, 'report contract json harus sinkron dengan run result');
  assert.ok(
    typeof json.report.conservativeThresholdRecommendation.confidenceThreshold === 'number',
    'report contract wajib membawa threshold recommendation numeric',
  );

  const markdown = await readFile(artifacts.markdownPath, 'utf8');
  assert.match(markdown, /Conservative Threshold Recommendation/, 'markdown wajib memiliki section threshold recommendation');

  const pdf = await readFile(artifacts.pdfPath);
  assert.ok(pdf.byteLength > 200, 'pdf artifact wajib terbentuk dan tidak kosong');

  console.log('batch_b_phase1_quant_validation_probe: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
