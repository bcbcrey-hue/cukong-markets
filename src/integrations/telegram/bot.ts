import type { Telegraf } from 'telegraf';
import { Telegraf as TelegrafBot } from 'telegraf';
import { env } from '../../config/env';
import { AccountRegistry } from '../../domain/accounts/accountRegistry';
import { BacktestEngine } from '../../domain/backtest/backtestEngine';
import { AccountStore } from '../../domain/accounts/accountStore';
import { HotlistService } from '../../domain/market/hotlistService';
import { ExecutionEngine } from '../../domain/trading/executionEngine';
import { OrderManager } from '../../domain/trading/orderManager';
import { PositionManager } from '../../domain/trading/positionManager';
import { SettingsService } from '../../domain/settings/settingsService';
import { HealthService } from '../../services/healthService';
import { JournalService } from '../../services/journalService';
import { ReportService } from '../../services/reportService';
import type { SummaryNotifier } from '../../services/summaryService';
import { StateService } from '../../services/stateService';
import { registerHandlers } from './handlers';
import { UploadHandler } from './uploadHandler';

export interface TelegramBotDeps {
  report: ReportService;
  health: HealthService;
  state: StateService;
  hotlist: HotlistService;
  positions: PositionManager;
  orders: OrderManager;
  accounts: AccountRegistry;
  accountStore: AccountStore;
  settings: SettingsService;
  execution: ExecutionEngine;
  journal: JournalService;
  backtest: BacktestEngine;
  runtimeControl?: {
    start(): Promise<void>;
    stop(): Promise<void>;
  };
}

export interface TelegramConnectionSignal {
  launched: boolean;
  running: boolean;
  connected: boolean;
  lastLaunchAt: string | null;
  lastLaunchSuccessAt: string | null;
  lastLaunchError: string | null;
}

export class TelegramBot implements SummaryNotifier {
  private readonly bot: Telegraf;
  private signal: TelegramConnectionSignal = {
    launched: false,
    running: false,
    connected: false,
    lastLaunchAt: null,
    lastLaunchSuccessAt: null,
    lastLaunchError: null,
  };

  constructor(private readonly deps: TelegramBotDeps) {
    this.bot = new TelegrafBot(env.telegramToken);

    registerHandlers(this.bot, {
      ...deps,
      uploadHandler: new UploadHandler(deps.accountStore, deps.accounts),
      getTelegramSignal: () => this.getConnectionSignal(),
    });
  }

  async start(): Promise<void> {
    this.signal.lastLaunchAt = new Date().toISOString();
    this.signal.lastLaunchError = null;

    try {
      await this.bot.telegram.getMe();
      await this.bot.launch();

      this.signal = {
        ...this.signal,
        launched: true,
        running: true,
        connected: true,
        lastLaunchSuccessAt: new Date().toISOString(),
        lastLaunchError: null,
      };
    } catch (error) {
      this.signal = {
        ...this.signal,
        launched: false,
        running: false,
        connected: false,
        lastLaunchError: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.bot.stop();
    this.signal = {
      ...this.signal,
      running: false,
      connected: false,
    };
  }

  getConnectionSignal(): TelegramConnectionSignal {
    return { ...this.signal };
  }

  async broadcast(message: string): Promise<void> {
    if (env.telegramAllowedUserIds.length === 0) {
      return;
    }

    await Promise.allSettled(
      env.telegramAllowedUserIds.map((userId) => this.bot.telegram.sendMessage(userId, message)),
    );
  }
}
