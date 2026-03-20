import type {
  BacktestSettings,
  BotSettings,
  ExecutionMode,
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

const LEGACY_DEFAULT_BUY_SLIPPAGE_BPS = 25;
const LEGACY_MAX_BUY_SLIPPAGE_BPS = 80;

export class SettingsService {
  private settings: BotSettings = createDefaultSettings();

  constructor(private readonly persistence: PersistenceService) {}

  private normalize(input: BotSettings): BotSettings {
    const defaults = createDefaultSettings();

    const next: BotSettings = {
      ...defaults,
      ...input,
      risk: {
        ...defaults.risk,
        ...input.risk,
      },
      strategy: {
        ...defaults.strategy,
        ...input.strategy,
      },
      scanner: {
        ...defaults.scanner,
        ...input.scanner,
      },
      workers: {
        ...defaults.workers,
        ...input.workers,
      },
      backtest: {
        ...defaults.backtest,
        ...input.backtest,
      },
    };

    next.strategy.maxBuySlippageBps = defaults.strategy.maxBuySlippageBps;

    if (
      input.strategy?.buySlippageBps === undefined ||
      input.strategy.buySlippageBps === LEGACY_DEFAULT_BUY_SLIPPAGE_BPS
    ) {
      next.strategy.buySlippageBps = defaults.strategy.buySlippageBps;
    }

    if (
      input.strategy?.maxBuySlippageBps === undefined ||
      input.strategy.maxBuySlippageBps === LEGACY_MAX_BUY_SLIPPAGE_BPS
    ) {
      next.strategy.maxBuySlippageBps = defaults.strategy.maxBuySlippageBps;
    }

    next.strategy.buySlippageBps = Math.max(
      0,
      Math.min(next.strategy.buySlippageBps, next.strategy.maxBuySlippageBps),
    );

    return next;
  }

  async load(): Promise<BotSettings> {
    const loaded = await this.persistence.readSettings();
    const normalized = this.normalize(loaded);
    this.settings = normalized;

    if (JSON.stringify(loaded) !== JSON.stringify(normalized)) {
      await this.persistence.saveSettings(normalized);
    }

    return this.settings;
  }

  get(): BotSettings {
    return this.settings;
  }

  getExecutionMode(settings: BotSettings = this.settings): ExecutionMode {
    if (settings.uiOnly || settings.dryRun || settings.paperTrade) {
      return 'SIMULATED';
    }

    return 'LIVE';
  }

  async replace(next: BotSettings): Promise<BotSettings> {
    this.settings = this.normalize({
      ...next,
      updatedAt: new Date().toISOString(),
    });
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

  async setExecutionMode(mode: ExecutionMode): Promise<BotSettings> {
    if (mode === 'LIVE') {
      return this.patch({
        dryRun: false,
        paperTrade: false,
        uiOnly: false,
      });
    }

    return this.patch({
      dryRun: true,
      paperTrade: true,
      uiOnly: false,
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
