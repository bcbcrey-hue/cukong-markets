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
import { createChildLogger } from '../../core/logger';

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
  configured: boolean;
  launched: boolean;
  running: boolean;
  connected: boolean;
  lastLaunchAt: string | null;
  lastLaunchSuccessAt: string | null;
  lastLaunchError: string | null;
}

export class TelegramBot implements SummaryNotifier {
  private readonly log = createChildLogger({ module: 'telegram-runtime' });
  private readonly bot: Telegraf | null;
  private signal: TelegramConnectionSignal = {
    configured: Boolean(env.telegramToken),
    launched: false,
    running: false,
    connected: false,
    lastLaunchAt: null,
    lastLaunchSuccessAt: null,
    lastLaunchError: null,
  };

  constructor(private readonly deps: TelegramBotDeps) {
    const tokenConfigured = Boolean(env.telegramToken);
    const tokenMasked = maskTelegramToken(env.telegramToken);
    const allowedUsersCount = env.telegramAllowedUserIds.length;

    this.log.info(
      {
        tokenConfigured,
        tokenMasked,
        allowedUsersCount,
      },
      'telegram runtime config loaded',
    );

    if (env.telegramToken) {
      this.bot = new TelegrafBot(env.telegramToken);
      registerHandlers(this.bot, {
        ...deps,
        uploadHandler: new UploadHandler(deps.accountStore, deps.accounts),
        getTelegramSignal: () => this.getConnectionSignal(),
      });
      return;
    }

    this.bot = null;
  }

  async start(): Promise<void> {
    if (!this.bot) {
      this.signal = {
        ...this.signal,
        configured: false,
        launched: false,
        running: false,
        connected: false,
        lastLaunchAt: new Date().toISOString(),
        lastLaunchError: 'telegram token missing: TELEGRAM_BOT_TOKEN',
      };
      this.log.warn(
        {
          configured: this.signal.configured,
          launched: this.signal.launched,
          running: this.signal.running,
          connected: this.signal.connected,
          lastLaunchError: this.signal.lastLaunchError,
        },
        'telegram bot not started because token is missing',
      );
      return;
    }

    this.signal.lastLaunchAt = new Date().toISOString();
    this.signal.lastLaunchError = null;

    try {
      await this.bot.telegram.getMe();
      await this.bot.launch();

      this.signal = {
        ...this.signal,
        configured: true,
        launched: true,
        running: true,
        connected: true,
        lastLaunchSuccessAt: new Date().toISOString(),
        lastLaunchError: null,
      };
      this.log.info(
        {
          configured: this.signal.configured,
          launched: this.signal.launched,
          running: this.signal.running,
          connected: this.signal.connected,
        },
        'telegram bot launched and connected',
      );
    } catch (error) {
      this.signal = {
        ...this.signal,
        configured: true,
        launched: false,
        running: false,
        connected: false,
        lastLaunchError: error instanceof Error ? error.message : String(error),
      };
      this.log.error(
        {
          configured: this.signal.configured,
          launched: this.signal.launched,
          running: this.signal.running,
          connected: this.signal.connected,
          lastLaunchError: this.signal.lastLaunchError,
        },
        'telegram bot launch failed; app will continue in degraded mode',
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.bot) {
      this.signal = {
        ...this.signal,
        running: false,
        connected: false,
      };
      return;
    }

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
    if (!this.bot || env.telegramAllowedUserIds.length === 0) {
      return;
    }

    const bot = this.bot;
    await Promise.allSettled(
      env.telegramAllowedUserIds.map((userId) => bot.telegram.sendMessage(userId, message)),
    );
  }
}

function maskTelegramToken(token: string): string | null {
  if (!token) {
    return null;
  }

  const clean = token.trim();
  if (!clean) {
    return null;
  }

  if (clean.length <= 8) {
    return `${clean.slice(0, 2)}***`;
  }

  return `${clean.slice(0, 4)}***${clean.slice(-4)}`;
}
