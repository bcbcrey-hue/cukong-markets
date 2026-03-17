import type { BacktestRunConfig, MarketSnapshot } from '../../core/types';
import { PersistenceService } from '../../services/persistenceService';

export class ReplayLoader {
  constructor(private readonly persistence: PersistenceService) {}

  async loadSnapshots(config: BacktestRunConfig): Promise<MarketSnapshot[]> {
    const events = await this.persistence.readPairHistory();

    return events
      .filter((entry): entry is { type: string; snapshot: MarketSnapshot } => {
        return entry.type === 'snapshot' && typeof entry.snapshot === 'object' && entry.snapshot !== null;
      })
      .map((entry) => entry.snapshot)
      .filter((snapshot) => {
        if (config.pair && snapshot.pair !== config.pair) {
          return false;
        }

        if (typeof config.startTime === 'number' && snapshot.timestamp < config.startTime) {
          return false;
        }

        if (typeof config.endTime === 'number' && snapshot.timestamp > config.endTime) {
          return false;
        }

        return true;
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, config.maxEvents ?? Number.MAX_SAFE_INTEGER);
  }
}