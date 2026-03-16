import type {
  AutoExecutionDecision,
  BotSettings,
  ManualOrderRequest,
  PositionRecord,
  SignalCandidate,
  TradingMode,
} from '../../core/types';
import { logger } from '../../core/logger';
import { nowIso } from '../../utils/time';
import { IndodaxClient } from '../../integrations/indodax/client';
import { JournalService } from '../../services/journalService';
import { StateService } from '../../services/stateService';
import { SettingsService } from '../settings/settingsService';
import { AccountRegistry } from '../accounts/accountRegistry';
import { OrderManager } from './orderManager';
import { PositionManager } from './positionManager';
import { RiskEngine } from './riskEngine';

function inferEntryPrice(signal: SignalCandidate): number {
  const spreadMultiplier = 1 + Math.max(0.0005, signal.spreadPct / 100);
  const baseAnchor = Math.max(1, signal.breakoutPressure + signal.volumeAcceleration);
  return baseAnchor * spreadMultiplier;
}

export class ExecutionEngine {
  constructor(
    private readonly accounts: AccountRegistry,
    private readonly settings: SettingsService,
    private readonly state: StateService,
    private readonly risk: RiskEngine,
    private readonly indodax: IndodaxClient,
    private readonly positions: PositionManager,
    private readonly orders: OrderManager,
    private readonly journal: JournalService,
  ) {}

  private shouldSimulate(mode: TradingMode, settings: BotSettings): boolean {
    return (
      settings.uiOnly ||
      settings.dryRun ||
      settings.paperTrade ||
      mode === 'ALERT_ONLY' ||
      mode === 'OFF'
    );
  }

  decideAutoExecution(signal: SignalCandidate): AutoExecutionDecision {
    const settings = this.settings.get();

    if (settings.tradingMode === 'OFF') {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'NONE',
        reasons: ['Trading mode OFF'],
      };
    }

    if (signal.score < settings.strategy.minScoreToAlert) {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'WATCH',
        reasons: ['Score masih di bawah threshold alert'],
      };
    }

    if (signal.score < settings.strategy.minScoreToBuy) {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'PREPARE_ENTRY',
        reasons: ['Score sudah menarik tetapi belum cukup untuk entry'],
      };
    }

    if (signal.confidence < settings.strategy.minConfidence) {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'AVOID',
        reasons: ['Confidence belum cukup'],
      };
    }

    return {
      shouldEnter: true,
      shouldExit: false,
      action: settings.tradingMode === 'FULL_AUTO' ? 'ENTER' : 'PREPARE_ENTRY',
      reasons: ['Signal memenuhi syarat entry'],
    };
  }

  async attemptAutoBuy(signal: SignalCandidate): Promise<string> {
    const settings = this.settings.get();
    const decision = this.decideAutoExecution(signal);

    if (!decision.shouldEnter || settings.tradingMode !== 'FULL_AUTO') {
      return `skip auto-buy ${signal.pair}: ${decision.reasons.join('; ')}`;
    }

    const account = this.accounts.getDefault();
    if (!account) {
      throw new Error('Default account tidak tersedia');
    }

    return this.buy(account.id, signal, settings.risk.maxPositionSizeIdr, 'AUTO');
  }

  async buy(
    accountId: string,
    signal: SignalCandidate,
    amountIdr: number,
    source: 'MANUAL' | 'SEMI_AUTO' | 'AUTO' = 'MANUAL',
  ): Promise<string> {
    const settings = this.settings.get();
    const account = this.accounts.getById(accountId);

    if (!account) {
      throw new Error('Account tidak ditemukan');
    }

    const riskResult = this.risk.checkCanEnter({
      account,
      settings,
      signal,
      openPositions: this.positions.listOpen(),
      amountIdr,
      cooldownUntil: this.state.get().pairCooldowns[signal.pair] ?? null,
    });

    if (!riskResult.allowed) {
      throw new Error(riskResult.reasons.join('; '));
    }

    const entryPrice = inferEntryPrice(signal);
    const quantity = entryPrice > 0 ? amountIdr / entryPrice : 0;
    const stops = this.risk.buildStops(entryPrice, settings);

    const order = await this.orders.create({
      accountId,
      pair: signal.pair,
      side: 'buy',
      type: 'limit',
      price: entryPrice,
      quantity,
      source,
      status: 'OPEN',
      notes: `score=${signal.score}; confidence=${signal.confidence}`,
    });

    if (this.shouldSimulate(settings.tradingMode, settings)) {
      await this.orders.markFilled(order.id, quantity, entryPrice);

      await this.positions.open({
        accountId,
        pair: signal.pair,
        quantity,
        entryPrice,
        stopLossPrice: stops.stopLossPrice,
        takeProfitPrice: stops.takeProfitPrice,
        sourceOrderId: order.id,
      });

      await this.journal.append({
        id: order.id,
        type: 'TRADE',
        title: 'Simulated buy filled',
        message: `BUY ${signal.pair} qty=${quantity.toFixed(8)}`,
        pair: signal.pair,
        payload: {
          accountId,
          entryPrice,
          quantity,
          signalScore: signal.score,
          signalConfidence: signal.confidence,
          source,
        },
        createdAt: nowIso(),
      });

      await this.state.markTrade();
      await this.state.setPairCooldown(signal.pair, Date.now() + settings.risk.cooldownMs);

      return `BUY simulated ${signal.pair} qty=${quantity.toFixed(8)}`;
    }

    const api = this.indodax.forAccount(account);
    const liveResult = await api.trade(signal.pair, 'buy', entryPrice, amountIdr);

    logger.info({ pair: signal.pair, accountId, liveResult }, 'live buy order sent');

    await this.orders.markFilled(order.id, quantity, entryPrice);

    await this.positions.open({
      accountId,
      pair: signal.pair,
      quantity,
      entryPrice,
      stopLossPrice: stops.stopLossPrice,
      takeProfitPrice: stops.takeProfitPrice,
      sourceOrderId: order.id,
    });

    await this.state.markTrade();
    await this.state.setPairCooldown(signal.pair, Date.now() + settings.risk.cooldownMs);

    return `BUY live ${signal.pair} qty=${quantity.toFixed(8)}`;
  }

  async manualOrder(request: ManualOrderRequest): Promise<string> {
    const signalLike: SignalCandidate = {
      pair: request.pair,
      score: 100,
      confidence: 1,
      reasons: ['manual order'],
      warnings: [],
      regime: 'BREAKOUT_SETUP',
      breakoutPressure: 10,
      volumeAcceleration: 10,
      orderbookImbalance: 0.2,
      spreadPct: 0.2,
      timestamp: Date.now(),
    };

    if (request.side === 'buy') {
      const notional = (request.price ?? 0) * request.quantity;
      return this.buy(request.accountId, signalLike, notional, 'MANUAL');
    }

    const open = this.positions.getOpenByPair(request.pair).find(
      (item) => item.accountId === request.accountId,
    );

    if (!open) {
      throw new Error('Tidak ada posisi terbuka untuk pair tersebut');
    }

    return this.manualSell(open.id, request.quantity, 'MANUAL');
  }

  async manualSell(
    positionId: string,
    quantityToSell: number,
    source: 'MANUAL' | 'SEMI_AUTO' | 'AUTO' = 'MANUAL',
  ): Promise<string> {
    const position = this.positions.getById(positionId);
    if (!position || position.status === 'CLOSED') {
      throw new Error('Position tidak ditemukan');
    }

    const exitPrice = position.currentPrice || position.averageEntryPrice;
    const closeQuantity = Math.max(0, Math.min(position.quantity, quantityToSell));

    const order = await this.orders.create({
      accountId: position.accountId,
      pair: position.pair,
      side: 'sell',
      type: 'limit',
      price: exitPrice,
      quantity: closeQuantity,
      source,
      status: 'OPEN',
      notes: 'manual/exit sell',
    });

    await this.orders.markFilled(order.id, closeQuantity, exitPrice);
    const updated = await this.positions.closePartial(position.id, closeQuantity, exitPrice);

    await this.journal.append({
      id: order.id,
      type: 'TRADE',
      title: 'Sell filled',
      message: `SELL ${position.pair} qty=${closeQuantity.toFixed(8)}`,
      pair: position.pair,
      payload: {
        accountId: position.accountId,
        exitPrice,
        quantity: closeQuantity,
        realizedPnl: updated?.realizedPnl ?? 0,
        source,
      },
      createdAt: nowIso(),
    });

    await this.state.markTrade();
    await this.state.setPairCooldown(position.pair, Date.now() + this.settings.get().risk.cooldownMs);

    return `SELL ${position.pair} qty=${closeQuantity.toFixed(8)} selesai`;
  }

  async evaluateOpenPositions(): Promise<string[]> {
    const settings = this.settings.get();
    const messages: string[] = [];

    for (const position of this.positions.listOpen()) {
      const exit = this.risk.evaluateExit(position, settings);
      if (!exit.shouldExit) {
        continue;
      }

      await this.manualSell(position.id, position.quantity, 'AUTO');
      messages.push(`${position.pair} exit by ${exit.reason}`);
    }

    return messages;
  }

  async cancelAllOrders(): Promise<string> {
    const count = await this.orders.cancelAll('emergency cancel all');
    return `Canceled ${count} active orders`;
  }

  async sellAllPositions(): Promise<string> {
    const openPositions: PositionRecord[] = this.positions.listOpen();

    for (const position of openPositions) {
      await this.manualSell(position.id, position.quantity, 'AUTO');
    }

    return `Closed ${openPositions.length} positions`;
  }
}
