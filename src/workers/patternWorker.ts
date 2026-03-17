import { parentPort } from 'node:worker_threads';
import { PatternMatcher } from '../domain/history/patternMatcher';
import type {
  MarketRegime,
  MicrostructureFeatures,
  ProbabilityAssessment,
  SignalCandidate,
} from '../core/types';

const matcher = new PatternMatcher();

parentPort?.on(
  'message',
  (message: {
    id: string;
    payload: {
      pair: string;
      signal: SignalCandidate;
      microstructure: MicrostructureFeatures;
      probability: ProbabilityAssessment;
      regime: MarketRegime;
    };
  }) => {
    try {
      const result = matcher.match(message.payload);
      parentPort?.postMessage({ id: message.id, result });
    } catch (error) {
      parentPort?.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);