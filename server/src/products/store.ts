import { PrismaClient, ProductStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export type ProductRecord = {
  id: string;
  organizationId: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  cost: number | null;
  sellingPrice: number | null;
  reorderPoint: number;
  reorderQuantity: number | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
};

export type NewProduct = Omit<ProductRecord, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

export interface ProductStore {
  list(organizationId: string, search?: string): Promise<ProductRecord[]>;
  create(input: NewProduct): Promise<ProductRecord>;
}

export class MemoryProductStore implements ProductStore {
  private readonly products = new Map<string, ProductRecord>();

  async list(organizationId: string, search = '') {
    const query = search.trim().toLowerCase();
    return [...this.products.values()].filter((product) => (
      product.organizationId === organizationId
      && (!query || `${product.name} ${product.sku} ${product.barcode || ''}`.toLowerCase().includes(query))
    ));
  }

  async create(input: NewProduct) {
    const now = new Date().toISOString();
    const product: ProductRecord = { ...input, id: randomUUID(), status: 'ACTIVE', createdAt: now, updatedAt: now };
    this.products.set(product.id, product);
    return product;
  }
}

export class PrismaProductStore implements ProductStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(organizationId: string, search = '') {
    const query = search.trim();
    const products = await this.prisma.product.findMany({
      where: {
        organizationId,
        status: ProductStatus.ACTIVE,
        ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { sku: { contains: query, mode: 'insensitive' } }, { barcode: { contains: query, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return products.map((product) => this.toRecord(product));
  }

  async create(input: NewProduct) {
    const product = await this.prisma.product.create({ data: {
      organizationId: input.organizationId,
      sku: input.sku,
      barcode: input.barcode,
      name: input.name,
      description: input.description,
      category: input.category,
      unit: input.unit,
      cost: input.cost,
      sellingPrice: input.sellingPrice,
      reorderPoint: input.reorderPoint,
      reorderQuantity: input.reorderQuantity,
    } });
    return this.toRecord(product);
  }

  private toRecord(product: Awaited<ReturnType<PrismaClient['product']['findFirstOrThrow']>>): ProductRecord {
    return {
      id: product.id,
      organizationId: product.organizationId,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
      category: product.category,
      unit: product.unit,
      cost: product.cost ? Number(product.cost) : null,
      sellingPrice: product.sellingPrice ? Number(product.sellingPrice) : null,
      reorderPoint: Number(product.reorderPoint),
      reorderQuantity: product.reorderQuantity ? Number(product.reorderQuantity) : null,
      status: product.status,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
