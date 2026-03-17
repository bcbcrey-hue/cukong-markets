import type {
  AutoExecutionDecision,
  BotSettings,
  ManualOrderRequest,
  OpportunityAssessment,
  OrderRecord,
  PositionRecord,
  SignalCandidate,
  TradingMode,
} from '../../core/types';
import { logger } from '../../core/logger';
import { nowIso } from '../../utils/time';
import { IndodaxClient } from '../../integrations/indodax/client';
import type {
  IndodaxGetOrderReturn,
  IndodaxOpenOrdersReturn,
  IndodaxTradeHistoryReturn,
  IndodaxTradeReturn,
} from '../../integrations/indodax/privateApi';
import { JournalService } from '../../services/journalService';
import { StateService } from '../../services/stateService';
import { SettingsService } from '../settings/settingsService';
import { AccountRegistry } from '../accounts/accountRegistry';
import { OrderManager } from './orderManager';
import { PositionManager } from './positionManager';
import { RiskEngine } from './riskEngine';

type ExecutionCandidate = SignalCandidate | OpportunityAssessment;

interface ExchangeOrderSnapshot {
  exchangeStatus: string;
  filledQuantity: number;
  remainingQuantity: number | null;
  averageFillPrice: number | null;
}

interface ExchangeOpenOrderMatch {
  pair: string;
  order: Record<string, string | number>;
}

interface ExchangeTradeStats {
  filledQuantity: number | null;
  averageFillPrice: number | null;
  feeAmount: number;
  feeAsset: string | null;
  tradeCount: number;
  lastExecutedAt: string | null;
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

  private toFiniteNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private baseAsset(pair: string): string {
    const [baseAsset] = pair.toLowerCase().split('_');
    return baseAsset || 'amount';
  }

  private quoteAsset(pair: string): string {
    const [, quoteAsset = 'idr'] = pair.toLowerCase().split('_');
    return quoteAsset || 'idr';
  }

  private appendNotes(current: string | undefined, note: string): string {
    return current ? `${current}; ${note}` : note;
  }

  private getPrivateApi(accountId: string) {
    const account = this.accounts.getById(accountId);
    return account ? this.indodax.forAccount(account) : null;
  }

  private hasActiveOrder(
    pair: string,
    side: OrderRecord['side'],
    accountId: string,
    relatedPositionId?: string,
  ): boolean {
    return this.orders.listActive().some((order) => {
      if (order.pair !== pair || order.side !== side || order.accountId !== accountId) {
        return false;
      }

      if (relatedPositionId && order.relatedPositionId) {
        return order.relatedPositionId === relatedPositionId;
      }

      return true;
    });
  }

  private mapExchangeStatus(
    snapshot: ExchangeOrderSnapshot,
    totalQuantity: number,
  ): OrderRecord['status'] {
    const normalized = snapshot.exchangeStatus.trim().toLowerCase();

    if (['cancel', 'canceled', 'cancelled', 'expired'].includes(normalized)) {
      return 'CANCELED';
    }

    if (['rejected', 'reject', 'failed'].includes(normalized)) {
      return 'REJECTED';
    }

    if (['filled', 'closed', 'done'].includes(normalized)) {
      return 'FILLED';
    }

    if (snapshot.filledQuantity >= totalQuantity - 1e-8) {
      return 'FILLED';
    }

    if (snapshot.filledQuantity > 1e-8) {
      return 'PARTIALLY_FILLED';
    }

    return 'OPEN';
  }

  private buildExchangeSnapshotFromOrderFields(
    order: OrderRecord,
    exchangeOrder: Record<string, string | number>,
    fallbackStatus = 'open',
  ): ExchangeOrderSnapshot {
    const asset = this.baseAsset(order.pair);
    const orderedQuantity =
      this.toFiniteNumber(exchangeOrder[`order_${asset}`]) ??
      this.toFiniteNumber(exchangeOrder[asset]) ??
      order.quantity;
    const remainingQuantity =
      this.toFiniteNumber(exchangeOrder[`remain_${asset}`]) ??
      this.toFiniteNumber(exchangeOrder.remain) ??
      null;
    const filledQuantity = remainingQuantity !== null
      ? Math.max(0, Math.min(order.quantity, orderedQuantity - remainingQuantity))
      : order.filledQuantity;

    return {
      exchangeStatus:
        typeof exchangeOrder.status === 'string' && exchangeOrder.status.trim()
          ? exchangeOrder.status
          : fallbackStatus,
      filledQuantity,
      remainingQuantity,
      averageFillPrice: this.toFiniteNumber(exchangeOrder.price) ?? order.averageFillPrice ?? order.price,
    };
  }

  private buildExchangeSnapshot(
    order: OrderRecord,
    payload: IndodaxGetOrderReturn,
  ): ExchangeOrderSnapshot {
    return this.buildExchangeSnapshotFromOrderFields(order, payload.order ?? {}, 'open');
  }

  private mergeTradeStatsIntoSnapshot(
    snapshot: ExchangeOrderSnapshot,
    tradeStats: ExchangeTradeStats | null,
  ): ExchangeOrderSnapshot {
    if (!tradeStats) {
      return snapshot;
    }

    return {
      ...snapshot,
      filledQuantity: tradeStats.filledQuantity ?? snapshot.filledQuantity,
      averageFillPrice: tradeStats.averageFillPrice ?? snapshot.averageFillPrice,
    };
  }

  private flattenOpenOrders(payload: IndodaxOpenOrdersReturn): Map<string, ExchangeOpenOrderMatch> {
    const matches = new Map<string, ExchangeOpenOrderMatch>();

    for (const [pair, orders] of Object.entries(payload.orders ?? {})) {
      for (const order of orders ?? []) {
        const orderId = order.order_id;
        if (orderId === undefined || orderId === null) {
          continue;
        }

        matches.set(String(orderId), { pair, order });
      }
    }

    return matches;
  }

  private parseTradeTimestamp(raw: Record<string, string | number>): string | null {
    const candidates = [raw.timestamp, raw.trade_time, raw.submit_time, raw.finish_time];

    for (const candidate of candidates) {
      const value = this.toFiniteNumber(candidate);
      if (value === null || value <= 0) {
        continue;
      }

      const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
      return new Date(normalized).toISOString();
    }

    return null;
  }

  private extractTradeStats(
    order: OrderRecord,
    payload: IndodaxTradeHistoryReturn,
  ): ExchangeTradeStats | null {
    const exchangeOrderId = order.exchangeOrderId ? String(order.exchangeOrderId) : null;
    if (!exchangeOrderId) {
      return null;
    }

    const asset = this.baseAsset(order.pair);
    const matchingTrades = (payload.trades ?? []).filter((trade) => {
      const orderId = trade.order_id;
      return orderId !== undefined && orderId !== null && String(orderId) === exchangeOrderId;
    });

    if (matchingTrades.length === 0) {
      return null;
    }

    let filledQuantity = 0;
    let weightedNotional = 0;
    let feeAmount = 0;
    let feeAsset: string | null = null;
    let lastExecutedAt: string | null = null;

    for (const trade of matchingTrades) {
      const quantity =
        this.toFiniteNumber(trade[asset]) ??
        this.toFiniteNumber(trade[`order_${asset}`]) ??
        this.toFiniteNumber(trade.quantity) ??
        0;
      const price = this.toFiniteNumber(trade.price) ?? order.price;

      if (quantity > 0) {
        filledQuantity += quantity;
        weightedNotional += quantity * price;
      }

      const directFee = this.toFiniteNumber(trade.fee);
      if (directFee !== null) {
        feeAmount += directFee;
        feeAsset ??= this.quoteAsset(order.pair);
      }

      for (const [key, value] of Object.entries(trade)) {
        if (!key.startsWith('fee_')) {
          continue;
        }

        const feeValue = this.toFiniteNumber(value);
        if (feeValue === null) {
          continue;
        }

        feeAmount += feeValue;
        feeAsset ??= key.slice(4) || null;
      }

      const tradeTimestamp = this.parseTradeTimestamp(trade);
      if (tradeTimestamp && (!lastExecutedAt || tradeTimestamp > lastExecutedAt)) {
        lastExecutedAt = tradeTimestamp;
      }
    }

    return {
      filledQuantity: filledQuantity > 0 ? Math.min(order.quantity, filledQuantity) : null,
      averageFillPrice:
        filledQuantity > 0 ? weightedNotional / filledQuantity : order.averageFillPrice ?? order.price,
      feeAmount,
      feeAsset,
      tradeCount: matchingTrades.length,
      lastExecutedAt,
    };
  }

  private async loadTradeStats(
    order: OrderRecord,
  ): Promise<ExchangeTradeStats | null> {
    const api = this.getPrivateApi(order.accountId);
    if (!api || typeof (api as { tradeHistory?: unknown }).tradeHistory !== 'function') {
      return null;
    }

    const response = await api.tradeHistory(order.pair);
    return this.extractTradeStats(order, response.return ?? {});
  }

  private async syncOrderWithSnapshot(
    order: OrderRecord,
    snapshot: ExchangeOrderSnapshot,
    source: 'getOrder' | 'openOrders',
    tradeStats: ExchangeTradeStats | null = null,
  ): Promise<OrderRecord | undefined> {
    const averageFillPrice = snapshot.averageFillPrice ?? order.price;
    const nextFilledQuantity = snapshot.filledQuantity;
    const feeAmount = tradeStats?.feeAmount ?? order.feeAmount ?? 0;
    const feeDelta = Math.max(0, feeAmount - (order.feeAmount ?? 0));
    const deltaFilledQuantity = Math.max(0, nextFilledQuantity - order.filledQuantity);
    const previousAverageFillPrice = order.averageFillPrice ?? order.price;
    const deltaExecutionPrice =
      deltaFilledQuantity > 1e-8
        ? Math.max(
            0,
            (nextFilledQuantity * averageFillPrice - order.filledQuantity * previousAverageFillPrice) /
              deltaFilledQuantity,
          )
        : averageFillPrice;

    await this.applyFillDelta(order, nextFilledQuantity, deltaExecutionPrice, feeDelta);

    return this.orders.update(order.id, {
      status: this.mapExchangeStatus(snapshot, order.quantity),
      filledQuantity: nextFilledQuantity,
      averageFillPrice,
      exchangeStatus: snapshot.exchangeStatus,
      exchangeUpdatedAt: nowIso(),
      feeAmount,
      feeAsset: tradeStats?.feeAsset ?? order.feeAsset,
      executedTradeCount: tradeStats?.tradeCount ?? order.executedTradeCount,
      lastExecutedAt: tradeStats?.lastExecutedAt ?? order.lastExecutedAt,
      notes: this.appendNotes(
        order.notes,
        `${source}=${snapshot.exchangeStatus}`,
      ),
    });
  }

  private async fetchOpenOrdersForAccount(accountId: string): Promise<Map<string, ExchangeOpenOrderMatch>> {
    const account = this.accounts.getById(accountId);
    if (!account) {
      return new Map();
    }

    const api = this.indodax.forAccount(account);
    if (typeof (api as { openOrders?: unknown }).openOrders !== 'function') {
      return new Map();
    }

    const response = await api.openOrders();
    return this.flattenOpenOrders(response.return ?? {});
  }

  private async applyFillDelta(
    order: OrderRecord,
    nextFilledQuantity: number,
    executionPrice: number,
    feeDelta = 0,
  ): Promise<void> {
    const deltaFilled = Math.max(0, nextFilledQuantity - order.filledQuantity);
    if (deltaFilled <= 1e-8) {
      return;
    }

    if (order.side === 'buy') {
      const stops = this.risk.buildStops(executionPrice, this.settings.get());
      await this.positions.applyBuyFill({
        accountId: order.accountId,
        pair: order.pair,
        quantity: deltaFilled,
        entryPrice: executionPrice,
        entryFeesPaid: feeDelta,
        stopLossPrice: stops.stopLossPrice,
        takeProfitPrice: stops.takeProfitPrice,
        sourceOrderId: order.id,
      });
    } else {
      const targetPosition =
        (order.relatedPositionId ? this.positions.getById(order.relatedPositionId) : undefined) ??
        this.positions
          .getOpenByPair(order.pair)
          .find((item) => item.accountId === order.accountId);

      if (!targetPosition) {
        await this.journal.warn('SELL_SYNC_POSITION_MISSING', 'position tidak ditemukan saat sync sell live', {
          orderId: order.id,
          pair: order.pair,
          deltaFilled,
        });
      } else {
        await this.positions.closePartial(targetPosition.id, deltaFilled, executionPrice, feeDelta);
      }
    }

    await this.journal.append({
      id: `${order.id}-${nowIso()}`,
      type: 'TRADE',
      title: 'Live fill synced',
      message: `${order.side.toUpperCase()} ${order.pair} qty=${deltaFilled.toFixed(8)}`,
      pair: order.pair,
      payload: {
        accountId: order.accountId,
        orderId: order.id,
        exchangeOrderId: order.exchangeOrderId,
        executionPrice,
        quantity: deltaFilled,
        feeDelta,
      },
      createdAt: nowIso(),
    });

    await this.state.markTrade();
    await this.state.setPairCooldown(order.pair, Date.now() + this.settings.get().risk.cooldownMs);
  }

  private async syncLiveOrder(orderId: string): Promise<OrderRecord | undefined> {
    const order = this.orders.getById(orderId);
    if (!order?.exchangeOrderId) {
      return order;
    }

    const account = this.accounts.getById(order.accountId);
    if (!account) {
      return order;
    }

    const api = this.indodax.forAccount(account);
    const response = await api.getOrder(order.pair, order.exchangeOrderId);
    const snapshot = this.buildExchangeSnapshot(order, response.return ?? {});
    const tradeStats = await this.loadTradeStats(order);
    return this.syncOrderWithSnapshot(
      order,
      this.mergeTradeStatsIntoSnapshot(snapshot, tradeStats),
      'getOrder',
      tradeStats,
    );
  }

  private extractExchangeOrderId(response: IndodaxTradeReturn | undefined): string | undefined {
    const orderId = response?.order_id;
    return orderId !== undefined && orderId !== null ? String(orderId) : undefined;
  }

  private formatLiveOrderMessage(prefix: 'BUY' | 'SELL', order: OrderRecord): string {
    const suffix = order.exchangeOrderId ? ` orderId=${order.exchangeOrderId}` : '';
    return `${prefix} live ${order.pair} status=${order.status} filled=${order.filledQuantity.toFixed(8)}/${order.quantity.toFixed(8)}${suffix}`;
  }

  private getMarketLastPrice(candidate: ExecutionCandidate): number {
    return 'referencePrice' in candidate ? candidate.referencePrice : candidate.marketPrice;
  }

  private getBuyReferencePrice(candidate: ExecutionCandidate): number {
    if (candidate.bestAsk > 0) {
      return candidate.bestAsk;
    }

    const marketLast = this.getMarketLastPrice(candidate);
    if (marketLast > 0) {
      return marketLast;
    }

    return this.getExecutionPrice(candidate);
  }

  private getAggressiveBuyLimitPrice(
    candidate: ExecutionCandidate,
    settings: BotSettings,
  ): number {
    const referencePrice = this.getBuyReferencePrice(candidate);
    if (referencePrice <= 0) {
      return this.getExecutionPrice(candidate);
    }

    const slippageBps = Math.max(
      0,
      Math.min(settings.strategy.buySlippageBps, settings.strategy.maxBuySlippageBps),
    );

    return referencePrice * (1 + slippageBps / 10_000);
  }

  private shouldCancelStaleBuyOrder(order: OrderRecord): boolean {
    if (order.side !== 'buy' || (order.status !== 'OPEN' && order.status !== 'PARTIALLY_FILLED')) {
      return false;
    }

    const createdAtMs = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdAtMs)) {
      return false;
    }

    return Date.now() - createdAtMs >= this.settings.get().strategy.buyOrderTimeoutMs;
  }

  private async cancelStaleBuyOrder(order: OrderRecord): Promise<OrderRecord | undefined> {
    if (!order.exchangeOrderId) {
      return order;
    }

    const api = this.getPrivateApi(order.accountId);
    if (!api) {
      return order;
    }

    await api.cancelOrder(order.pair, order.exchangeOrderId, order.side);

    return this.orders.update(order.id, {
      status: 'CANCELED',
      exchangeStatus: 'canceled_after_timeout',
      exchangeUpdatedAt: nowIso(),
      notes: this.appendNotes(order.notes, 'buy remainder canceled after timeout'),
    });
  }

  private shouldSimulate(mode: TradingMode, settings: BotSettings): boolean {
    return (
      settings.uiOnly ||
      settings.dryRun ||
      settings.paperTrade ||
      mode === 'ALERT_ONLY' ||
      mode === 'OFF'
    );
  }

  private getExecutionPrice(candidate: ExecutionCandidate): number {
    if ('referencePrice' in candidate) {
      return candidate.bestAsk > 0 ? candidate.bestAsk : candidate.referencePrice;
    }

    return candidate.bestAsk > 0 ? candidate.bestAsk : candidate.marketPrice;
  }

  private getCandidateScore(candidate: ExecutionCandidate): number {
    return 'finalScore' in candidate ? candidate.finalScore : candidate.score;
  }

  private getCandidateNotes(candidate: ExecutionCandidate): string {
    if ('finalScore' in candidate) {
      return [
        `finalScore=${candidate.finalScore.toFixed(2)}`,
        `pumpProbability=${candidate.pumpProbability.toFixed(3)}`,
        `confidence=${candidate.confidence.toFixed(3)}`,
        `action=${candidate.recommendedAction}`,
      ].join('; ');
    }

    return [
      `score=${candidate.score.toFixed(2)}`,
      `confidence=${candidate.confidence.toFixed(3)}`,
    ].join('; ');
  }

  decideAutoExecution(candidate: ExecutionCandidate): AutoExecutionDecision {
    const settings = this.settings.get();

    if (settings.tradingMode === 'OFF') {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'NONE',
        reasons: ['Trading mode OFF'],
      };
    }

    if (this.getCandidateScore(candidate) < settings.strategy.minScoreToAlert) {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'WATCH',
        reasons: ['Score masih di bawah threshold alert'],
      };
    }

    if (this.getCandidateScore(candidate) < settings.strategy.minScoreToBuy) {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'PREPARE_ENTRY',
        reasons: ['Score sudah menarik tetapi belum cukup untuk entry'],
      };
    }

    if (candidate.confidence < settings.strategy.minConfidence) {
      return {
        shouldEnter: false,
        shouldExit: false,
        action: 'AVOID',
        reasons: ['Confidence belum cukup'],
      };
    }

    if ('finalScore' in candidate) {
      if (!candidate.edgeValid) {
        return {
          shouldEnter: false,
          shouldExit: false,
          action: 'AVOID',
          reasons: ['Opportunity belum lolos edge validation'],
        };
      }

      if (candidate.pumpProbability < settings.strategy.minPumpProbability) {
        return {
          shouldEnter: false,
          shouldExit: false,
          action: 'PREPARE_ENTRY',
          reasons: ['Pump probability belum cukup tinggi'],
        };
      }

      if (candidate.entryTiming.state === 'LATE' || candidate.entryTiming.state === 'AVOID') {
        return {
          shouldEnter: false,
          shouldExit: false,
          action: 'AVOID',
          reasons: ['Timing entry tidak layak'],
        };
      }
    }

    return {
      shouldEnter: true,
      shouldExit: false,
      action: settings.tradingMode === 'FULL_AUTO' ? 'ENTER' : 'CONFIRM_ENTRY',
      reasons: ['Signal memenuhi syarat entry'],
    };
  }

  async attemptAutoBuy(signal: ExecutionCandidate): Promise<string> {
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
    signal: ExecutionCandidate,
    amountIdr: number,
    source: 'MANUAL' | 'SEMI_AUTO' | 'AUTO' = 'MANUAL',
  ): Promise<string> {
    const settings = this.settings.get();
    const account = this.accounts.getById(accountId);

    if (!account) {
      throw new Error('Account tidak ditemukan');
    }

    if (this.hasActiveOrder(signal.pair, 'buy', accountId)) {
      throw new Error('Masih ada order BUY aktif pada pair/account yang sama');
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

    const entryPrice = this.getAggressiveBuyLimitPrice(signal, settings);
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
      notes: this.getCandidateNotes(signal),
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
          signalScore: this.getCandidateScore(signal),
          signalConfidence: signal.confidence,
          buySlippageBps: Math.min(
            settings.strategy.buySlippageBps,
            settings.strategy.maxBuySlippageBps,
          ),
          source,
        },
        createdAt: nowIso(),
      });

      await this.state.markTrade();
      await this.state.setPairCooldown(signal.pair, Date.now() + settings.risk.cooldownMs);

      return `BUY simulated ${signal.pair} qty=${quantity.toFixed(8)}`;
    }

    try {
      const api = this.indodax.forAccount(account);
      const liveResult = await api.trade(signal.pair, 'buy', entryPrice, amountIdr);
      const exchangeOrderId = this.extractExchangeOrderId(liveResult.return);

      logger.info(
        { pair: signal.pair, accountId, exchangeOrderId, liveResult },
        'live buy order sent',
      );

      await this.orders.update(order.id, {
        exchangeOrderId,
        exchangeStatus: exchangeOrderId ? 'submitted' : 'submitted_without_order_id',
        exchangeUpdatedAt: nowIso(),
        notes: this.appendNotes(
          order.notes,
            exchangeOrderId ? `exchangeOrderId=${exchangeOrderId}` : 'exchangeOrderId=missing',
        ),
      });

      const synced = exchangeOrderId
        ? await this.syncLiveOrder(order.id)
        : await this.orders.markOpen(order.id);

      return this.formatLiveOrderMessage('BUY', synced ?? order);
    } catch (error) {
      await this.orders.reject(
        order.id,
        error instanceof Error ? error.message : 'live buy failed',
      );
      throw error;
    }
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
      marketPrice: request.price ?? 0,
      bestBid: request.price ?? 0,
      bestAsk: request.price ?? 0,
      liquidityScore: 100,
      change1m: 0,
      change5m: 0,
      contributions: [],
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

    if (closeQuantity <= 0) {
      throw new Error('Quantity sell tidak valid');
    }

    if (this.hasActiveOrder(position.pair, 'sell', position.accountId, position.id)) {
      throw new Error('Masih ada order SELL aktif untuk posisi ini');
    }

    const settings = this.settings.get();

    const order = await this.orders.create({
      accountId: position.accountId,
      pair: position.pair,
      side: 'sell',
      type: 'limit',
      price: exitPrice,
      quantity: closeQuantity,
      source,
      status: 'OPEN',
      relatedPositionId: position.id,
      notes: 'manual/exit sell',
    });

    if (this.shouldSimulate(settings.tradingMode, settings)) {
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
      await this.state.setPairCooldown(position.pair, Date.now() + settings.risk.cooldownMs);

      return `SELL simulated ${position.pair} qty=${closeQuantity.toFixed(8)} selesai`;
    }

    try {
      const account = this.accounts.getById(position.accountId);
      if (!account) {
        throw new Error('Account posisi tidak ditemukan');
      }

      const api = this.indodax.forAccount(account);
      const liveResult = await api.trade(position.pair, 'sell', exitPrice, closeQuantity);
      const exchangeOrderId = this.extractExchangeOrderId(liveResult.return);

      logger.info(
        { pair: position.pair, accountId: position.accountId, exchangeOrderId, liveResult },
        'live sell order sent',
      );

      await this.orders.update(order.id, {
        exchangeOrderId,
        exchangeStatus: exchangeOrderId ? 'submitted' : 'submitted_without_order_id',
        exchangeUpdatedAt: nowIso(),
        notes: this.appendNotes(
          order.notes,
          exchangeOrderId ? `exchangeOrderId=${exchangeOrderId}` : 'exchangeOrderId=missing',
        ),
      });

      const synced = exchangeOrderId
        ? await this.syncLiveOrder(order.id)
        : await this.orders.markOpen(order.id);

      return this.formatLiveOrderMessage('SELL', synced ?? order);
    } catch (error) {
      await this.orders.reject(
        order.id,
        error instanceof Error ? error.message : 'live sell failed',
      );
      throw error;
    }
  }

  async syncActiveOrders(): Promise<string[]> {
    const settings = this.settings.get();
    if (this.shouldSimulate(settings.tradingMode, settings)) {
      return [];
    }

    const activeOrders = this.orders
      .listActive()
      .filter((order) => Boolean(order.exchangeOrderId));
    const messages: string[] = [];
    const processedOrderIds = new Set<string>();
    const ordersByAccount = new Map<string, OrderRecord[]>();

    for (const order of activeOrders) {
      const current = ordersByAccount.get(order.accountId) ?? [];
      current.push(order);
      ordersByAccount.set(order.accountId, current);
    }

    for (const [accountId, accountOrders] of ordersByAccount.entries()) {
      try {
        const openOrders = await this.fetchOpenOrdersForAccount(accountId);

        for (const order of accountOrders) {
          if (!order.exchangeOrderId) {
            continue;
          }

          const openOrder = openOrders.get(order.exchangeOrderId);
          if (!openOrder) {
            continue;
          }

          processedOrderIds.add(order.id);
          const beforeStatus = order.status;
          const beforeFilled = order.filledQuantity;
          const snapshot = this.buildExchangeSnapshotFromOrderFields(order, openOrder.order, 'open');
          const tradeStats = await this.loadTradeStats(order);
          let synced = await this.syncOrderWithSnapshot(
            order,
            this.mergeTradeStatsIntoSnapshot(snapshot, tradeStats),
            'openOrders',
            tradeStats,
          );

          if (synced && this.shouldCancelStaleBuyOrder(synced)) {
            synced = await this.cancelStaleBuyOrder(synced);
          }

          if (
            synced &&
            (synced.status !== beforeStatus || synced.filledQuantity !== beforeFilled)
          ) {
            messages.push(
              this.formatLiveOrderMessage(
                synced.side.toUpperCase() as 'BUY' | 'SELL',
                synced,
              ),
            );
          }
        }
      } catch (error) {
        await this.journal.warn(
          'OPEN_ORDERS_SYNC_FAILED',
          error instanceof Error ? error.message : 'unknown openOrders sync failure',
          { accountId },
        );
      }
    }

    for (const activeOrder of activeOrders) {
      if (processedOrderIds.has(activeOrder.id)) {
        continue;
      }

      try {
        const beforeStatus = activeOrder.status;
        const beforeFilled = activeOrder.filledQuantity;
        let synced = await this.syncLiveOrder(activeOrder.id);

        if (synced && this.shouldCancelStaleBuyOrder(synced)) {
          synced = await this.cancelStaleBuyOrder(synced);
        }

        if (
          synced &&
          (synced.status !== beforeStatus || synced.filledQuantity !== beforeFilled)
        ) {
          messages.push(this.formatLiveOrderMessage(synced.side.toUpperCase() as 'BUY' | 'SELL', synced));
        }
      } catch (error) {
        await this.journal.error(
          'ORDER_SYNC_FAILED',
          error instanceof Error ? error.message : 'unknown order sync failure',
          {
            orderId: activeOrder.id,
            exchangeOrderId: activeOrder.exchangeOrderId,
            pair: activeOrder.pair,
          },
        );
      }
    }

    return messages;
  }

  async recoverLiveOrdersOnStartup(): Promise<string[]> {
    const settings = this.settings.get();
    if (this.shouldSimulate(settings.tradingMode, settings)) {
      return [];
    }

    const activeLiveOrders = this.orders
      .listActive()
      .filter((order) => Boolean(order.exchangeOrderId));

    if (activeLiveOrders.length === 0) {
      return [];
    }

    const messages = await this.syncActiveOrders();

    await this.journal.info(
      'LIVE_ORDER_RECOVERY_COMPLETED',
      'startup live order recovery completed',
      {
        activeLiveOrders: activeLiveOrders.length,
        updatedOrders: messages.length,
      },
    );

    return messages;
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
    const settings = this.settings.get();

    if (this.shouldSimulate(settings.tradingMode, settings)) {
      const count = await this.orders.cancelAll('emergency cancel all');
      return `Canceled ${count} active orders`;
    }

    let count = 0;

    for (const order of this.orders.listActive()) {
      const account = this.accounts.getById(order.accountId);

      if (order.exchangeOrderId && account) {
        const api = this.indodax.forAccount(account);
        await api.cancelOrder(order.pair, order.exchangeOrderId, order.side);
        await this.orders.update(order.id, {
          status: 'CANCELED',
          exchangeStatus: 'canceled',
          exchangeUpdatedAt: nowIso(),
          notes: this.appendNotes(order.notes, 'exchange cancel requested'),
        });
      } else {
        await this.orders.cancel(order.id, 'local cancel without exchange order id');
      }

      count += 1;
    }

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
