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
  lastConnectionStatus: 'never_started' | 'connected' | 'failed' | 'stopped';
  allowedUsersCount: number;
  botId: number | null;
  botUsername: string | null;
  botFirstName: string | null;
  botIsBot: boolean | null;
  lastLaunchAt: string | null;
  lastConnectedAt: string | null;
  lastLaunchSuccessAt: string | null;
  lastLaunchError: string | null;
  lastLaunchErrorType:
    | 'none'
    | 'missing_token'
    | 'invalid_token'
    | 'proxy_blocked'
    | 'network'
    | 'unknown';
}

export class TelegramBot implements SummaryNotifier {
  private readonly log = createChildLogger({ module: 'telegram-runtime' });
  private readonly bot: Telegraf | null;
  private signal: TelegramConnectionSignal = {
    configured: Boolean(env.telegramToken),
    launched: false,
    running: false,
    connected: false,
    lastConnectionStatus: 'never_started',
    allowedUsersCount: env.telegramAllowedUserIds.length,
    botId: null,
    botUsername: null,
    botFirstName: null,
    botIsBot: null,
    lastLaunchAt: null,
    lastConnectedAt: null,
    lastLaunchSuccessAt: null,
    lastLaunchError: null,
    lastLaunchErrorType: 'none',
  };

  constructor(private readonly deps: TelegramBotDeps) {
    const tokenConfigured = Boolean(env.telegramToken);
    const tokenMasked = maskTelegramToken(env.telegramToken);
    const allowedUsersCount = env.telegramAllowedUserIds.length;
    const allowedUsersPreviewMasked = maskAllowedUserIds(env.telegramAllowedUserIds);

    this.log.info(
      {
        tokenConfigured,
        tokenMasked,
        allowedUsersCount,
        allowedUsersPreviewMasked,
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
        lastConnectionStatus: 'failed',
        allowedUsersCount: env.telegramAllowedUserIds.length,
        lastLaunchAt: new Date().toISOString(),
        lastLaunchError: 'telegram token missing: TELEGRAM_BOT_TOKEN',
        lastLaunchErrorType: 'missing_token',
      };
      this.log.warn(
        {
          configured: this.signal.configured,
          launched: this.signal.launched,
          running: this.signal.running,
          connected: this.signal.connected,
          lastConnectionStatus: this.signal.lastConnectionStatus,
          lastLaunchError: this.signal.lastLaunchError,
          lastLaunchErrorType: this.signal.lastLaunchErrorType,
        },
        'telegram bot not started because token is missing',
      );
      return;
    }

    this.signal.lastLaunchAt = new Date().toISOString();
    this.signal.lastLaunchError = null;
    this.signal.lastLaunchErrorType = 'none';

    if (env.telegramAllowedUserIds.length === 0) {
      this.log.warn(
        {
          configured: true,
          tokenMasked: maskTelegramToken(env.telegramToken),
          allowedUsersCount: 0,
        },
        'telegram whitelist is empty; all incoming users will be denied',
      );
    }

    try {
      const me = await this.bot.telegram.getMe();
      await this.bot.launch();
      const connectedAt = new Date().toISOString();

      this.signal = {
        ...this.signal,
        configured: true,
        launched: true,
        running: true,
        connected: true,
        lastConnectionStatus: 'connected',
        allowedUsersCount: env.telegramAllowedUserIds.length,
        botId: me.id,
        botUsername: me.username ?? null,
        botFirstName: me.first_name ?? null,
        botIsBot: me.is_bot ?? null,
        lastConnectedAt: connectedAt,
        lastLaunchSuccessAt: connectedAt,
        lastLaunchError: null,
        lastLaunchErrorType: 'none',
      };
      this.log.info(
        {
          configured: this.signal.configured,
          launched: this.signal.launched,
          running: this.signal.running,
          connected: this.signal.connected,
          lastConnectionStatus: this.signal.lastConnectionStatus,
          allowedUsersCount: this.signal.allowedUsersCount,
          botId: this.signal.botId,
          botUsername: this.signal.botUsername,
          botFirstName: this.signal.botFirstName,
          botIsBot: this.signal.botIsBot,
          lastConnectedAt: this.signal.lastConnectedAt,
          lastLaunchErrorType: this.signal.lastLaunchErrorType,
        },
        'telegram bot launched and connected',
      );
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      const launchErrorType = classifyLaunchError(normalizedError);
      this.signal = {
        ...this.signal,
        configured: true,
        launched: false,
        running: false,
        connected: false,
        lastConnectionStatus: 'failed',
        allowedUsersCount: env.telegramAllowedUserIds.length,
        lastLaunchError: normalizedError.message,
        lastLaunchErrorType: launchErrorType,
      };
      this.log.error(
        {
          configured: this.signal.configured,
          launched: this.signal.launched,
          running: this.signal.running,
          connected: this.signal.connected,
          lastConnectionStatus: this.signal.lastConnectionStatus,
          lastLaunchError: this.signal.lastLaunchError,
          lastLaunchErrorType: this.signal.lastLaunchErrorType,
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
        lastConnectionStatus: 'stopped',
        allowedUsersCount: env.telegramAllowedUserIds.length,
      };
      return;
    }

    this.bot.stop();
    this.signal = {
      ...this.signal,
      running: false,
      connected: false,
      lastConnectionStatus: 'stopped',
      allowedUsersCount: env.telegramAllowedUserIds.length,
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

function classifyLaunchError(error: Error): TelegramConnectionSignal['lastLaunchErrorType'] {
  const codedError = error as Error & {
    code?: string;
    response?: { error_code?: number };
    cause?: { code?: string; message?: string };
  };

  if (codedError.response?.error_code === 401 || /\b401\b/.test(error.message) || /unauthorized/i.test(error.message)) {
    return 'invalid_token';
  }

  const compact = [error.message, codedError.code, codedError.cause?.code, codedError.cause?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (compact.includes('connect tunnel failed') || compact.includes('proxy') || compact.includes('http 403')) {
    return 'proxy_blocked';
  }

  if (compact.includes('request to https://api.telegram.org') && hasProxyEnvConfigured()) {
    return 'proxy_blocked';
  }

  if (
    compact.includes('request to https://api.telegram.org') ||
    compact.includes('econnrefused') ||
    compact.includes('enotfound') ||
    compact.includes('eai_again') ||
    compact.includes('etimedout') ||
    compact.includes('network')
  ) {
    return 'network';
  }

  return 'unknown';
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

function maskAllowedUserIds(userIds: number[]): string[] {
  return userIds.slice(0, 3).map((userId) => {
    const value = String(userId).trim();
    if (value.length <= 4) {
      return `${value.slice(0, 1)}***`;
    }

    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  });
}

function hasProxyEnvConfigured(): boolean {
  return ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'].some((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
}
