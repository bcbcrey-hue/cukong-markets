import type { RuntimeState, TradingMode } from '../core/types';
import { nowIso } from '../utils/time';
import { PersistenceService } from './persistenceService';

export class StateService {
  private state: RuntimeState = {
    started: false,
    startedAt: null,
    updatedAt: nowIso(),
    uptimeMs: 0,
    lastSignalAt: null,
    lastTradeAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    marketWatcherRunning: false,
    tradingMode: 'OFF',
    pairCooldowns: {},
    cacheStats: { hit: 0, miss: 0 },
    pollingStats: { activeJobs: 0, tickCount: 0, lastTickAt: null },
  };

  constructor(private readonly persistence: PersistenceService) {}

  async load(): Promise<RuntimeState> {
    const snapshot = await this.persistence.loadAll();
    this.state = snapshot.state;
    return this.state;
  }

  get(): RuntimeState {
    return this.state;
  }

  async replace(nextState: RuntimeState): Promise<void> {
    this.state = { ...nextState, updatedAt: nowIso() };
    await this.persistence.saveState(this.state);
  }

  async patch(partial: Partial<RuntimeState>): Promise<RuntimeState> {
    this.state = { ...this.state, ...partial, updatedAt: nowIso() };
    await this.persistence.saveState(this.state);
    return this.state;
  }

  async setStarted(started: boolean): Promise<void> {
    await this.patch({
      started,
      startedAt: started ? this.state.startedAt ?? nowIso() : this.state.startedAt,
      marketWatcherRunning: started,
    });
  }

  async setTradingMode(mode: TradingMode): Promise<void> {
    await this.patch({ tradingMode: mode });
  }

  async markSignal(): Promise<void> {
    await this.patch({ lastSignalAt: nowIso() });
  }

  async markTrade(): Promise<void> {
    await this.patch({ lastTradeAt: nowIso() });
  }

  async markError(message: string): Promise<void> {
    await this.patch({ lastErrorAt: nowIso(), lastErrorMessage: message });
  }

  async setCooldown(pair: string, untilIso: string): Promise<void> {
    await this.patch({ pairCooldowns: { ...this.state.pairCooldowns, \[pair]: untilIso } });
  }
}
