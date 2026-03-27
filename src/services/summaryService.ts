import crypto from 'node:crypto';

import { logger } from '../core/logger';
import type {
  ExecutionSummary,
  OrderRecord,
  PositionRecord,
  SummaryAccuracy,
  TradeOutcomeSummary,
} from '../core/types';
import { AccountRegistry } from '../domain/accounts/accountRegistry';
import { nowIso } from '../utils/time';
import { JournalService } from './journalService';
import { PersistenceService } from './persistenceService';
import { ReportService } from './reportService';

export interface SummaryNotifier {
  broadcast(message: string): Promise<void>;
}

interface PublishExecutionSummaryInput {
  order: OrderRecord;
  accuracy: SummaryAccuracy;
  reason?: string;
}

interface PublishTradeOutcomeSummaryInput {
  position: PositionRecord;
  accuracy: SummaryAccuracy;
  closeReason: string;
}

export class SummaryService {
  private notifier: SummaryNotifier | null = null;

  constructor(
    private readonly persistence: PersistenceService,
    private readonly journal: JournalService,
    private readonly report: ReportService,
    private readonly accounts: AccountRegistry,
  ) {}

  attachNotifier(notifier: SummaryNotifier): void {
    this.notifier = notifier;
  }

  private resolveAccountName(accountId: string): string {
    return this.accounts.getById(accountId)?.name ?? accountId;
  }

  private calcSlippagePct(referencePrice: number | null | undefined, price: number | null | undefined): number | null {
    if (!referencePrice || referencePrice <= 0 || !price || price <= 0) {
      return null;
    }

    return ((price - referencePrice) / referencePrice) * 100;
  }

  private statusToSummaryStatus(
    order: OrderRecord,
  ): ExecutionSummary['status'] {
    switch (order.status) {
      case 'PARTIALLY_FILLED':
        return 'PARTIALLY_FILLED';
      case 'FILLED':
        return 'FILLED';
      case 'CANCELED':
        return 'CANCELED';
      case 'REJECTED':
        return 'FAILED';
      case 'NEW':
      case 'OPEN':
      default:
        return 'SUBMITTED';
    }
  }

  private accuracyNotes(accuracy: SummaryAccuracy): string[] {
    switch (accuracy) {
      case 'SIMULATED':
        return ['simulated'];
      case 'OPTIMISTIC_LIVE':
        return ['optimistic-live'];
      case 'PARTIAL_LIVE':
        return ['partial-live'];
      case 'CONFIRMED_LIVE':
        return ['confirmed-live'];
      case 'UNCERTAIN_LIVE':
        return ['uncertain-live'];
      case 'UNRESOLVED_LIVE':
        return ['unresolved-live'];
      default:
        return [];
    }
  }

  private async notify(text: string): Promise<void> {
    if (!this.notifier) {
      return;
    }

    try {
      await this.notifier.broadcast(text);
    } catch (error) {
      logger.warn({ error }, 'failed to broadcast summary to telegram');
    }
  }

  async publishExecutionSummary(
    input: PublishExecutionSummaryInput,
  ): Promise<ExecutionSummary> {
    const { order, accuracy, reason } = input;
    const fillPrice = order.averageFillPrice ?? (order.filledQuantity > 0 ? order.price : null);

    const summary: ExecutionSummary = {
      id: crypto.randomUUID(),
      orderId: order.id,
      accountId: order.accountId,
      account: this.resolveAccountName(order.accountId),
      pair: order.pair,
      side: order.side,
      status: this.statusToSummaryStatus(order),
      accuracy,
      referencePrice: order.referencePrice ?? null,
      intendedOrderPrice: order.price,
      averageFillPrice: fillPrice,
      filledQuantity: order.filledQuantity,
      filledNotional: order.filledQuantity * (fillPrice ?? order.price),
      fee: order.feeAmount ?? null,
      feeAsset: order.feeAsset ?? null,
      exchangeOrderId: order.exchangeOrderId,
      slippageVsReferencePricePct: this.calcSlippagePct(order.referencePrice, fillPrice ?? order.price),
      executionPlan: order.executionPlan,
      timestamp: nowIso(),
      reason: reason ?? order.notes,
    };

    await this.persistence.appendExecutionSummary(summary);
    await this.journal.append({
      id: summary.id,
      type: 'TRADE',
      title: `${summary.side.toUpperCase()} ${summary.status}`,
      message: `${summary.side.toUpperCase()} ${summary.pair} ${summary.status} (${summary.accuracy})`,
      pair: summary.pair,
      payload: summary as unknown as Record<string, unknown>,
      createdAt: summary.timestamp,
    });

    const logPayload = {
      kind: 'execution_summary',
      summary,
    };

    if (summary.status === 'FAILED') {
      logger.error(logPayload, 'execution summary');
    } else if (summary.status === 'CANCELED') {
      logger.warn(logPayload, 'execution summary');
    } else {
      logger.info(logPayload, 'execution summary');
    }

    await this.notify(this.report.executionSummaryText(summary));
    return summary;
  }

  async publishTradeOutcomeSummary(
    input: PublishTradeOutcomeSummaryInput,
  ): Promise<TradeOutcomeSummary | null> {
    const { position, accuracy, closeReason } = input;
    if (position.status !== 'CLOSED') {
      return null;
    }

    const totalQuantity = Math.max(
      position.totalSoldQuantity ?? 0,
      position.totalBoughtQuantity ?? 0,
    );
    const totalFee =
      (position.totalEntryFeesPaid ?? position.entryFeesPaid ?? 0) +
      (position.exitFeesPaid ?? 0);
    const entryAverage = position.averageEntryPrice ?? position.entryPrice ?? null;
    const exitAverage = position.averageExitPrice ?? position.currentPrice ?? null;
    const grossPnl =
      entryAverage && exitAverage && totalQuantity > 0
        ? (exitAverage - entryAverage) * totalQuantity
        : null;
    const netPnl = Number.isFinite(position.realizedPnl) ? position.realizedPnl : grossPnl;
    const notionalCost = entryAverage && totalQuantity > 0 ? entryAverage * totalQuantity : null;
    const returnPercentage =
      notionalCost && notionalCost > 0 && netPnl !== null
        ? (netPnl / notionalCost) * 100
        : null;
    const openedAtMs = new Date(position.openedAt).getTime();
    const closedAtMs = position.closedAt ? new Date(position.closedAt).getTime() : NaN;
    const holdDurationMs =
      Number.isFinite(openedAtMs) && Number.isFinite(closedAtMs)
        ? Math.max(0, closedAtMs - openedAtMs)
        : null;

    const summary: TradeOutcomeSummary = {
      id: crypto.randomUUID(),
      positionId: position.id,
      accountId: position.accountId,
      account: this.resolveAccountName(position.accountId),
      pair: position.pair,
      accuracy,
      entryAverage,
      exitAverage,
      totalQuantity,
      totalFee,
      grossPnl,
      netPnl,
      returnPercentage,
      holdDurationMs,
      closeReason,
      timestamp: nowIso(),
      notes: this.accuracyNotes(accuracy),
    };

    await this.persistence.appendTradeOutcome(summary);
    await this.journal.append({
      id: summary.id,
      type: 'TRADE',
      title: 'TRADE_OUTCOME_FINAL',
      message: `${summary.pair} ditutup (${summary.accuracy})`,
      pair: summary.pair,
      payload: summary as unknown as Record<string, unknown>,
      createdAt: summary.timestamp,
    });

    logger.info(
      {
        kind: 'trade_outcome_summary',
        summary,
      },
      'trade outcome summary',
    );

    await this.notify(this.report.tradeOutcomeSummaryText(summary));
    return summary;
  }
}
