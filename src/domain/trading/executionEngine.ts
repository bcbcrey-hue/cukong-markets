import crypto from 'node:crypto';
import type {
  AutoExecutionDecision,
  BotSettings,
  ManualOrderRequest,
  OpportunityAssessment,
  OrderRecord,
  PositionRecord,
  SignalCandidate,
  ShadowRunCheckResult,
  ShadowRunEvidence,
  ShadowRunTelegramSummary,
  SummaryAccuracy,
  TradingMode,
} from '../../core/types';
import { getIndodaxHistoryMode } from '../../config/env';
import { errorMessage, toError } from '../../core/error-utils';
import { logger } from '../../core/logger';
import { nowIso } from '../../utils/time';
import { IndodaxClient } from '../../integrations/indodax/client';
import type {
  IndodaxGetOrderReturn,
  IndodaxOpenOrdersReturn,
  IndodaxOrderHistoryReturn,
  IndodaxPrivateRequestOptions,
  IndodaxTradeHistoryReturn,
  IndodaxTradeReturn,
} from '../../integrations/indodax/privateApi';
import { JournalService } from '../../services/journalService';
import { StateService } from '../../services/stateService';
import { SummaryService } from '../../services/summaryService';
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

interface CallbackReconcileInput {
  exchangeOrderId?: string | null;
  pair?: string | null;
  status?: string | null;
}

interface OrderHistorySearchWindow {
  startTime: number;
  endTime: number;
  label: string;
}

interface RunShadowOptions {
  pair?: string;
}

interface ShadowRunLifecycleState {
  status: ShadowRunTelegramSummary['shadowStatus'];
  runId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  blockReason: string | null;
  failureReason: string | null;
  evidenceArchive: ShadowRunTelegramSummary['evidenceArchive'];
  checks: {
    publicMarket: ShadowRunTelegramSummary['publicMarket'];
    privateAuth: ShadowRunTelegramSummary['privateAuth'];
    reconciliation: ShadowRunTelegramSummary['reconciliation'];
  };
}

export class ExecutionEngine {
  private static readonly SUBMISSION_UNCERTAIN_STALE_MS = 30 * 60 * 1000;

  private shadowRunTask: Promise<void> | null = null;
  private shadowRunState: ShadowRunLifecycleState = {
    status: 'IDLE',
    runId: null,
    startedAt: null,
    finishedAt: null,
    blockReason: null,
    failureReason: null,
    evidenceArchive: 'TIDAK DIUJI',
    checks: {
      publicMarket: 'TIDAK DIUJI',
      privateAuth: 'TIDAK DIUJI',
      reconciliation: 'TIDAK DIUJI',
    },
  };

  constructor(
    private readonly accounts: AccountRegistry,
    private readonly settings: SettingsService,
    private readonly state: StateService,
    private readonly risk: RiskEngine,
    private readonly indodax: IndodaxClient,
    private readonly positions: PositionManager,
    private readonly orders: OrderManager,
    private readonly journal: JournalService,
    private readonly summary: SummaryService,
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

  private getOrderAgeMs(order: OrderRecord): number | null {
    const createdAtMs = new Date(order.createdAt).getTime();
    if (!Number.isFinite(createdAtMs)) {
      return null;
    }
    return Math.max(0, Date.now() - createdAtMs);
  }

  private isSubmissionUncertainStale(order: OrderRecord): boolean {
    if (
      order.exchangeOrderId ||
      (order.exchangeStatus !== 'submission_uncertain' &&
        order.exchangeStatus !== 'submission_uncertain_unresolved')
    ) {
      return false;
    }

    const ageMs = this.getOrderAgeMs(order);
    return ageMs !== null && ageMs >= ExecutionEngine.SUBMISSION_UNCERTAIN_STALE_MS;
  }

  private getPrivateApi(accountId: string) {
    const account = this.accounts.getById(accountId);
    return account ? this.indodax.forAccount(account) : null;
  }

  private isAmbiguousSubmissionError(error: unknown): boolean {
    const normalized = toError(error);
    const message = normalized.message.toLowerCase();
    const name = normalized.name.toLowerCase();
    const code = String((normalized as Error & { code?: unknown }).code ?? '').toLowerCase();
    const markers = [
      'abort',
      'timeout',
      'timed out',
      'network',
      'fetch failed',
      'socket hang up',
      'econnreset',
      'etimedout',
      'eai_again',
      'enotfound',
      'ehostunreach',
      'enetunreach',
    ];

    return markers.some((marker) =>
      message.includes(marker) || name.includes(marker) || code.includes(marker),
    );
  }

  private normalizeExchangeSide(value: unknown): 'buy' | 'sell' | '' {
    if (typeof value !== 'string') {
      return '';
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'buy' || normalized === 'sell' ? normalized : '';
  }

  private isCloseNumber(expected: number, actual: number, tolerancePct = 0.03): boolean {
    if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected <= 0 || actual <= 0) {
      return false;
    }

    return Math.abs(actual - expected) / expected <= tolerancePct;
  }

  private deriveExecutionAccuracy(
    order: OrderRecord,
    tradeStats: ExchangeTradeStats | null,
    simulated = false,
  ): SummaryAccuracy {
    if (simulated) {
      return 'SIMULATED';
    }

    if (order.status === 'PARTIALLY_FILLED') {
      return 'PARTIAL_LIVE';
    }

    if (order.status === 'FILLED') {
      return tradeStats ? 'CONFIRMED_LIVE' : 'OPTIMISTIC_LIVE';
    }

    if ((order.status === 'CANCELED' || order.status === 'REJECTED') && order.filledQuantity > 1e-8) {
      return tradeStats ? 'PARTIAL_LIVE' : 'OPTIMISTIC_LIVE';
    }

    if (order.status === 'CANCELED' || order.status === 'REJECTED') {
      return 'CONFIRMED_LIVE';
    }

    return 'OPTIMISTIC_LIVE';
  }

  private async publishExecutionSummary(
    order: OrderRecord,
    accuracy: SummaryAccuracy,
    reason?: string,
  ): Promise<void> {
    await this.summary.publishExecutionSummary({ order, accuracy, reason });
  }

  private async publishTradeOutcomeSummary(
    position: PositionRecord | undefined,
    accuracy: SummaryAccuracy,
    closeReason: string,
  ): Promise<void> {
    if (!position || position.status !== 'CLOSED') {
      return;
    }

    await this.summary.publishTradeOutcomeSummary({
      position,
      accuracy,
      closeReason,
    });
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

  private isProbableExchangeOrderMatch(
    order: OrderRecord,
    exchangeOrder: Record<string, string | number>,
  ): boolean {
    const side = this.normalizeExchangeSide(exchangeOrder.type ?? exchangeOrder.side);
    if (side && side !== order.side) {
      return false;
    }

    const asset = this.baseAsset(order.pair);
    const quantity =
      this.toFiniteNumber(exchangeOrder[`order_${asset}`]) ??
      this.toFiniteNumber(exchangeOrder[asset]) ??
      this.toFiniteNumber(exchangeOrder.amount) ??
      this.toFiniteNumber(exchangeOrder.quantity);
    const price = this.toFiniteNumber(exchangeOrder.price);

    if (price !== null && !this.isCloseNumber(order.price, price)) {
      return false;
    }

    if (quantity !== null && !this.isCloseNumber(order.quantity, quantity)) {
      return false;
    }

    return true;
  }

  private findProbableOpenOrderMatch(
    order: OrderRecord,
    openOrders: Map<string, ExchangeOpenOrderMatch>,
  ): ExchangeOpenOrderMatch | null {
    const matches = Array.from(openOrders.values()).filter(
      (candidate) =>
        candidate.pair === order.pair && this.isProbableExchangeOrderMatch(order, candidate.order),
    );

    return matches.length === 1 ? matches[0] : null;
  }

  private findProbableOrderHistoryMatches(
    order: OrderRecord,
    payload: IndodaxOrderHistoryReturn,
  ): Array<Record<string, string | number>> {
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    return orders.filter((candidate) => this.isProbableExchangeOrderMatch(order, candidate));
  }

  private safeAccountLabel(accountId: string): string {
    const account = this.accounts.getById(accountId);
    const raw = account?.name?.trim() || accountId;
    const normalized = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
    const suffix = accountId.slice(-4);
    return `${normalized.slice(0, 12)}#${suffix}`;
  }

  private sanitizeError(error: unknown): { message: string; cause?: string } {
    const normalized = toError(error);
    const cause = normalized.cause instanceof Error ? normalized.cause.message : undefined;
    return {
      message: normalized.message,
      ...(cause ? { cause } : {}),
    };
  }

  private buildShadowCheck(
    input: Omit<ShadowRunCheckResult, 'pass'> & {
      pass?: boolean;
      error?: {
        message: string;
        cause?: string;
      };
    },
  ): ShadowRunCheckResult {
    return {
      ...input,
      pass: input.pass ?? !input.error,
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

  private findOrderHistoryMatch(
    order: OrderRecord,
    payload: IndodaxOrderHistoryReturn,
  ): Record<string, string | number> | null {
    const exchangeOrderId = order.exchangeOrderId ? String(order.exchangeOrderId) : null;
    if (!exchangeOrderId) {
      return null;
    }

    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    return (
      orders.find((candidate) => {
        const orderId = candidate.order_id;
        return orderId !== undefined && orderId !== null && String(orderId) === exchangeOrderId;
      }) ?? null
    );
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

  private parseIsoTimestamp(value?: string | null): number | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  private pushOrderHistoryWindow(
    windows: OrderHistorySearchWindow[],
    seen: Set<string>,
    startTime: number,
    endTime: number,
    label: string,
  ): void {
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return;
    }

    const normalizedStart = Math.max(0, Math.min(Math.trunc(startTime), Math.trunc(endTime)));
    const normalizedEnd = Math.max(Math.trunc(startTime), Math.trunc(endTime));
    if (normalizedEnd <= normalizedStart) {
      return;
    }

    const key = `${normalizedStart}:${normalizedEnd}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    windows.push({ startTime: normalizedStart, endTime: normalizedEnd, label });
  }

  private buildOrderHistorySearchWindows(order: OrderRecord): OrderHistorySearchWindow[] {
    const dayMs = 24 * 60 * 60 * 1000;
    const maxWindowMs = 7 * dayMs;
    const narrowOffsetMs = 12 * 60 * 60 * 1000;
    const wideOffsetMs = Math.floor(maxWindowMs / 2);
    const searchHorizonMs = 90 * dayMs;
    const nowMs = Date.now();
    const windows: OrderHistorySearchWindow[] = [];
    const seen = new Set<string>();
    const anchorCandidates = [
      { label: 'createdAt', timestamp: this.parseIsoTimestamp(order.createdAt) },
      { label: 'exchangeUpdatedAt', timestamp: this.parseIsoTimestamp(order.exchangeUpdatedAt) },
      { label: 'lastExecutedAt', timestamp: this.parseIsoTimestamp(order.lastExecutedAt) },
    ].filter((candidate): candidate is { label: string; timestamp: number } => candidate.timestamp !== null);

    const uniqueAnchors: Array<{ label: string; timestamp: number }> = [];
    for (const candidate of anchorCandidates) {
      if (uniqueAnchors.some((anchor) => anchor.timestamp === candidate.timestamp)) {
        continue;
      }

      uniqueAnchors.push(candidate);
    }

    const primaryAnchor = uniqueAnchors[0] ?? { label: 'fallbackNow', timestamp: nowMs };
    const searchAnchors = uniqueAnchors.length > 0 ? uniqueAnchors : [primaryAnchor];

    for (const anchor of searchAnchors) {
      this.pushOrderHistoryWindow(
        windows,
        seen,
        anchor.timestamp - narrowOffsetMs,
        anchor.timestamp + narrowOffsetMs,
        `${anchor.label}-narrow`,
      );
      this.pushOrderHistoryWindow(
        windows,
        seen,
        anchor.timestamp - wideOffsetMs,
        anchor.timestamp + wideOffsetMs,
        `${anchor.label}-wide`,
      );
    }

    const backwardLimit = Math.max(0, primaryAnchor.timestamp - searchHorizonMs);
    let backwardCursorEnd = primaryAnchor.timestamp - wideOffsetMs - 1;
    let backwardChunk = 1;
    while (backwardCursorEnd > backwardLimit) {
      const startTime = Math.max(backwardLimit, backwardCursorEnd - maxWindowMs + 1);
      this.pushOrderHistoryWindow(
        windows,
        seen,
        startTime,
        backwardCursorEnd,
        `backfill-${backwardChunk}`,
      );
      backwardCursorEnd = startTime - 1;
      backwardChunk += 1;
    }

    const forwardLimit = Math.min(nowMs + dayMs, primaryAnchor.timestamp + searchHorizonMs);
    let forwardCursorStart = primaryAnchor.timestamp + wideOffsetMs + 1;
    let forwardChunk = 1;
    while (forwardCursorStart < forwardLimit) {
      const endTime = Math.min(forwardLimit, forwardCursorStart + maxWindowMs - 1);
      this.pushOrderHistoryWindow(
        windows,
        seen,
        forwardCursorStart,
        endTime,
        `forward-${forwardChunk}`,
      );
      forwardCursorStart = endTime + 1;
      forwardChunk += 1;
    }

    return windows;
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
    const tradesSource = Array.isArray(payload.trades)
      ? payload.trades
      : Array.isArray(payload.trades?.[order.pair])
        ? payload.trades[order.pair]
        : Object.values(payload.trades ?? {}).flat();

    const matchingTrades = tradesSource.filter((trade) => {
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
      let feeCapturedFromSpecificField = false;

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
        feeCapturedFromSpecificField = true;
      }

      if (directFee !== null && !feeCapturedFromSpecificField) {
        feeAmount += directFee;
        feeAsset ??= this.quoteAsset(order.pair);
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
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<ExchangeTradeStats | null> {
    const mode = getIndodaxHistoryMode();

    if (mode === 'legacy') {
      return this.loadTradeStatsLegacy(order, requestOptions);
    }

    return this.loadTradeStatsV2(order, requestOptions);
  }

  private async loadTradeStatsLegacy(
    order: OrderRecord,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<ExchangeTradeStats | null> {
    const api = this.getPrivateApi(order.accountId);
    if (!api || typeof (api as { tradeHistory?: unknown }).tradeHistory !== 'function') {
      return null;
    }

    try {
      const response = await api.tradeHistory(order.pair, requestOptions);
      return this.extractTradeStats(order, response.return ?? {});
    } catch (error) {
      await this.journal.warn(
        'TRADE_HISTORY_SYNC_FAILED',
        error instanceof Error ? error.message : 'unknown tradeHistory sync failure',
        {
          orderId: order.id,
          exchangeOrderId: order.exchangeOrderId,
          pair: order.pair,
        },
      );
      return null;
    }
  }

  private async loadTradeStatsV2(
    order: OrderRecord,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<ExchangeTradeStats | null> {
    const api = this.getPrivateApi(order.accountId);
    if (!api || typeof (api as { myTradesV2?: unknown }).myTradesV2 !== 'function') {
      return null;
    }

    try {
      const response = await api.myTradesV2(
        {
          pair: order.pair,
          orderId: order.exchangeOrderId,
          limit: 1000,
          sort: 'asc',
        },
        requestOptions,
      );
      return this.extractTradeStats(order, response.return ?? {});
    } catch (error) {
      await this.journal.warn(
        'TRADE_HISTORY_V2_SYNC_FAILED',
        error instanceof Error ? error.message : 'unknown myTrades v2 sync failure',
        {
          orderId: order.id,
          exchangeOrderId: order.exchangeOrderId,
          pair: order.pair,
        },
      );
      return null;
    }
  }

  private async loadOrderHistorySnapshot(
    order: OrderRecord,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<{ snapshot: ExchangeOrderSnapshot | null; source: 'orderHistory' | 'orderHistoryV2' | null }> {
    const mode = getIndodaxHistoryMode();

    if (mode === 'legacy') {
      const legacySnapshot = await this.loadOrderHistorySnapshotLegacy(order, requestOptions);
      return {
        snapshot: legacySnapshot,
        source: legacySnapshot ? 'orderHistory' : null,
      };
    }

    return {
      snapshot: await this.loadOrderHistorySnapshotV2(order, requestOptions),
      source: 'orderHistoryV2',
    };
  }

  private async loadOrderHistorySnapshotLegacy(
    order: OrderRecord,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<ExchangeOrderSnapshot | null> {
    const api = this.getPrivateApi(order.accountId);
    if (!api || typeof (api as { orderHistory?: unknown }).orderHistory !== 'function') {
      return null;
    }

    try {
      const response = await api.orderHistory(order.pair, requestOptions);
      const match = this.findOrderHistoryMatch(order, response.return ?? {});
      return match ? this.buildExchangeSnapshotFromOrderFields(order, match, 'closed') : null;
    } catch (error) {
      await this.journal.warn(
        'ORDER_HISTORY_SYNC_FAILED',
        error instanceof Error ? error.message : 'unknown orderHistory sync failure',
        {
          orderId: order.id,
          exchangeOrderId: order.exchangeOrderId,
          pair: order.pair,
        },
      );
      return null;
    }
  }

  private async loadOrderHistorySnapshotV2(
    order: OrderRecord,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<ExchangeOrderSnapshot | null> {
    const api = this.getPrivateApi(order.accountId);
    if (!api || typeof (api as { orderHistoriesV2?: unknown }).orderHistoriesV2 !== 'function') {
      return null;
    }

    const windows = this.buildOrderHistorySearchWindows(order);
    const lastWindow = windows[windows.length - 1] ?? null;

    try {
      for (let index = 0; index < windows.length; index += 1) {
        const window = windows[index];
        const response = await api.orderHistoriesV2(
          {
            pair: order.pair,
            startTime: window.startTime,
            endTime: window.endTime,
            limit: 1000,
            sort: 'asc',
          },
          requestOptions,
        );
        const match = this.findOrderHistoryMatch(order, response.return ?? {});
        if (!match) {
          continue;
        }

        if (index > 0) {
          await this.journal.info(
            'ORDER_HISTORY_V2_MATCHED_WINDOW',
            'target order ditemukan lewat windowed search order history v2',
            {
              orderId: order.id,
              exchangeOrderId: order.exchangeOrderId,
              pair: order.pair,
              attempts: index + 1,
              matchedWindow: window.label,
              startTime: window.startTime,
              endTime: window.endTime,
            },
          );
        }

        return this.buildExchangeSnapshotFromOrderFields(order, match, 'closed');
      }

      await this.journal.warn(
        'ORDER_HISTORY_V2_ORDER_NOT_FOUND',
        'target order tidak ditemukan pada bounded windowed search order history v2',
        {
          orderId: order.id,
          exchangeOrderId: order.exchangeOrderId,
          pair: order.pair,
          attemptedWindows: windows.length,
          firstWindowStartTime: windows[0]?.startTime ?? null,
          firstWindowEndTime: windows[0]?.endTime ?? null,
          lastWindowStartTime: lastWindow?.startTime ?? null,
          lastWindowEndTime: lastWindow?.endTime ?? null,
        },
      );
      return null;
    } catch (error) {
      await this.journal.warn(
        'ORDER_HISTORY_V2_SYNC_FAILED',
        error instanceof Error ? error.message : 'unknown order histories v2 sync failure',
        {
          orderId: order.id,
          exchangeOrderId: order.exchangeOrderId,
          pair: order.pair,
        },
      );
      return null;
    }
  }

  private buildTradeStatsFallbackSnapshot(
    order: OrderRecord,
    tradeStats: ExchangeTradeStats | null,
  ): ExchangeOrderSnapshot | null {
    if (!tradeStats || tradeStats.filledQuantity === null) {
      return null;
    }

    const filledQuantity = Math.max(order.filledQuantity, tradeStats.filledQuantity);
    if (filledQuantity <= order.filledQuantity + 1e-8) {
      return null;
    }

    const isFilled = filledQuantity >= order.quantity - 1e-8;

    return {
      exchangeStatus: isFilled ? 'filled_from_my_trades_v2' : 'partial_from_my_trades_v2',
      filledQuantity: Math.min(order.quantity, filledQuantity),
      remainingQuantity: Math.max(0, order.quantity - filledQuantity),
      averageFillPrice: tradeStats.averageFillPrice ?? order.averageFillPrice ?? order.price,
    };
  }

  private async markSubmissionUncertain(
    order: OrderRecord,
    side: 'buy' | 'sell',
    error: unknown,
  ): Promise<OrderRecord | undefined> {
    const uncertainOrder = await this.orders.update(order.id, {
      status: 'OPEN',
      exchangeStatus: 'submission_uncertain',
      exchangeUpdatedAt: nowIso(),
      notes: this.appendNotes(order.notes, `${side} submission uncertain: ${errorMessage(error)}`),
    });

    if (!uncertainOrder) {
      return uncertainOrder;
    }

    await this.publishExecutionSummary(
      uncertainOrder,
      'UNCERTAIN_LIVE',
      `${side} submission uncertain after transport error`,
    );
    await this.journal.warn(
      'LIVE_ORDER_SUBMISSION_UNCERTAIN',
      `${side} submission uncertain; reconciliation required`,
      {
        orderId: uncertainOrder.id,
        pair: uncertainOrder.pair,
        accountId: uncertainOrder.accountId,
        error: errorMessage(error),
      },
    );

    return uncertainOrder;
  }

  private async markSubmissionUncertainUnresolved(
    order: OrderRecord,
    reason: string,
  ): Promise<OrderRecord | undefined> {
    if (order.exchangeStatus === 'submission_uncertain_unresolved') {
      return order;
    }

    const unresolvedOrder = await this.orders.update(order.id, {
      status: 'OPEN',
      exchangeStatus: 'submission_uncertain_unresolved',
      exchangeUpdatedAt: nowIso(),
      notes: this.appendNotes(order.notes, reason),
    });

    if (!unresolvedOrder) {
      return unresolvedOrder;
    }

    await this.publishExecutionSummary(
      unresolvedOrder,
      'UNRESOLVED_LIVE',
      reason,
    );
    await this.journal.warn(
      'LIVE_ORDER_SUBMISSION_UNCERTAIN_FLAGGED_UNRESOLVED',
      reason,
      {
        orderId: unresolvedOrder.id,
        pair: unresolvedOrder.pair,
        accountId: unresolvedOrder.accountId,
      },
    );

    return unresolvedOrder;
  }

  private async resolveSubmissionUncertainFromHistory(
    order: OrderRecord,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<OrderRecord | undefined> {
    const api = this.getPrivateApi(order.accountId);
    if (!api) {
      return order;
    }

    const probableMatches: Array<Record<string, string | number>> = [];
    const mode = getIndodaxHistoryMode();

    if (mode === 'legacy') {
      if (typeof (api as { orderHistory?: unknown }).orderHistory !== 'function') {
        return order;
      }

      const response = await api.orderHistory(order.pair, requestOptions);
      probableMatches.push(...this.findProbableOrderHistoryMatches(order, response.return ?? {}));
    } else {
      if (typeof (api as { orderHistoriesV2?: unknown }).orderHistoriesV2 !== 'function') {
        return order;
      }

      const windows = this.buildOrderHistorySearchWindows(order).slice(0, 8);
      for (const window of windows) {
        const response = await api.orderHistoriesV2(
          {
            pair: order.pair,
            startTime: window.startTime,
            endTime: window.endTime,
            limit: 1000,
            sort: 'asc',
          },
          requestOptions,
        );
        probableMatches.push(...this.findProbableOrderHistoryMatches(order, response.return ?? {}));
      }
    }

    const uniqueMatches = probableMatches.filter(
      (candidate, index, items) =>
        items.findIndex(
          (item) => String(item.order_id ?? '') === String(candidate.order_id ?? ''),
        ) === index,
    );

    if (uniqueMatches.length !== 1) {
      return order;
    }

    const historyMatch = uniqueMatches[0];
    const exchangeOrderId = String(historyMatch.order_id ?? '');
    if (!exchangeOrderId) {
      return order;
    }

    const attached = await this.orders.update(order.id, {
      exchangeOrderId,
      exchangeStatus: 'matched_from_order_history_after_submission_uncertain',
      exchangeUpdatedAt: nowIso(),
      notes: this.appendNotes(order.notes, `exchangeOrderId=${exchangeOrderId}`),
    });

    if (!attached) {
      return attached;
    }

    const tradeStats = await this.loadTradeStats(attached, requestOptions);
    return this.syncOrderWithSnapshot(
      attached,
      this.mergeTradeStatsIntoSnapshot(
        this.buildExchangeSnapshotFromOrderFields(attached, historyMatch, 'closed'),
        tradeStats,
      ),
      mode === 'legacy' ? 'orderHistory' : 'orderHistoryV2',
      tradeStats,
    );
  }

  private async resolveSubmissionUncertainOrder(
    order: OrderRecord,
    openOrders?: Map<string, ExchangeOpenOrderMatch>,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<OrderRecord | undefined> {
    if (
      order.exchangeOrderId ||
      (order.exchangeStatus !== 'submission_uncertain' &&
        order.exchangeStatus !== 'submission_uncertain_unresolved')
    ) {
      return order;
    }

    const accountOpenOrders =
      openOrders ?? (await this.fetchOpenOrdersForAccount(order.accountId, requestOptions));
    const probableOpenOrder = this.findProbableOpenOrderMatch(order, accountOpenOrders);

    if (probableOpenOrder) {
      const exchangeOrderId = String(probableOpenOrder.order.order_id ?? '');
      const attached = await this.orders.update(order.id, {
        exchangeOrderId,
        exchangeStatus: 'matched_from_open_orders_after_submission_uncertain',
        exchangeUpdatedAt: nowIso(),
        notes: this.appendNotes(order.notes, `exchangeOrderId=${exchangeOrderId}`),
      });

      if (!attached) {
        return attached;
      }

      const tradeStats = await this.loadTradeStats(attached, requestOptions);
      return this.syncOrderWithSnapshot(
        attached,
        this.mergeTradeStatsIntoSnapshot(
          this.buildExchangeSnapshotFromOrderFields(attached, probableOpenOrder.order, 'open'),
          tradeStats,
        ),
        'openOrders',
        tradeStats,
      );
    }

    try {
      const resolvedFromHistory = await this.resolveSubmissionUncertainFromHistory(order, requestOptions);
      if (resolvedFromHistory?.exchangeOrderId) {
        return resolvedFromHistory;
      }
    } catch (error) {
      await this.journal.warn(
        'LIVE_ORDER_SUBMISSION_UNCERTAIN_HISTORY_LOOKUP_FAILED',
        errorMessage(error),
        {
          orderId: order.id,
          pair: order.pair,
          accountId: order.accountId,
        },
      );
    }

    await this.journal.warn(
      'LIVE_ORDER_SUBMISSION_UNCERTAIN_UNRESOLVED',
      'submission uncertain belum dapat direkonsiliasi otomatis',
      {
        orderId: order.id,
        pair: order.pair,
        accountId: order.accountId,
      },
    );

    if (this.isSubmissionUncertainStale(order)) {
      return this.markSubmissionUncertainUnresolved(
        order,
        'submission uncertain unresolved >30m; OPEN safety-blocking tetap aktif. Operator WAJIB verifikasi exchange order langsung sebelum tindakan lanjutan.',
      );
    }

    return order;
  }

  private async syncOrderWithSnapshot(
    order: OrderRecord,
    snapshot: ExchangeOrderSnapshot,
    source: 'getOrder' | 'openOrders' | 'orderHistory' | 'orderHistoryV2' | 'myTradesV2Fallback',
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

    const affectedPosition = await this.applyFillDelta(
      order,
      nextFilledQuantity,
      deltaExecutionPrice,
      feeDelta,
    );

    const nextStatus = this.mapExchangeStatus(snapshot, order.quantity);

    const updatedOrder = await this.orders.update(order.id, {
      status: nextStatus,
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

    if (!updatedOrder) {
      return updatedOrder;
    }

    const shouldPublishExecutionSummary =
      updatedOrder.status !== order.status ||
      Math.abs(updatedOrder.filledQuantity - order.filledQuantity) > 1e-8;

    if (shouldPublishExecutionSummary) {
      const accuracy = this.deriveExecutionAccuracy(updatedOrder, tradeStats);
      await this.publishExecutionSummary(updatedOrder, accuracy, updatedOrder.notes);

      if (updatedOrder.side === 'sell') {
        await this.publishTradeOutcomeSummary(
          affectedPosition,
          accuracy,
          updatedOrder.closeReason ?? updatedOrder.notes ?? 'SELL_FILLED',
        );
      }
    }

    return updatedOrder;
  }

  private async fetchOpenOrdersForAccount(
    accountId: string,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<Map<string, ExchangeOpenOrderMatch>> {
    const account = this.accounts.getById(accountId);
    if (!account) {
      return new Map();
    }

    const api = this.indodax.forAccount(account);
    if (typeof (api as { openOrders?: unknown }).openOrders !== 'function') {
      return new Map();
    }

    const response = await api.openOrders(undefined, requestOptions);
    return this.flattenOpenOrders(response.return ?? {});
  }

  private async applyFillDelta(
    order: OrderRecord,
    nextFilledQuantity: number,
    executionPrice: number,
    feeDelta = 0,
  ): Promise<PositionRecord | undefined> {
    const deltaFilled = Math.max(0, nextFilledQuantity - order.filledQuantity);
    if (deltaFilled <= 1e-8) {
      return undefined;
    }

    let updatedPosition: PositionRecord | undefined;

    if (order.side === 'buy') {
      const stops = this.risk.buildStops(executionPrice, this.settings.get());
      updatedPosition = await this.positions.applyBuyFill({
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
        updatedPosition = await this.positions.closePartial(
          targetPosition.id,
          deltaFilled,
          executionPrice,
          feeDelta,
        );
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
    return updatedPosition;
  }

  private async syncLiveOrder(
    orderId: string,
    requestOptions?: IndodaxPrivateRequestOptions,
  ): Promise<OrderRecord | undefined> {
    const order = this.orders.getById(orderId);
    if (!order?.exchangeOrderId) {
      return order;
    }

    const account = this.accounts.getById(order.accountId);
    if (!account) {
      return order;
    }

    const api = this.indodax.forAccount(account);
    const tradeStats = await this.loadTradeStats(order, requestOptions);
    let snapshot: ExchangeOrderSnapshot | null = null;
    let source: 'getOrder' | 'orderHistory' | 'orderHistoryV2' | 'myTradesV2Fallback' = 'getOrder';

    try {
      const response = await api.getOrder(order.pair, order.exchangeOrderId, requestOptions);
      snapshot = this.buildExchangeSnapshot(order, response.return ?? {});
    } catch (error) {
      await this.journal.warn(
        'GET_ORDER_SYNC_FAILED',
        error instanceof Error ? error.message : 'unknown getOrder sync failure',
        {
          orderId: order.id,
          exchangeOrderId: order.exchangeOrderId,
          pair: order.pair,
        },
      );
    }

    if (!snapshot) {
      const historySnapshot = await this.loadOrderHistorySnapshot(order, requestOptions);
      snapshot = historySnapshot.snapshot;
      if (historySnapshot.source) {
        source = historySnapshot.source;
      }
    }

    if (!snapshot) {
      snapshot = this.buildTradeStatsFallbackSnapshot(order, tradeStats);
      if (snapshot) {
        source = 'myTradesV2Fallback';
      }
    }

    if (!snapshot) {
      throw new Error(`Unable to reconcile live order ${order.exchangeOrderId}`);
    }

    return this.syncOrderWithSnapshot(
      order,
      this.mergeTradeStatsIntoSnapshot(snapshot, tradeStats),
      source,
      tradeStats,
    );
  }

  async reconcileFromCallback(input: CallbackReconcileInput): Promise<string | null> {
    const exchangeOrderId = input.exchangeOrderId ? String(input.exchangeOrderId) : '';
    if (!exchangeOrderId) {
      return null;
    }

    const target = this.orders
      .listActive()
      .find((order) => order.exchangeOrderId && String(order.exchangeOrderId) === exchangeOrderId);

    if (!target) {
      return null;
    }

    try {
      const beforeStatus = target.status;
      const beforeFilled = target.filledQuantity;
      const synced = await this.syncLiveOrder(target.id);

      if (!synced) {
        return null;
      }

      if (synced.status !== beforeStatus || Math.abs(synced.filledQuantity - beforeFilled) > 1e-8) {
        return this.formatLiveOrderMessage(synced.side.toUpperCase() as 'BUY' | 'SELL', synced);
      }

      return `${synced.side.toUpperCase()} callback sync ${synced.pair} unchanged status=${synced.status}`;
    } catch (error) {
      await this.journal.warn(
        'CALLBACK_RECONCILIATION_FAILED',
        error instanceof Error ? error.message : 'unknown callback reconciliation failure',
        {
          exchangeOrderId,
          pair: input.pair ?? null,
          exchangeStatus: input.status ?? null,
        },
      );
      return null;
    }
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

  private validateBuyIntent(
    candidate: ExecutionCandidate,
    amountIdr: number,
    settings: BotSettings,
  ): { entryPrice: number; referencePrice: number; quantity: number } {
    if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
      throw new Error(`Notional BUY tidak valid untuk ${candidate.pair}`);
    }

    const referencePrice = this.getBuyReferencePrice(candidate);
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      throw new Error(`Harga referensi BUY tidak valid untuk ${candidate.pair}`);
    }

    const entryPrice = this.getAggressiveBuyLimitPrice(candidate, settings);
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      throw new Error(`Harga entry BUY tidak valid untuk ${candidate.pair}`);
    }

    const quantity = amountIdr / entryPrice;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Quantity BUY tidak valid untuk ${candidate.pair}`);
    }

    return {
      entryPrice,
      referencePrice,
      quantity,
    };
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

    const canceledOrder = await this.orders.update(order.id, {
      status: 'CANCELED',
      exchangeStatus: 'canceled_after_timeout',
      exchangeUpdatedAt: nowIso(),
      notes: this.appendNotes(order.notes, 'buy remainder canceled after timeout'),
    });

    if (canceledOrder) {
      await this.publishExecutionSummary(
        canceledOrder,
        canceledOrder.filledQuantity > 1e-8 ? 'PARTIAL_LIVE' : 'CONFIRMED_LIVE',
        'buy remainder canceled after timeout',
      );
    }

    return canceledOrder;
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
      if (candidate.recommendedAction === 'SCOUT_ENTER') {
        return {
          shouldEnter: true,
          shouldExit: false,
          action: 'SCOUT_ENTER',
          reasons: ['Opportunity scout lane aktif'],
        };
      }

      if (candidate.recommendedAction === 'ADD_ON_CONFIRM') {
        return {
          shouldEnter: true,
          shouldExit: false,
          action: 'ADD_ON_CONFIRM',
          reasons: ['Opportunity continuation mengizinkan add-on'],
        };
      }

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

      if (
        candidate.entryTiming.state === 'LATE' ||
        candidate.entryTiming.state === 'AVOID' ||
        candidate.entryTiming.state === 'CHASING' ||
        candidate.entryTiming.state === 'DEAD'
      ) {
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

    if (this.hasActiveOrder(signal.pair, 'buy', account.id)) {
      return `skip auto-buy ${signal.pair}: active BUY order already exists`;
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
    const executionAmountIdr = riskResult.adjustedAmountIdr ?? amountIdr;

    const { entryPrice, referencePrice, quantity } = this.validateBuyIntent(
      signal,
      executionAmountIdr,
      settings,
    );
    const stops = this.risk.buildStops(entryPrice, settings);

    const order = await this.orders.create({
      accountId,
      pair: signal.pair,
      side: 'buy',
      type: 'limit',
      price: entryPrice,
      quantity,
      source,
      referencePrice,
      status: 'OPEN',
      notes: this.getCandidateNotes(signal),
    });

    if (this.shouldSimulate(settings.tradingMode, settings)) {
      await this.publishExecutionSummary(order, 'SIMULATED', 'simulated buy submitted');

      const filledOrder = await this.orders.markFilled(order.id, quantity, entryPrice);

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

      if (filledOrder) {
        await this.publishExecutionSummary(filledOrder, 'SIMULATED', 'simulated buy filled');
      }

      await this.state.markTrade();
      await this.state.setPairCooldown(signal.pair, Date.now() + settings.risk.cooldownMs);

      return `BUY simulated ${signal.pair} qty=${quantity.toFixed(8)}`;
    }

    try {
      const api = this.indodax.forAccount(account);
      const liveResult = await api.trade(signal.pair, 'buy', entryPrice, executionAmountIdr);
      const exchangeOrderId = this.extractExchangeOrderId(liveResult.return);

      logger.info(
        { pair: signal.pair, accountId, exchangeOrderId, liveResult },
        'live buy order sent',
      );

      const submittedOrder = await this.orders.update(order.id, {
        exchangeOrderId,
        exchangeStatus: exchangeOrderId ? 'submitted' : 'submitted_without_order_id',
        exchangeUpdatedAt: nowIso(),
        notes: this.appendNotes(
          order.notes,
            exchangeOrderId ? `exchangeOrderId=${exchangeOrderId}` : 'exchangeOrderId=missing',
        ),
      });

      if (submittedOrder) {
        await this.publishExecutionSummary(submittedOrder, 'OPTIMISTIC_LIVE', 'buy submitted to exchange');
      }

      const synced = exchangeOrderId
        ? await this.syncLiveOrder(order.id)
        : await this.orders.markOpen(order.id);

      return this.formatLiveOrderMessage('BUY', synced ?? order);
    } catch (error) {
      if (this.isAmbiguousSubmissionError(error)) {
        const uncertainOrder = await this.markSubmissionUncertain(order, 'buy', error);
        const reconciledOrder = uncertainOrder
          ? await this.resolveSubmissionUncertainOrder(uncertainOrder)
          : uncertainOrder;

        if (reconciledOrder?.exchangeOrderId) {
          return this.formatLiveOrderMessage('BUY', reconciledOrder);
        }

        return `BUY live ${signal.pair} submission uncertain; reconciliation pending`;
      }

      const rejectedOrder = await this.orders.reject(
        order.id,
        error instanceof Error ? error.message : 'live buy failed',
      );
      if (rejectedOrder) {
        await this.publishExecutionSummary(
          rejectedOrder,
          'CONFIRMED_LIVE',
          error instanceof Error ? error.message : 'live buy failed',
        );
      }
      throw error;
    }
  }

  async manualOrder(request: ManualOrderRequest): Promise<string> {
    if (request.quantity <= 0) {
      throw new Error('Quantity order harus lebih besar dari 0');
    }

    const signalLike: SignalCandidate = {
      pair: request.pair,
      score: 100,
      confidence: 1,
      reasons: ['manual order'],
      warnings: [],
      regime: 'BREAKOUT_SETUP',
      breakoutPressure: 10,
      quoteFlowAccelerationScore: 10,
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
      if (!request.price || request.price <= 0) {
        throw new Error('Manual BUY wajib menyertakan price yang valid agar notional tidak nol');
      }

      const notional = request.price * request.quantity;
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
    closeReason = source === 'AUTO' ? 'AUTO_EXIT' : 'MANUAL_SELL',
  ): Promise<string> {
    const position = this.positions.getById(positionId);
    if (!position || position.status === 'CLOSED') {
      throw new Error('Position tidak ditemukan');
    }

    const exitPrice = position.currentPrice || position.averageEntryPrice;
    const closeQuantity = Math.max(0, Math.min(position.quantity, quantityToSell));

    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      throw new Error('Harga SELL tidak valid untuk posisi ini');
    }

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
      referencePrice: exitPrice,
      relatedPositionId: position.id,
      closeReason,
      notes: 'manual/exit sell',
    });

    if (this.shouldSimulate(settings.tradingMode, settings)) {
      await this.publishExecutionSummary(order, 'SIMULATED', `${closeReason} submitted`);

      const filledOrder = await this.orders.markFilled(order.id, closeQuantity, exitPrice);
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

      if (filledOrder) {
        await this.publishExecutionSummary(filledOrder, 'SIMULATED', `${closeReason} filled`);
      }
      await this.publishTradeOutcomeSummary(updated, 'SIMULATED', closeReason);

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

      const submittedOrder = await this.orders.update(order.id, {
        exchangeOrderId,
        exchangeStatus: exchangeOrderId ? 'submitted' : 'submitted_without_order_id',
        exchangeUpdatedAt: nowIso(),
        notes: this.appendNotes(
          order.notes,
          exchangeOrderId ? `exchangeOrderId=${exchangeOrderId}` : 'exchangeOrderId=missing',
        ),
      });

      if (submittedOrder) {
        await this.publishExecutionSummary(submittedOrder, 'OPTIMISTIC_LIVE', `${closeReason} submitted`);
      }

      const synced = exchangeOrderId
        ? await this.syncLiveOrder(order.id)
        : await this.orders.markOpen(order.id);

      return this.formatLiveOrderMessage('SELL', synced ?? order);
    } catch (error) {
      if (this.isAmbiguousSubmissionError(error)) {
        const uncertainOrder = await this.markSubmissionUncertain(order, 'sell', error);
        const reconciledOrder = uncertainOrder
          ? await this.resolveSubmissionUncertainOrder(uncertainOrder)
          : uncertainOrder;

        if (reconciledOrder?.exchangeOrderId) {
          return this.formatLiveOrderMessage('SELL', reconciledOrder);
        }

        return `SELL live ${position.pair} submission uncertain; reconciliation pending`;
      }

      const rejectedOrder = await this.orders.reject(
        order.id,
        error instanceof Error ? error.message : 'live sell failed',
      );
      if (rejectedOrder) {
        await this.publishExecutionSummary(
          rejectedOrder,
          'CONFIRMED_LIVE',
          error instanceof Error ? error.message : 'live sell failed',
        );
      }
      throw error;
    }
  }

  private aggregateShadowCheckStatus(
    evidences: ShadowRunEvidence[],
    check: ShadowRunCheckResult['check'],
  ): ShadowRunTelegramSummary['publicMarket'] {
    const checks = evidences.flatMap((item) => item.checks).filter((item) => item.check === check);
    if (checks.length === 0) {
      return 'TIDAK DIUJI';
    }

    return checks.every((item) => item.pass) ? 'LULUS' : 'GAGAL';
  }

  private computeNextSteps(
    summary: Pick<
      ShadowRunTelegramSummary,
      | 'runtimeStatus'
      | 'shadowStatus'
      | 'publicMarket'
      | 'privateAuth'
      | 'reconciliation'
      | 'evidenceArchive'
      | 'hotlistSignalOpportunity'
      | 'intelligenceSpoofPattern'
    >,
  ): string[] {
    const steps: string[] = [];

    if (summary.runtimeStatus === 'RUNNING') {
      steps.push('Stop runtime utama dulu sebelum jalankan shadow-run.');
    }
    if (summary.privateAuth === 'GAGAL') {
      steps.push('Periksa kredensial akun/API key dan izin private endpoint.');
    }
    if (summary.publicMarket === 'GAGAL') {
      steps.push('Periksa konektivitas endpoint market publik Indodax.');
    }
    if (summary.reconciliation === 'GAGAL') {
      steps.push('Periksa endpoint read-model (openOrders/orderHistory) dan pair uji.');
    }
    if (summary.evidenceArchive === 'GAGAL TERSIMPAN') {
      steps.push('Periksa permission/storage data/history untuk arsip evidence.');
    }
    if (summary.hotlistSignalOpportunity === 'TIDAK TERSEDIA') {
      steps.push('Jalankan observasi market watcher agar hotlist/signal/opportunity terisi.');
    }
    if (summary.intelligenceSpoofPattern === 'TIDAK TERSEDIA') {
      steps.push('Tunggu snapshot intelligence berikutnya untuk spoof/pattern.');
    }

    return steps.slice(0, 4);
  }

  getShadowRunTelegramSummary(): ShadowRunTelegramSummary {
    const runtimeRaw = this.state.get().status;
    const runtimeStatus: ShadowRunTelegramSummary['runtimeStatus'] =
      runtimeRaw === 'RUNNING' || runtimeRaw === 'STARTING' ? 'RUNNING' : 'STOPPED';
    const opportunities = this.state.get().lastOpportunities;
    const hotlistSignalOpportunity: ShadowRunTelegramSummary['hotlistSignalOpportunity'] =
      this.state.get().lastHotlist.length > 0 &&
        this.state.get().lastSignals.length > 0 &&
        opportunities.length > 0
        ? 'TERSEDIA'
        : 'TIDAK TERSEDIA';
    const intelligenceSpoofPattern: ShadowRunTelegramSummary['intelligenceSpoofPattern'] = opportunities.some(
      (item) => Number.isFinite(item.spoofRisk) && typeof item.historicalMatchSummary === 'string',
    )
      ? 'TERSEDIA'
      : 'TIDAK TERSEDIA';

    const shadowStatus = this.shadowRunState.status;
    const checks = this.shadowRunState.checks;
    let verdict: ShadowRunTelegramSummary['verdict'] = 'BELUM SIAP';
    if (shadowStatus === 'DIBLOK') {
      verdict = 'DIBLOK';
    } else if (
      shadowStatus === 'SELESAI' &&
      checks.publicMarket === 'LULUS' &&
      checks.privateAuth === 'LULUS' &&
      checks.reconciliation === 'LULUS' &&
      this.shadowRunState.evidenceArchive === 'TERSIMPAN'
    ) {
      verdict = 'SIAP SHADOW-RUN AMAN';
    } else if (runtimeStatus === 'STOPPED') {
      verdict = 'SIAP CEK OBSERVASI';
    }

    const summary: ShadowRunTelegramSummary = {
      runtimeStatus,
      runtimeDetail: runtimeRaw,
      shadowStatus,
      runId: this.shadowRunState.runId,
      startedAt: this.shadowRunState.startedAt,
      finishedAt: this.shadowRunState.finishedAt,
      blockReason: this.shadowRunState.blockReason,
      failureReason: this.shadowRunState.failureReason,
      publicMarket: checks.publicMarket,
      privateAuth: checks.privateAuth,
      reconciliation: checks.reconciliation,
      hotlistSignalOpportunity,
      intelligenceSpoofPattern,
      evidenceArchive: this.shadowRunState.evidenceArchive,
      verdict,
      nextSteps: [],
    };
    summary.nextSteps = this.computeNextSteps(summary);
    return summary;
  }

  triggerShadowRunFromTelegram(options: RunShadowOptions = {}): ShadowRunTelegramSummary {
    const runtimeRaw = this.state.get().status;
    if (runtimeRaw === 'RUNNING' || runtimeRaw === 'STARTING') {
      this.shadowRunState = {
        ...this.shadowRunState,
        status: 'DIBLOK',
        blockReason: 'Runtime utama masih RUNNING/STARTING. Stop runtime dulu untuk shadow-run aman.',
        failureReason: null,
        finishedAt: new Date().toISOString(),
        checks: {
          publicMarket: 'DIBLOK',
          privateAuth: 'DIBLOK',
          reconciliation: 'DIBLOK',
        },
      };
      return this.getShadowRunTelegramSummary();
    }

    if (this.shadowRunTask) {
      return this.getShadowRunTelegramSummary();
    }

    const startedAt = new Date().toISOString();
    this.shadowRunState = {
      status: 'BERJALAN',
      runId: null,
      startedAt,
      finishedAt: null,
      blockReason: null,
      failureReason: null,
      evidenceArchive: 'TIDAK DIUJI',
      checks: {
        publicMarket: 'TIDAK DIUJI',
        privateAuth: 'TIDAK DIUJI',
        reconciliation: 'TIDAK DIUJI',
      },
    };

    this.shadowRunTask = (async () => {
      try {
        const evidences = await this.runLiveShadowRun(options);
        const runId = evidences[0]?.runId ?? null;
        this.shadowRunState = {
          ...this.shadowRunState,
          status: 'SELESAI',
          runId,
          finishedAt: new Date().toISOString(),
          evidenceArchive: 'TERSIMPAN',
          checks: {
            publicMarket: this.aggregateShadowCheckStatus(evidences, 'public_market'),
            privateAuth: this.aggregateShadowCheckStatus(evidences, 'private_auth'),
            reconciliation: this.aggregateShadowCheckStatus(evidences, 'reconciliation_read_model'),
          },
        };
      } catch (error) {
        this.shadowRunState = {
          ...this.shadowRunState,
          status: 'GAGAL',
          finishedAt: new Date().toISOString(),
          evidenceArchive: 'GAGAL TERSIMPAN',
          failureReason: this.sanitizeError(error).message,
        };
      } finally {
        this.shadowRunTask = null;
      }
    })();

    return this.getShadowRunTelegramSummary();
  }

  async runLiveShadowRun(options: RunShadowOptions = {}): Promise<ShadowRunEvidence[]> {
    const pair = (options.pair ?? 'btc_idr').toLowerCase();
    const now = new Date().toISOString();
    const runId = `shadow-${crypto.randomUUID()}`;
    const accounts = this.accounts.listEnabled();

    if (accounts.length === 0) {
      const evidence: ShadowRunEvidence = {
        runId,
        timestamp: now,
        exchange: 'indodax',
        account: 'no-enabled-account',
        allPassed: false,
        checks: [
          this.buildShadowCheck({
            check: 'private_auth',
            endpoint: 'POST /tapi method=getInfo',
            account: 'no-enabled-account',
            summary: { reason: 'no enabled account configured' },
            error: { message: 'No enabled account found' },
          }),
        ],
      };
      await this.journal.recordShadowRunEvidence(evidence);
      return [evidence];
    }

    const publicCheck = await (async (): Promise<ShadowRunCheckResult> => {
      try {
        const tickers = await this.indodax.getTickers();
        const ticker = tickers[pair];
        const depth = await this.indodax.getDepth(pair);
        return this.buildShadowCheck({
          check: 'public_market',
          endpoint: `GET /api/tickers + GET /api/depth/${pair}`,
          account: 'public',
          summary: {
            pair,
            tickerFound: Boolean(ticker),
            bestBid: depth.buy[0]?.[0] ?? null,
            bestAsk: depth.sell[0]?.[0] ?? null,
            bidLevels: depth.buy.length,
            askLevels: depth.sell.length,
          },
        });
      } catch (error) {
        return this.buildShadowCheck({
          check: 'public_market',
          endpoint: `GET /api/tickers + GET /api/depth/${pair}`,
          account: 'public',
          summary: { pair },
          error: this.sanitizeError(error),
        });
      }
    })();

    const results: ShadowRunEvidence[] = [];

    for (const account of accounts) {
      const accountLabel = this.safeAccountLabel(account.id);
      const privateApi = this.indodax.forAccount(account);
      const checks: ShadowRunCheckResult[] = [publicCheck];

      try {
        const info = await privateApi.getInfo<{ balance?: Record<string, string | number> }>({
          lane: 'private_reconciliation',
          requestPriority: 1,
        });
        checks.push(
          this.buildShadowCheck({
            check: 'private_auth',
            endpoint: 'POST /tapi method=getInfo',
            account: accountLabel,
            summary: {
              success: info.success === 1,
              balanceAssetCount: Object.keys(info.return?.balance ?? {}).length,
            },
          }),
        );
      } catch (error) {
        checks.push(
          this.buildShadowCheck({
            check: 'private_auth',
            endpoint: 'POST /tapi method=getInfo',
            account: accountLabel,
            summary: {},
            error: this.sanitizeError(error),
          }),
        );
      }

      try {
        const openOrders = await privateApi.openOrders(undefined, {
          lane: 'private_reconciliation',
          requestPriority: 1,
          coalesceKey: `shadow-open-orders:${account.id}`,
        });
        const historyMode = getIndodaxHistoryMode();
        let historyCount = 0;
        if (historyMode === 'v2_only') {
          const endTime = Date.now();
          const startTime = endTime - 6 * 60 * 60 * 1000;
          const histories = await privateApi.orderHistoriesV2(
            { pair, startTime, endTime, limit: 20, sort: 'desc' },
            { lane: 'private_reconciliation', requestPriority: 0 },
          );
          historyCount = histories.return?.orders?.length ?? 0;
        } else {
          const histories = await privateApi.orderHistory(pair, {
            lane: 'private_reconciliation',
            requestPriority: 0,
          });
          historyCount = histories.return?.orders?.length ?? 0;
        }

        checks.push(
          this.buildShadowCheck({
            check: 'reconciliation_read_model',
            endpoint: historyMode === 'v2_only'
              ? 'POST /tapi method=openOrders + GET /api/v2/order/histories'
              : 'POST /tapi method=openOrders + POST /tapi method=orderHistory',
            account: accountLabel,
            summary: {
              historyMode,
              pair,
              openOrderPairCount: Object.keys(openOrders.return?.orders ?? {}).length,
              recentHistoryCount: historyCount,
              localActiveOrders: this.orders.listActive().filter((item) => item.accountId === account.id).length,
              localOpenPositions: this.positions.listOpen().filter((item) => item.accountId === account.id).length,
            },
          }),
        );
      } catch (error) {
        checks.push(
          this.buildShadowCheck({
            check: 'reconciliation_read_model',
            endpoint: 'openOrders + orderHistory/orderHistoriesV2',
            account: accountLabel,
            summary: { pair },
            error: this.sanitizeError(error),
          }),
        );
      }

      const evidence: ShadowRunEvidence = {
        runId,
        timestamp: now,
        exchange: 'indodax',
        account: accountLabel,
        checks,
        allPassed: checks.every((check) => check.pass),
      };

      await this.journal.recordShadowRunEvidence(evidence);
      await this.journal.info(
        'LIVE_SHADOW_RUN_COMPLETED',
        evidence.allPassed ? 'live shadow-run passed' : 'live shadow-run has failures',
        {
          runId,
          account: accountLabel,
          pair,
          allPassed: evidence.allPassed,
          failedChecks: evidence.checks.filter((check) => !check.pass).map((check) => check.check),
        },
      );
      results.push(evidence);
    }

    return results;
  }

  async syncActiveOrders(): Promise<string[]> {
    const settings = this.settings.get();
    if (this.shouldSimulate(settings.tradingMode, settings)) {
      return [];
    }

    const activeOrders = this.orders
      .listActive()
      .filter(
        (order) =>
          Boolean(order.exchangeOrderId) ||
          order.exchangeStatus === 'submission_uncertain' ||
          order.exchangeStatus === 'submission_uncertain_unresolved',
      );
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
        const recoveryLaneOptions: IndodaxPrivateRequestOptions = {
          lane: 'background_recovery',
          requestPriority: -2,
          coalesceKey: `bg-openOrders:${accountId}`,
        };
        const openOrders = await this.fetchOpenOrdersForAccount(accountId, recoveryLaneOptions);

        for (const order of accountOrders) {
          if (!order.exchangeOrderId) {
            if (
              order.exchangeStatus !== 'submission_uncertain' &&
              order.exchangeStatus !== 'submission_uncertain_unresolved'
            ) {
              continue;
            }

            processedOrderIds.add(order.id);
            const beforeExchangeOrderId = order.exchangeOrderId;
            const beforeExchangeStatus = order.exchangeStatus;
            const resolved = await this.resolveSubmissionUncertainOrder(
              order,
              openOrders,
              recoveryLaneOptions,
            );
            if (
              resolved &&
              (
                resolved.exchangeOrderId !== beforeExchangeOrderId ||
                resolved.status !== order.status ||
                resolved.exchangeStatus !== beforeExchangeStatus
              )
            ) {
              messages.push(
                resolved.exchangeOrderId || resolved.exchangeStatus === 'submission_uncertain_unresolved'
                  ? this.formatLiveOrderMessage(resolved.side.toUpperCase() as 'BUY' | 'SELL', resolved)
                  : `${resolved.side.toUpperCase()} live ${resolved.pair} submission uncertain; reconciliation pending`,
              );
            }
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
          const tradeStats = await this.loadTradeStats(order, recoveryLaneOptions);
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
        if (
          !activeOrder.exchangeOrderId &&
          (
            activeOrder.exchangeStatus === 'submission_uncertain' ||
            activeOrder.exchangeStatus === 'submission_uncertain_unresolved'
          )
        ) {
          const beforeExchangeStatus = activeOrder.exchangeStatus;
          const resolved = await this.resolveSubmissionUncertainOrder(activeOrder, undefined, {
            lane: 'background_recovery',
            requestPriority: -1,
          });
          if (
            resolved &&
            (
              resolved.exchangeOrderId ||
              resolved.status !== activeOrder.status ||
              resolved.exchangeStatus !== beforeExchangeStatus
            )
          ) {
            messages.push(
              resolved.exchangeOrderId || resolved.exchangeStatus === 'submission_uncertain_unresolved'
                ? this.formatLiveOrderMessage(resolved.side.toUpperCase() as 'BUY' | 'SELL', resolved)
                : `${resolved.side.toUpperCase()} live ${resolved.pair} submission uncertain; reconciliation pending`,
            );
          }
          continue;
        }

        const beforeStatus = activeOrder.status;
        const beforeFilled = activeOrder.filledQuantity;
        let synced = await this.syncLiveOrder(activeOrder.id, {
          lane: 'background_recovery',
          requestPriority: -1,
        });

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
      .filter(
        (order) =>
          Boolean(order.exchangeOrderId) ||
          order.exchangeStatus === 'submission_uncertain' ||
          order.exchangeStatus === 'submission_uncertain_unresolved',
      );

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

      if (this.hasActiveOrder(position.pair, 'sell', position.accountId, position.id)) {
        messages.push(`${position.pair} exit skipped: active SELL order already exists`);
        continue;
      }

      await this.manualSell(position.id, position.quantity, 'AUTO', exit.reason ?? 'AUTO_EXIT');
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
    let unresolved = 0;

    for (const order of this.orders.listActive()) {
      let currentOrder = order;
      const account = this.accounts.getById(currentOrder.accountId);

      if (
        !currentOrder.exchangeOrderId &&
        (
          currentOrder.exchangeStatus === 'submission_uncertain' ||
          currentOrder.exchangeStatus === 'submission_uncertain_unresolved'
        )
      ) {
        const resolvedOrder = await this.resolveSubmissionUncertainOrder(currentOrder, undefined, {
          lane: 'background_recovery',
          requestPriority: -1,
        });
        if (resolvedOrder) {
          currentOrder = resolvedOrder;
        }
      }

      if (
        !currentOrder.exchangeOrderId &&
        (
          currentOrder.exchangeStatus === 'submission_uncertain' ||
          currentOrder.exchangeStatus === 'submission_uncertain_unresolved'
        )
      ) {
        unresolved += 1;
        await this.journal.warn(
          'CANCEL_SKIPPED_SUBMISSION_UNCERTAIN',
          'cancel dilewati karena order ambiguous belum punya exchangeOrderId',
          {
            orderId: currentOrder.id,
            pair: currentOrder.pair,
            accountId: currentOrder.accountId,
            exchangeStatus: currentOrder.exchangeStatus ?? null,
          },
        );
        continue;
      }

      if (currentOrder.exchangeOrderId && account) {
        const api = this.indodax.forAccount(account);
        await api.cancelOrder(currentOrder.pair, currentOrder.exchangeOrderId, currentOrder.side);
        const canceledOrder = await this.orders.update(currentOrder.id, {
          status: 'CANCELED',
          exchangeStatus: 'canceled',
          exchangeUpdatedAt: nowIso(),
          notes: this.appendNotes(currentOrder.notes, 'exchange cancel requested'),
        });
        if (canceledOrder) {
          await this.publishExecutionSummary(
            canceledOrder,
            canceledOrder.filledQuantity > 1e-8 ? 'PARTIAL_LIVE' : 'CONFIRMED_LIVE',
            'exchange cancel requested',
          );
        }
      } else {
        const canceledOrder = await this.orders.cancel(currentOrder.id, 'local cancel without exchange order id');
        if (canceledOrder) {
          await this.publishExecutionSummary(
            canceledOrder,
            this.shouldSimulate(settings.tradingMode, settings) ? 'SIMULATED' : 'OPTIMISTIC_LIVE',
            'local cancel without exchange order id',
          );
        }
      }

      count += 1;
    }

    const baseSummary = `Canceled ${count} active orders`;
    const unresolvedSummary = unresolved > 0 ? `; unresolved ${unresolved} submission-uncertain orders` : '';

    return `${baseSummary}${unresolvedSummary}`;
  }

  async sellAllPositions(): Promise<string> {
    const openPositions: PositionRecord[] = this.positions.listOpen();
    let submitted = 0;
    let skipped = 0;

    for (const position of openPositions) {
      if (this.hasActiveOrder(position.pair, 'sell', position.accountId, position.id)) {
        skipped += 1;
        continue;
      }

      await this.manualSell(position.id, position.quantity, 'AUTO', 'SELL_ALL_POSITIONS');
      submitted += 1;
    }

    return `Submitted SELL for ${submitted} positions; skipped ${skipped} positions with active SELL orders`;
  }
}
