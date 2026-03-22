import { randomUUID } from 'node:crypto';
import type { OrderRecord, OrderSide, OrderType } from '../../core/types';
import { PersistenceService } from '../../services/persistenceService';
import { nowIso } from '../../utils/time';

export interface CreateOrderInput {
  accountId: string;
  pair: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  quantity: number;
  source: 'MANUAL' | 'SEMI_AUTO' | 'AUTO';
  status?: OrderRecord['status'];
  averageFillPrice?: number | null;
  filledQuantity?: number;
  exchangeOrderId?: string;
  exchangeStatus?: string;
  exchangeUpdatedAt?: string;
  relatedPositionId?: string;
  referencePrice?: number | null;
  closeReason?: string;
  notes?: string;
}

export class OrderManager {
  private orders: OrderRecord[] = [];

  constructor(private readonly persistence: PersistenceService) {}

  private assertFinitePositive(value: number, label: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} tidak valid`);
    }
  }

  private validateCreateInput(input: CreateOrderInput): void {
    this.assertFinitePositive(input.price, 'Harga order');
    this.assertFinitePositive(input.quantity, 'Quantity order');

    if (input.referencePrice !== undefined && input.referencePrice !== null) {
      this.assertFinitePositive(input.referencePrice, 'Harga referensi order');
    }

    const notional = input.price * input.quantity;
    this.assertFinitePositive(notional, 'Notional order');
  }

  async load(): Promise<OrderRecord[]> {
    const snapshot = await this.persistence.loadAll();
    this.orders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
    return this.orders;
  }

  list(): OrderRecord[] {
    return [...this.orders];
  }

  listActive(): OrderRecord[] {
    return this.orders.filter(
      (item) =>
        item.status === 'NEW' ||
        item.status === 'OPEN' ||
        item.status === 'PARTIALLY_FILLED',
    );
  }

  getById(orderId: string): OrderRecord | undefined {
    return this.orders.find((item) => item.id === orderId);
  }

  async create(input: CreateOrderInput): Promise<OrderRecord> {
    this.validateCreateInput(input);

    const now = nowIso();

    const order: OrderRecord = {
      id: randomUUID(),
      pair: input.pair,
      accountId: input.accountId,
      side: input.side,
      type: input.type,
      status: input.status ?? 'NEW',
      price: input.price,
      quantity: input.quantity,
      filledQuantity: input.filledQuantity ?? 0,
      averageFillPrice: input.averageFillPrice ?? null,
      notionalIdr: input.price * input.quantity,
      referencePrice: input.referencePrice ?? null,
      createdAt: now,
      updatedAt: now,
      source: input.source,
      exchangeOrderId: input.exchangeOrderId,
      exchangeStatus: input.exchangeStatus,
      exchangeUpdatedAt: input.exchangeUpdatedAt,
      relatedPositionId: input.relatedPositionId,
      closeReason: input.closeReason,
      notes: input.notes,
    };

    this.orders = [order, ...this.orders];
    await this.persistence.saveOrders(this.orders);
    return order;
  }

  async update(
    orderId: string,
    patch: Partial<OrderRecord>,
  ): Promise<OrderRecord | undefined> {
    const current = this.getById(orderId);
    if (!current) {
      return undefined;
    }

    const next: OrderRecord = {
      ...current,
      ...patch,
      updatedAt: nowIso(),
      notionalIdr:
        (patch.price ?? current.price) * (patch.quantity ?? current.quantity),
    };

    this.orders = this.orders.map((item) => (item.id === orderId ? next : item));
    await this.persistence.saveOrders(this.orders);
    return next;
  }

  async markOpen(orderId: string): Promise<OrderRecord | undefined> {
    return this.update(orderId, { status: 'OPEN' });
  }

  async markPartiallyFilled(
    orderId: string,
    filledQuantity: number,
    averageFillPrice?: number,
  ): Promise<OrderRecord | undefined> {
    return this.update(orderId, {
      status: 'PARTIALLY_FILLED',
      filledQuantity,
      averageFillPrice: averageFillPrice ?? this.getById(orderId)?.averageFillPrice ?? null,
    });
  }

  async markFilled(
    orderId: string,
    filledQuantity: number,
    averageFillPrice?: number,
  ): Promise<OrderRecord | undefined> {
    return this.update(orderId, {
      status: 'FILLED',
      filledQuantity,
      averageFillPrice: averageFillPrice ?? this.getById(orderId)?.averageFillPrice ?? null,
    });
  }

  async cancel(orderId: string, notes = 'manual cancel'): Promise<OrderRecord | undefined> {
    return this.update(orderId, {
      status: 'CANCELED',
      notes,
    });
  }

  async reject(orderId: string, notes = 'order rejected'): Promise<OrderRecord | undefined> {
    return this.update(orderId, {
      status: 'REJECTED',
      notes,
    });
  }

  async cancelAll(notes = 'emergency cancel all'): Promise<number> {
    const active = this.listActive();

    for (const order of active) {
      await this.cancel(order.id, notes);
    }

    return active.length;
  }
}
