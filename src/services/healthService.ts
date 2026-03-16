import type {
  HealthSnapshot,
  OrderRecord,
  PositionRecord,
  RuntimeStatus,
  WorkerHealth,
} from '../core/types';
import { PersistenceService, createDefaultHealth } from './persistenceService';
import { StateService } from './stateService';

export interface BuildHealthParams {
  scannerRunning: boolean;
  telegramRunning: boolean;
  tradingEnabled: boolean;
  positions: PositionRecord[];
  orders: OrderRecord[];
  workers?: WorkerHealth[];
  notes?: string[];
}

export class HealthService {
  private health: HealthSnapshot = createDefaultHealth();

  constructor(
    private readonly persistence: PersistenceService,
    private readonly state: StateService,
  ) {}

  async load(): Promise<HealthSnapshot> {
    this.health = await this.persistence.readHealth();
    return this.health;
  }

  get(): HealthSnapshot {
    return this.health;
  }

  async replace(next: HealthSnapshot): Promise<HealthSnapshot> {
    this.health = {
      ...next,
      updatedAt: new Date().toISOString(),
    };
    await this.persistence.saveHealth(this.health);
    return this.health;
  }

  async build(params: BuildHealthParams): Promise<HealthSnapshot> {
    const runtime = this.state.get();
    const runtimeStatus: RuntimeStatus = runtime.status;

    const openPositions = params.positions.filter(
      (position) => position.status === 'OPEN' || position.status === 'PARTIALLY_CLOSED',
    ).length;

    const pendingOrders = params.orders.filter(
      (order) =>
        order.status === 'NEW' ||
        order.status === 'OPEN' ||
        order.status === 'PARTIALLY_FILLED',
    ).length;

    const notes = [
      ...(params.notes ?? []),
      `openPositions=${openPositions}`,
      `pendingOrders=${pendingOrders}`,
    ];

    const status: HealthSnapshot['status'] =
      runtimeStatus === 'ERROR'
        ? 'down'
        : params.scannerRunning && params.telegramRunning
          ? 'healthy'
          : 'degraded';

    const next: HealthSnapshot = {
      status,
      updatedAt: new Date().toISOString(),
      runtimeStatus,
      scannerRunning: params.scannerRunning,
      telegramRunning: params.telegramRunning,
      tradingEnabled: params.tradingEnabled,
      activePairsTracked: Object.keys(runtime.pairs).length,
      workers: params.workers ?? [],
      notes,
    };

    return this.replace(next);
  }
}
