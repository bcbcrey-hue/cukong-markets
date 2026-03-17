import type { MarketRegime } from '../../core/types';

export interface PatternTemplate {
  id: string;
  name: string;
  regime: MarketRegime;
  minScore: number;
  minAccumulation: number;
  maxSpoofRisk: number;
  minCluster: number;
  minPumpProbability: number;
  maxTrapProbability: number;
}

export const PATTERN_LIBRARY: PatternTemplate[] = [
  {
    id: 'pre_pump_accumulation',
    name: 'Pre-pump accumulation',
    regime: 'ACCUMULATION',
    minScore: 62,
    minAccumulation: 55,
    maxSpoofRisk: 38,
    minCluster: 26,
    minPumpProbability: 0.62,
    maxTrapProbability: 0.35,
  },
  {
    id: 'squeeze_continuation',
    name: 'Squeeze continuation',
    regime: 'BREAKOUT_SETUP',
    minScore: 70,
    minAccumulation: 35,
    maxSpoofRisk: 42,
    minCluster: 38,
    minPumpProbability: 0.68,
    maxTrapProbability: 0.32,
  },
  {
    id: 'fake_breakout_trap',
    name: 'Fake breakout trap',
    regime: 'TRAP_RISK',
    minScore: 45,
    minAccumulation: 0,
    maxSpoofRisk: 100,
    minCluster: 12,
    minPumpProbability: 0,
    maxTrapProbability: 0.85,
  },
  {
    id: 'distribution_trap',
    name: 'Distribution trap',
    regime: 'DISTRIBUTION',
    minScore: 35,
    minAccumulation: 0,
    maxSpoofRisk: 100,
    minCluster: 10,
    minPumpProbability: 0,
    maxTrapProbability: 0.9,
  },
];