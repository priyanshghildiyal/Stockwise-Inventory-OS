import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type SupplierRecord = {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
};

export type CustomerRecord = {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
};

export type OrderRecord = {
  id: string;
  organizationId: string;
  type: 'PURCHASE' | 'SALE';
  reference: string;
  customerOrSupplier: string;
  status: 'DRAFT' | 'APPROVED' | 'RECEIVED' | 'SHIPPED' | 'COMPLETED';
  total: number;
  createdAt: string;
};

export type BusinessStore = {
  listSuppliers: (organizationId: string) => Promise<SupplierRecord[]>;
  createSupplier: (organizationId: string, payload: { name: string; email?: string | null; phone?: string | null }) => Promise<SupplierRecord>;
  listCustomers: (organizationId: string) => Promise<CustomerRecord[]>;
  createCustomer: (organizationId: string, payload: { name: string; email?: string | null; phone?: string | null }) => Promise<CustomerRecord>;
  listOrders: (organizationId: string) => Promise<OrderRecord[]>;
  createOrder: (organizationId: string, payload: { type: 'PURCHASE' | 'SALE'; reference: string; customerOrSupplier: string; status?: OrderRecord['status']; total?: number }) => Promise<OrderRecord>;
};

export class MemoryBusinessStore implements BusinessStore {
  private readonly suppliers = new Map<string, SupplierRecord>();
  private readonly customers = new Map<string, CustomerRecord>();
  private readonly orders = new Map<string, OrderRecord>();

  async listSuppliers(organizationId: string) {
    return [...this.suppliers.values()].filter((item) => item.organizationId === organizationId);
  }

  async createSupplier(organizationId: string, payload: { name: string; email?: string | null; phone?: string | null }) {
    const record: SupplierRecord = {
      id: randomUUID(),
      organizationId,
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      createdAt: new Date().toISOString(),
    };
    this.suppliers.set(record.id, record);
    return record;
  }

  async listCustomers(organizationId: string) {
    return [...this.customers.values()].filter((item) => item.organizationId === organizationId);
  }

  async createCustomer(organizationId: string, payload: { name: string; email?: string | null; phone?: string | null }) {
    const record: CustomerRecord = {
      id: randomUUID(),
      organizationId,
      name: payload.name,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      createdAt: new Date().toISOString(),
    };
    this.customers.set(record.id, record);
    return record;
  }

  async listOrders(organizationId: string) {
    return [...this.orders.values()].filter((item) => item.organizationId === organizationId);
  }

  async createOrder(organizationId: string, payload: { type: 'PURCHASE' | 'SALE'; reference: string; customerOrSupplier: string; status?: OrderRecord['status']; total?: number }) {
    const record: OrderRecord = {
      id: randomUUID(),
      organizationId,
      type: payload.type,
      reference: payload.reference,
      customerOrSupplier: payload.customerOrSupplier,
      status: payload.status ?? 'DRAFT',
      total: payload.total ?? 0,
      createdAt: new Date().toISOString(),
    };
    this.orders.set(record.id, record);
    return record;
  }
}

export class PrismaBusinessStore implements BusinessStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listSuppliers(organizationId: string) {
    const suppliers = await this.prisma.supplier.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    return suppliers.map((supplier) => ({
      id: supplier.id,
      organizationId: supplier.organizationId,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      createdAt: supplier.createdAt.toISOString(),
    }));
  }

  async createSupplier(organizationId: string, payload: { name: string; email?: string | null; phone?: string | null }) {
    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId,
        name: payload.name,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
      },
    });
    return {
      id: supplier.id,
      organizationId: supplier.organizationId,
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      createdAt: supplier.createdAt.toISOString(),
    };
  }

  async listCustomers(organizationId: string) {
    const customers = await this.prisma.customer.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
    return customers.map((customer) => ({
      id: customer.id,
      organizationId: customer.organizationId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt.toISOString(),
    }));
  }

  async createCustomer(organizationId: string, payload: { name: string; email?: string | null; phone?: string | null }) {
    const customer = await this.prisma.customer.create({
      data: {
        organizationId,
        name: payload.name,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
      },
    });
    return {
      id: customer.id,
      organizationId: customer.organizationId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  async listOrders(organizationId: string) {
    const orders = await this.prisma.order.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
    return orders.map((order) => ({
      id: order.id,
      organizationId: order.organizationId,
      type: order.type as 'PURCHASE' | 'SALE',
      reference: order.reference,
      customerOrSupplier: order.customerOrSupplier,
      status: order.status as OrderRecord['status'],
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
    }));
  }

  async createOrder(organizationId: string, payload: { type: 'PURCHASE' | 'SALE'; reference: string; customerOrSupplier: string; status?: OrderRecord['status']; total?: number }) {
    const order = await this.prisma.order.create({
      data: {
        organizationId,
        type: payload.type,
        reference: payload.reference,
        customerOrSupplier: payload.customerOrSupplier,
        status: payload.status ?? 'DRAFT',
        total: payload.total ?? 0,
      },
    });
    return {
      id: order.id,
      organizationId: order.organizationId,
      type: order.type as 'PURCHASE' | 'SALE',
      reference: order.reference,
      customerOrSupplier: order.customerOrSupplier,
      status: order.status as OrderRecord['status'],
      total: Number(order.total),
      createdAt: order.createdAt.toISOString(),
    };
  }
}
