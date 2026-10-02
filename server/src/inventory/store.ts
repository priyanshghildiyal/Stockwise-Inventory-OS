import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type InventoryMovementRecord = {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  delta: number;
  type: 'RECEIPT' | 'ADJUSTMENT' | 'RESERVATION' | 'RELEASE' | 'SHIPMENT';
  reason: string;
  createdByUserId: string;
  createdAt: string;
};

export type ReservationRecord = {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: 'ACTIVE' | 'RELEASED' | 'FULFILLED';
  reason: string;
  createdByUserId: string;
  createdAt: string;
};

export type InventoryAdjustmentInput = {
  organizationId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  type: InventoryMovementRecord['type'];
  reason: string;
  createdByUserId: string;
};

export type InventoryReservationInput = {
  organizationId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  createdByUserId: string;
};

export interface InventoryStore {
  adjust(input: InventoryAdjustmentInput): Promise<{ movement?: InventoryMovementRecord; error?: string }>; 
  reserve(input: InventoryReservationInput): Promise<{ reservation?: ReservationRecord; error?: string }>; 
  listMovements(organizationId: string, productId?: string): Promise<InventoryMovementRecord[]>;
}

export class MemoryInventoryStore implements InventoryStore {
  private readonly inventory = new Map<string, number>();
  private readonly reservations = new Map<string, ReservationRecord>();
  private readonly movements: InventoryMovementRecord[] = [];

  async adjust(input: InventoryAdjustmentInput) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) return { error: 'Quantity must be positive.' };
    const current = Number(this.inventory.get(`${input.organizationId}:${input.productId}:${input.warehouseId}`) || 0);
    const next = input.type === 'RECEIPT' ? current + input.quantity : current - input.quantity;
    if (next < 0) return { error: 'Insufficient available stock.' };
    this.inventory.set(`${input.organizationId}:${input.productId}:${input.warehouseId}`, next);
    const movement: InventoryMovementRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      delta: input.type === 'RECEIPT' ? input.quantity : -input.quantity,
      type: input.type,
      reason: input.reason,
      createdByUserId: input.createdByUserId,
      createdAt: new Date().toISOString(),
    };
    this.movements.push(movement);
    return { movement };
  }

  async reserve(input: InventoryReservationInput) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) return { error: 'Quantity must be positive.' };
    const key = `${input.organizationId}:${input.productId}:${input.warehouseId}`;
    const available = Number(this.inventory.get(key) || 0);
    if (available < input.quantity) return { error: 'Insufficient available stock.' };
    const reservation: ReservationRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      status: 'ACTIVE',
      reason: input.reason,
      createdByUserId: input.createdByUserId,
      createdAt: new Date().toISOString(),
    };
    this.reservations.set(reservation.id, reservation);
    this.inventory.set(key, available - input.quantity);
    this.movements.push({
      id: randomUUID(),
      organizationId: input.organizationId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      delta: -input.quantity,
      type: 'RESERVATION',
      reason: input.reason,
      createdByUserId: input.createdByUserId,
      createdAt: new Date().toISOString(),
    });
    return { reservation };
  }

  async listMovements(organizationId: string, productId?: string) {
    return this.movements.filter((movement) => movement.organizationId === organizationId && (!productId || movement.productId === productId));
  }
}

export class PrismaInventoryStore implements InventoryStore {
  constructor(private readonly prisma: PrismaClient) {}

  async adjust(input: InventoryAdjustmentInput) {
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Quantity must be positive.' };

    const current = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'warehouseId'],
      where: {
        organizationId: input.organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
      _sum: { delta: true },
    });

    const balance = current[0]?._sum.delta ? Number(current[0]._sum.delta) : 0;
    const next = input.type === 'RECEIPT' ? balance + quantity : balance - quantity;
    if (next < 0) return { error: 'Insufficient available stock.' };

    const movement = await this.prisma.inventoryMovement.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: quantity,
        delta: input.type === 'RECEIPT' ? quantity : -quantity,
        type: input.type,
        reason: input.reason,
        createdByUserId: input.createdByUserId,
      },
    });

    return {
      movement: {
        id: movement.id,
        organizationId: movement.organizationId,
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        quantity: Number(movement.quantity),
        delta: Number(movement.delta),
        type: movement.type as InventoryMovementRecord['type'],
        reason: movement.reason,
        createdByUserId: movement.createdByUserId,
        createdAt: movement.createdAt.toISOString(),
      },
    };
  }

  async reserve(input: InventoryReservationInput) {
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Quantity must be positive.' };

    const totals = await this.prisma.inventoryMovement.groupBy({
      by: ['productId', 'warehouseId'],
      where: {
        organizationId: input.organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
      _sum: { delta: true },
    });

    const available = totals[0]?._sum.delta ? Number(totals[0]._sum.delta) : 0;
    if (available < quantity) return { error: 'Insufficient available stock.' };

    const reservation = await this.prisma.inventoryReservation.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: quantity,
        status: 'ACTIVE',
        reason: input.reason,
        createdByUserId: input.createdByUserId,
      },
    });

    return {
      reservation: {
        id: reservation.id,
        organizationId: reservation.organizationId,
        productId: reservation.productId,
        warehouseId: reservation.warehouseId,
        quantity: Number(reservation.quantity),
        status: reservation.status as ReservationRecord['status'],
        reason: reservation.reason,
        createdByUserId: reservation.createdByUserId,
        createdAt: reservation.createdAt.toISOString(),
      },
    };
  }

  async listMovements(organizationId: string, productId?: string) {
    const records = await this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        ...(productId ? { productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((record) => ({
      id: record.id,
      organizationId: record.organizationId,
      productId: record.productId,
      warehouseId: record.warehouseId,
      quantity: Number(record.quantity),
      delta: Number(record.delta),
      type: record.type as InventoryMovementRecord['type'],
      reason: record.reason,
      createdByUserId: record.createdByUserId,
      createdAt: record.createdAt.toISOString(),
    }));
  }
}
