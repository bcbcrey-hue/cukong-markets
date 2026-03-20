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

export class TelegramBot implements SummaryNotifier {
  private readonly bot: Telegraf;

  constructor(private readonly deps: TelegramBotDeps) {
    this.bot = new TelegrafBot(env.telegramToken);

    registerHandlers(this.bot, {
      ...deps,
      uploadHandler: new UploadHandler(deps.accountStore, deps.accounts),
    });
  }

  async start(): Promise<void> {
    await this.bot.launch();
  }

  async stop(): Promise<void> {
    this.bot.stop();
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
