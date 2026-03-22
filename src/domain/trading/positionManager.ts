import { randomUUID } from 'node:crypto';
import type { PositionRecord } from '../../core/types';
import { PersistenceService } from '../../services/persistenceService';
import { nowIso } from '../../utils/time';

export interface OpenPositionInput {
  accountId: string;
  pair: string;
  quantity: number;
  entryPrice: number;
  entryFeesPaid?: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  sourceOrderId?: string;
}

export class PositionManager {
  private positions: PositionRecord[] = [];

  constructor(private readonly persistence: PersistenceService) {}

  private computeUnrealizedPnl(
    markPrice: number,
    averageEntryPrice: number,
    quantity: number,
    entryFeesPaid: number,
  ): number {
    return (markPrice - averageEntryPrice) * quantity - entryFeesPaid;
  }

  async load(): Promise<PositionRecord[]> {
    const snapshot = await this.persistence.loadAll();
    this.positions = Array.isArray(snapshot.positions)
      ? snapshot.positions.map((position) => {
          const totalBoughtQuantity = position.totalBoughtQuantity ?? position.quantity;
          const totalSoldQuantity = position.totalSoldQuantity ?? 0;
          const totalEntryFeesPaid = position.totalEntryFeesPaid ?? position.entryFeesPaid ?? 0;

          return {
            ...position,
            averageExitPrice: position.averageExitPrice ?? null,
            totalBoughtQuantity,
            totalSoldQuantity,
            totalEntryFeesPaid,
          };
        })
      : [];
    return this.positions;
  }

  list(): PositionRecord[] {
    return [...this.positions];
  }

  listOpen(): PositionRecord[] {
    return this.positions.filter((item) => item.status !== 'CLOSED');
  }

  getById(positionId: string): PositionRecord | undefined {
    return this.positions.find((item) => item.id === positionId);
  }

  getOpenByPair(pair: string): PositionRecord[] {
    return this.positions.filter((item) => item.pair === pair && item.status !== 'CLOSED');
  }

  getOpenByPairAndAccount(pair: string, accountId: string): PositionRecord | undefined {
    return this.positions.find(
      (item) => item.pair === pair && item.accountId === accountId && item.status !== 'CLOSED',
    );
  }

  async open(input: OpenPositionInput): Promise<PositionRecord> {
    const now = nowIso();

    const position: PositionRecord = {
      id: randomUUID(),
      pair: input.pair,
      accountId: input.accountId,
      status: 'OPEN',
      side: 'long',
      quantity: input.quantity,
      entryPrice: input.entryPrice,
      averageEntryPrice: input.entryPrice,
      averageExitPrice: null,
      currentPrice: input.entryPrice,
      peakPrice: input.entryPrice,
      unrealizedPnl: this.computeUnrealizedPnl(
        input.entryPrice,
        input.entryPrice,
        input.quantity,
        input.entryFeesPaid ?? 0,
      ),
      realizedPnl: 0,
      entryFeesPaid: input.entryFeesPaid ?? 0,
      totalEntryFeesPaid: input.entryFeesPaid ?? 0,
      exitFeesPaid: 0,
      totalBoughtQuantity: input.quantity,
      totalSoldQuantity: 0,
      stopLossPrice: input.stopLossPrice,
      takeProfitPrice: input.takeProfitPrice,
      openedAt: now,
      updatedAt: now,
      closedAt: null,
      sourceOrderId: input.sourceOrderId,
    };

    this.positions = [position, ...this.positions];
    await this.persistence.savePositions(this.positions);
    return position;
  }

  async applyBuyFill(input: OpenPositionInput): Promise<PositionRecord> {
    const current = this.getOpenByPairAndAccount(input.pair, input.accountId);
    if (!current) {
      return this.open(input);
    }

    const addedQuantity = Math.max(0, input.quantity);
    const nextQuantity = current.quantity + addedQuantity;
    const weightedAverageEntryPrice =
      nextQuantity > 0
        ? (
            current.averageEntryPrice * current.quantity + input.entryPrice * addedQuantity
          ) / nextQuantity
        : current.averageEntryPrice;
    const entryFeesPaid = (current.entryFeesPaid ?? 0) + (input.entryFeesPaid ?? 0);
    const totalEntryFeesPaid = (current.totalEntryFeesPaid ?? current.entryFeesPaid ?? 0) + (input.entryFeesPaid ?? 0);
    const markPrice = current.currentPrice;
    const peakMarkPrice = current.peakPrice ?? current.currentPrice;

    const next: PositionRecord = {
      ...current,
      status: 'OPEN',
      quantity: nextQuantity,
      entryPrice: weightedAverageEntryPrice,
      averageEntryPrice: weightedAverageEntryPrice,
      currentPrice: markPrice,
      peakPrice: peakMarkPrice,
      unrealizedPnl: this.computeUnrealizedPnl(
        markPrice,
        weightedAverageEntryPrice,
        nextQuantity,
        entryFeesPaid,
      ),
      entryFeesPaid,
      totalEntryFeesPaid,
      totalBoughtQuantity: (current.totalBoughtQuantity ?? current.quantity) + addedQuantity,
      stopLossPrice: input.stopLossPrice,
      takeProfitPrice: input.takeProfitPrice,
      updatedAt: nowIso(),
      sourceOrderId: input.sourceOrderId ?? current.sourceOrderId,
    };

    this.positions = this.positions.map((item) => (item.id === current.id ? next : item));
    await this.persistence.savePositions(this.positions);
    return next;
  }

  async updateMark(pair: string, markPrice: number): Promise<void> {
    this.positions = this.positions.map((item) => {
      if (item.status === 'CLOSED' || item.pair !== pair) {
        return item;
      }

      return {
        ...item,
        currentPrice: markPrice,
        peakPrice: Math.max(item.peakPrice ?? item.currentPrice, markPrice),
        unrealizedPnl: this.computeUnrealizedPnl(
          markPrice,
          item.averageEntryPrice,
          item.quantity,
          item.entryFeesPaid ?? 0,
        ),
        updatedAt: nowIso(),
      };
    });

    await this.persistence.savePositions(this.positions);
  }

  async closePartial(
    positionId: string,
    closeQuantity: number,
    exitPrice: number,
    exitFee = 0,
  ): Promise<PositionRecord | undefined> {
    const current = this.getById(positionId);
    if (!current || current.status === 'CLOSED') {
      return undefined;
    }

    const safeCloseQuantity = Math.max(0, Math.min(current.quantity, closeQuantity));
    const remainingQuantity = Math.max(0, current.quantity - safeCloseQuantity);
    const currentEntryFeesPaid = current.entryFeesPaid ?? 0;
    const currentTotalEntryFeesPaid = current.totalEntryFeesPaid ?? current.entryFeesPaid ?? 0;
    const entryFeeShare =
      current.quantity > 0 ? currentEntryFeesPaid * (safeCloseQuantity / current.quantity) : 0;
    const remainingEntryFeesPaid = Math.max(0, currentEntryFeesPaid - entryFeeShare);
    const previousSoldQuantity = current.totalSoldQuantity ?? 0;
    const nextTotalSoldQuantity = previousSoldQuantity + safeCloseQuantity;
    const averageExitPrice =
      nextTotalSoldQuantity > 0
        ? (((current.averageExitPrice ?? 0) * previousSoldQuantity) + (exitPrice * safeCloseQuantity)) /
          nextTotalSoldQuantity
        : current.averageExitPrice;
    const realizedPnl =
      current.realizedPnl +
      (exitPrice - current.averageEntryPrice) * safeCloseQuantity -
      entryFeeShare -
      exitFee;
    const isFullyClosed = remainingQuantity <= 1e-8;
    const nextMarkPrice = isFullyClosed ? exitPrice : current.currentPrice;

    const next: PositionRecord = {
      ...current,
      quantity: remainingQuantity,
      currentPrice: nextMarkPrice,
      averageExitPrice: averageExitPrice ?? null,
      peakPrice: current.peakPrice ?? current.currentPrice,
      realizedPnl,
      unrealizedPnl: this.computeUnrealizedPnl(
        nextMarkPrice,
        current.averageEntryPrice,
        remainingQuantity,
        remainingEntryFeesPaid,
      ),
      entryFeesPaid: remainingEntryFeesPaid,
      totalEntryFeesPaid: currentTotalEntryFeesPaid,
      exitFeesPaid: (current.exitFeesPaid ?? 0) + exitFee,
      totalBoughtQuantity: current.totalBoughtQuantity ?? current.quantity,
      totalSoldQuantity: nextTotalSoldQuantity,
      status:
        isFullyClosed
          ? 'CLOSED'
          : safeCloseQuantity > 0
            ? 'PARTIALLY_CLOSED'
            : current.status,
      updatedAt: nowIso(),
      closedAt: isFullyClosed ? nowIso() : current.closedAt,
    };

    this.positions = this.positions.map((item) => (item.id === positionId ? next : item));
    await this.persistence.savePositions(this.positions);
    return next;
  }

  async forceClose(positionId: string, exitPrice: number): Promise<PositionRecord | undefined> {
    const current = this.getById(positionId);
    if (!current || current.status === 'CLOSED') {
      return undefined;
    }

    return this.closePartial(positionId, current.quantity, exitPrice);
  }
}
