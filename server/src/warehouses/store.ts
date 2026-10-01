import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type WarehouseRecord = {
  id: string;
  organizationId: string;
  name: string;
  capacity: number | null;
  createdAt: string;
  updatedAt: string;
};

export type NewWarehouse = Omit<WarehouseRecord, 'id' | 'createdAt' | 'updatedAt'>;

export interface WarehouseStore {
  list(organizationId: string): Promise<WarehouseRecord[]>;
  create(input: NewWarehouse): Promise<WarehouseRecord>;
}

export class MemoryWarehouseStore implements WarehouseStore {
  private readonly warehouses = new Map<string, WarehouseRecord>();

  async list(organizationId: string) {
    return [...this.warehouses.values()].filter((warehouse) => warehouse.organizationId === organizationId);
  }

  async create(input: NewWarehouse) {
    const now = new Date().toISOString();
    const warehouse = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    this.warehouses.set(warehouse.id, warehouse);
    return warehouse;
  }
}

export class PrismaWarehouseStore implements WarehouseStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string) {
    const warehouses = await this.prisma.warehouse.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    return warehouses.map((warehouse) => this.toRecord(warehouse));
  }

  async create(input: NewWarehouse) {
    const warehouse = await this.prisma.warehouse.create({ data: {
      organizationId: input.organizationId,
      name: input.name,
      capacity: input.capacity,
    } });
    return this.toRecord(warehouse);
  }

  private toRecord(warehouse: Awaited<ReturnType<PrismaClient['warehouse']['findFirstOrThrow']>>): WarehouseRecord {
    return {
      id: warehouse.id,
      organizationId: warehouse.organizationId,
      name: warehouse.name,
      capacity: warehouse.capacity ? Number(warehouse.capacity) : null,
      createdAt: warehouse.createdAt.toISOString(),
      updatedAt: warehouse.updatedAt.toISOString(),
    };
  }
}
