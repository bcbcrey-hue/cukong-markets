import type {
  FutureTrendingPrediction,
  HistoricalContext,
  MicrostructureFeatures,
  SignalCandidate,
} from '../../core/types';
import { clamp } from '../../utils/math';

function buildCalibrationTag(historicalContext: HistoricalContext, microstructure: MicrostructureFeatures): FutureTrendingPrediction['calibrationTag'] {
  const outcomeGrounding = historicalContext.outcomeGrounding ?? 'PROXY_FALLBACK';

  if (outcomeGrounding === 'OUTCOME_GROUNDED' && microstructure.tradeFlowQuality === 'TAPE') {
    return 'OUTCOME_AND_TRADE_TRUTH';
  }

  if (outcomeGrounding === 'OUTCOME_GROUNDED') {
    return 'OUTCOME_GROUNDED_WITH_FLOW_CAVEAT';
  }

  if (microstructure.tradeFlowQuality === 'TAPE') {
    return 'TRADE_TRUTH_WITH_PROXY_OUTCOME';
  }

  return 'PROXY_FALLBACK';
}

function resolveStrength(confidence: number): FutureTrendingPrediction['strength'] {
  if (confidence >= 0.78) {
    return 'STRONG';
  }

  if (confidence >= 0.58) {
    return 'MODERATE';
  }

  return 'WEAK';
}

export class FutureTrendingPredictionEngine {
  predict(input: {
    signal: SignalCandidate;
    microstructure: MicrostructureFeatures;
    historicalContext: HistoricalContext;
  }): FutureTrendingPrediction {
    const { signal, microstructure, historicalContext } = input;

    const trendRaw =
      signal.breakoutPressure * 0.26 +
      signal.quoteFlowAccelerationScore * 0.22 +
      microstructure.clusterScore * 0.15 +
      microstructure.accumulationScore * 0.14 +
      historicalContext.recentWinRate * 100 * 0.13 -
      historicalContext.recentFalseBreakRate * 100 * 0.16 -
      microstructure.spoofRiskScore * 0.2 -
      microstructure.exhaustionRiskScore * 0.11;

    const expectedMovePct = clamp((trendRaw - 35) / 18, -3.5, 4.5);
    const direction = expectedMovePct >= 0.45 ? 'UP' : expectedMovePct <= -0.45 ? 'DOWN' : 'SIDEWAYS';

    const confidencePenalty =
      historicalContext.outcomeGrounding === 'OUTCOME_GROUNDED'
        ? 0
        : historicalContext.outcomeGrounding === 'MIXED'
          ? 0.06
          : 0.1;

    const flowPenalty =
      microstructure.tradeFlowSource === 'EXCHANGE_TRADE_FEED'
        ? 0
        : microstructure.tradeFlowSource === 'MIXED'
          ? 0.05
          : 0.09;

    const baseConfidence = clamp(
      signal.confidence * 0.42 +
        (microstructure.liquidityQualityScore / 100) * 0.14 +
        clamp(Math.abs(expectedMovePct) / 4.5, 0, 1) * 0.16 +
        historicalContext.recentWinRate * 0.14 +
        (1 - historicalContext.recentFalseBreakRate) * 0.14,
      0,
      1,
    );

    const confidence = clamp(baseConfidence - confidencePenalty - flowPenalty, 0, 1);
    const strength = resolveStrength(confidence);
    const calibrationTag = buildCalibrationTag(historicalContext, microstructure);

    const reasons = [
      `trendRaw=${trendRaw.toFixed(2)} from breakout/flow/cluster/accumulation minus trap factors`,
      `expectedMovePct=${expectedMovePct.toFixed(2)} within horizon 5m-15m`,
      `context winRate=${(historicalContext.recentWinRate * 100).toFixed(1)}% falseBreak=${(historicalContext.recentFalseBreakRate * 100).toFixed(1)}%`,
    ];

    const caveats: string[] = [];
    if (historicalContext.outcomeGrounding !== 'OUTCOME_GROUNDED') {
      caveats.push('historical outcome belum full grounded, confidence diturunkan konservatif');
    }
    if (microstructure.tradeFlowQuality !== 'TAPE') {
      caveats.push('trade flow masih non-tape/proxy, prediction diperlakukan hati-hati');
    }
    if (historicalContext.snapshotCount < 5) {
      caveats.push('sample snapshot dangkal, stabilitas prediction terbatas');
    }

    return {
      target: 'TREND_DIRECTIONAL_MOVE',
      horizonLabel: 'H5_15M',
      horizonMinutes: 15,
      direction,
      expectedMovePct,
      confidence,
      strength,
      calibrationTag,
      reasons,
      caveats,
      tradeFlowSource: microstructure.tradeFlowSource,
      tradeFlowQuality: microstructure.tradeFlowQuality,
      generatedAt: Date.now(),
    };
  }
}
