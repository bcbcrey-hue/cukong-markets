import type {
  ExecutionMode,
  HealthSnapshot,
  OrderRecord,
  PositionRecord,
  RuntimeStatus,
  WorkerHealth,
} from '../core/types';
import { PersistenceService, createDefaultHealth } from './persistenceService';
import { StateService } from './stateService';
import { env } from '../config/env';

export interface BuildHealthParams {
  scannerRunning: boolean;
  telegramConfigured: boolean;
  telegramRunning: boolean;
  callbackServerRunning: boolean;
  tradingEnabled: boolean;
  executionMode: ExecutionMode;
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
    const loaded = await this.persistence.readHealth();
    this.health = {
      ...loaded,
      telegramConfigured:
        typeof loaded.telegramConfigured === 'boolean'
          ? loaded.telegramConfigured
          : Boolean(env.telegramToken),
    };
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

    const callbackRequired = env.indodaxEnableCallbackServer;
    const callbackReady = !callbackRequired || params.callbackServerRunning;
    const status = this.statusFromRuntime(
      runtimeStatus,
      params.scannerRunning,
      params.telegramConfigured,
      params.telegramRunning,
      callbackReady,
    );

    const next: HealthSnapshot = {
      status,
      updatedAt: new Date().toISOString(),
      runtimeStatus,
      scannerRunning: params.scannerRunning,
      telegramConfigured: params.telegramConfigured,
      telegramRunning: params.telegramRunning,
      callbackServerRunning: params.callbackServerRunning,
      tradingEnabled: params.tradingEnabled,
      executionMode: params.executionMode,
      activePairsTracked: Object.keys(runtime.pairs).length,
      workers: params.workers ?? [],
      notes,
    };

    return this.replace(next);
  }

  isLive(snapshot: HealthSnapshot = this.health): boolean {
    return snapshot.runtimeStatus !== 'ERROR' && snapshot.runtimeStatus !== 'STOPPED';
  }

  isReady(snapshot: HealthSnapshot = this.health): boolean {
    return snapshot.status === 'healthy';
  }

  private statusFromRuntime(
    runtimeStatus: RuntimeStatus,
    scannerRunning: boolean,
    telegramConfigured: boolean,
    telegramRunning: boolean,
    callbackReady: boolean,
  ): HealthSnapshot['status'] {
    if (runtimeStatus === 'ERROR' || runtimeStatus === 'STOPPED') {
      return 'down';
    }

    if (runtimeStatus === 'RUNNING') {
      const telegramReady = !telegramConfigured || telegramRunning;
      return scannerRunning && telegramReady && callbackReady ? 'healthy' : 'degraded';
    }

    return 'degraded';
  }
}
