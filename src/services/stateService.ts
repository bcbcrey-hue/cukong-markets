import type {
  HotlistEntry,
  MarketOverview,
  OpportunityAssessment,
  PairRuntimeState,
  RuntimeState,
  RuntimeStatus,
  SignalCandidate,
  TradingMode,
} from '../core/types';
import { PersistenceService, createDefaultRuntimeState } from './persistenceService';

export class StateService {
  private state: RuntimeState = createDefaultRuntimeState();

  constructor(private readonly persistence: PersistenceService) {}

  async load(): Promise<RuntimeState> {
    const loaded = await this.persistence.readState();
    const fallback = createDefaultRuntimeState();
    this.state = {
      ...fallback,
      ...loaded,
      pollingStats: {
        ...fallback.pollingStats,
        ...loaded.pollingStats,
      },
    };
    return this.state;
  }

  get(): RuntimeState {
    return this.state;
  }

  async replace(next: RuntimeState): Promise<RuntimeState> {
    const candidate: RuntimeState = {
      ...next,
      lastUpdatedAt: new Date().toISOString(),
    };
    await this.persistence.saveState(candidate);
    this.state = candidate;
    return this.state;
  }

  async patch(partial: Partial<RuntimeState>): Promise<RuntimeState> {
    const candidate: RuntimeState = {
      ...this.state,
      ...partial,
      lastUpdatedAt: new Date().toISOString(),
    };
    await this.persistence.saveState(candidate);
    this.state = candidate;
    return this.state;
  }

  async setStatus(status: RuntimeStatus): Promise<RuntimeState> {
    const now = new Date().toISOString();

    return this.patch({
      status,
      startedAt:
        status === 'STARTING' || status === 'RUNNING'
          ? this.state.startedAt ?? now
          : this.state.startedAt,
      stoppedAt:
        status === 'STOPPING' || status === 'STOPPED'
          ? now
          : this.state.stoppedAt,
    });
  }

  async setTradingMode(mode: TradingMode): Promise<RuntimeState> {
    return this.patch({
      activeTradingMode: mode,
    });
  }

  async setEmergencyStop(enabled: boolean): Promise<RuntimeState> {
    return this.patch({
      emergencyStop: enabled,
    });
  }

  async setPairCooldown(pair: string, untilMs: number): Promise<RuntimeState> {
    return this.patch({
      pairCooldowns: {
        ...this.state.pairCooldowns,
        [pair]: untilMs,
      },
    });
  }

  async clearPairCooldown(pair: string): Promise<RuntimeState> {
    const next = { ...this.state.pairCooldowns };
    delete next[pair];

    return this.patch({
      pairCooldowns: next,
    });
  }

  async upsertPairState(
    pair: string,
    partial: Partial<PairRuntimeState>,
  ): Promise<RuntimeState> {
    const current: PairRuntimeState =
      this.state.pairs[pair] ?? {
        pair,
        lastSeenAt: Date.now(),
        lastSignalAt: null,
        cooldownUntil: null,
        lastOpportunity: null,
      };

    return this.patch({
      pairs: {
        ...this.state.pairs,
        [pair]: {
          ...current,
          ...partial,
          pair,
        },
      },
    });
  }

  async markPairSeen(pair: string): Promise<RuntimeState> {
    return this.upsertPairState(pair, {
      lastSeenAt: Date.now(),
    });
  }

  async markSignal(pair: string): Promise<RuntimeState> {
    const now = Date.now();
    const current = this.state.pairs[pair];

    return this.patch({
      pairs: {
        ...this.state.pairs,
        [pair]: {
          pair,
          lastSeenAt: current?.lastSeenAt ?? now,
          lastSignalAt: now,
          cooldownUntil: current?.cooldownUntil ?? null,
          lastOpportunity: current?.lastOpportunity ?? null,
        },
      },
    });
  }

  async setSignals(signals: SignalCandidate[]): Promise<RuntimeState> {
    return this.patch({
      lastSignals: signals,
    });
  }

  async setMarketOverview(overview: MarketOverview): Promise<RuntimeState> {
    return this.patch({
      lastMarketOverview: overview,
    });
  }

  async setPumpCandidates(candidates: SignalCandidate[]): Promise<RuntimeState> {
    return this.patch({
      lastPumpCandidates: candidates,
    });
  }

  async setHotlist(hotlist: HotlistEntry[]): Promise<RuntimeState> {
    return this.patch({
      lastHotlist: hotlist,
    });
  }

  async setOpportunities(
    opportunities: OpportunityAssessment[],
  ): Promise<RuntimeState> {
    const nextPairs = { ...this.state.pairs };

    for (const item of opportunities) {
      const current = nextPairs[item.pair];
      nextPairs[item.pair] = {
        pair: item.pair,
        lastSeenAt: current?.lastSeenAt ?? item.timestamp,
        lastSignalAt: current?.lastSignalAt ?? item.timestamp,
        cooldownUntil: current?.cooldownUntil ?? null,
        lastOpportunity: item,
      };
    }

    return this.patch({
      lastOpportunities: opportunities,
      pairs: nextPairs,
    });
  }

  async markTrade(): Promise<RuntimeState> {
    return this.patch({
      tradeCount: this.state.tradeCount + 1,
      lastTradeAt: new Date().toISOString(),
    });
  }
}
