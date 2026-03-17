import { parentPort } from 'node:worker_threads';
import { FeaturePipeline } from '../domain/intelligence/featurePipeline';
import type { MarketSnapshot, SignalCandidate } from '../core/types';

const pipeline = new FeaturePipeline();

parentPort?.on(
  'message',
  (message: {
    id: string;
    payload: {
      snapshot: MarketSnapshot;
      signal: SignalCandidate;
      recentSnapshots: MarketSnapshot[];
    };
  }) => {
    try {
      const result = pipeline.build(
        message.payload.snapshot,
        message.payload.signal,
        message.payload.recentSnapshots,
      );
      parentPort?.postMessage({ id: message.id, result });
    } catch (error) {
      parentPort?.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);