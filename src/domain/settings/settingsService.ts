import type {
  BacktestSettings,
  BotSettings,
  RiskSettings,
  ScannerSettings,
  StrategySettings,
  TradingMode,
  WorkerSettings,
} from '../../core/types';
import {
  PersistenceService,
  createDefaultSettings,
} from '../../services/persistenceService';

export class SettingsService {
  private settings: BotSettings = createDefaultSettings();

  constructor(private readonly persistence: PersistenceService) {}

  async load(): Promise<BotSettings> {
    this.settings = await this.persistence.readSettings();
    return this.settings;
  }

  get(): BotSettings {
    return this.settings;
  }

  async replace(next: BotSettings): Promise<BotSettings> {
    this.settings = {
      ...next,
      updatedAt: new Date().toISOString(),
    };
    await this.persistence.saveSettings(this.settings);
    return this.settings;
  }

  async patch(partial: Partial<BotSettings>): Promise<BotSettings> {
    return this.replace({
      ...this.settings,
      ...partial,
      updatedAt: new Date().toISOString(),
    });
  }

  async setTradingMode(mode: TradingMode): Promise<BotSettings> {
    return this.patch({
      tradingMode: mode,
    });
  }

  async patchRisk(partial: Partial<RiskSettings>): Promise<BotSettings> {
    return this.patch({
      risk: {
        ...this.settings.risk,
        ...partial,
      },
    });
  }

  async patchStrategy(
    partial: Partial<StrategySettings>,
  ): Promise<BotSettings> {
    return this.patch({
      strategy: {
        ...this.settings.strategy,
        ...partial,
      },
    });
  }

  async patchScanner(
    partial: Partial<ScannerSettings>,
  ): Promise<BotSettings> {
    return this.patch({
      scanner: {
        ...this.settings.scanner,
        ...partial,
      },
    });
  }

  async patchWorkers(
    partial: Partial<WorkerSettings>,
  ): Promise<BotSettings> {
    return this.patch({
      workers: {
        ...this.settings.workers,
        ...partial,
      },
    });
  }

  async patchBacktest(
    partial: Partial<BacktestSettings>,
  ): Promise<BotSettings> {
    return this.patch({
      backtest: {
        ...this.settings.backtest,
        ...partial,
      },
    });
  }

  async setUiOnly(uiOnly: boolean): Promise<BotSettings> {
    return this.patch({ uiOnly });
  }

  async setDryRun(dryRun: boolean): Promise<BotSettings> {
    return this.patch({ dryRun });
  }

  async setPaperTrade(paperTrade: boolean): Promise<BotSettings> {
    return this.patch({ paperTrade });
  }
}
