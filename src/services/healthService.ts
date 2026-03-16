import type { HealthSnapshot, RuntimeOrder, RuntimePosition, SignalCandidate } from '../core/types';
import { StateService } from './stateService';

export class HealthService {
  constructor(private readonly state: StateService) {}

  snapshot(params: { positions: RuntimePosition\[]; orders: RuntimeOrder\[]; hotlist: SignalCandidate\[] }): HealthSnapshot {
    const current = this.state.get();
    return {
      uptimeMs: current.uptimeMs,
      started: current.started,
      mode: current.tradingMode,
      positionsOpen: params.positions.filter((item) => item.status === 'open').length,
      pendingOrders: params.orders.filter((item) => item.status === 'pending' || item.status === 'open').length,
      hotlistCount: params.hotlist.length,
      lastSignalAt: current.lastSignalAt,
      lastTradeAt: current.lastTradeAt,
      lastErrorAt: current.lastErrorAt,
      lastErrorMessage: current.lastErrorMessage,
      activeJobs: current.pollingStats.activeJobs,
      tickCount: current.pollingStats.tickCount,
    };
  }
}
