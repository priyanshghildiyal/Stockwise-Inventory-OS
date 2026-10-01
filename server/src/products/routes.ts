import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/authorization.js';
import { permissions } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import type { ProductStore } from './store.js';

const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(120).optional().nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  category: z.string().trim().max(120).optional().nullable(),
  unit: z.string().trim().min(1).max(40).default('units'),
  cost: z.number().finite().nonnegative().optional().nullable(),
  sellingPrice: z.number().finite().nonnegative().optional().nullable(),
  reorderPoint: z.number().finite().nonnegative().default(0),
  reorderQuantity: z.number().finite().nonnegative().optional().nullable(),
});

export const createProductRouter = (products: ProductStore) => {
  const router = Router();

  router.get('/', requirePermission(permissions.productRead), async (request, response, next) => {
    try {
      const search = typeof request.query.search === 'string' ? request.query.search : undefined;
      const records = await products.list(request.auth!.user.organizationId, search);
      response.json({ data: { items: records } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requirePermission(permissions.productCreate), async (request, response, next) => {
    try {
      const input = productSchema.parse(request.body);
      const organizationId = request.auth!.user.organizationId;
      const record = await products.create({
        organizationId,
        sku: input.sku,
        barcode: input.barcode ?? null,
        name: input.name,
        description: input.description ?? null,
        category: input.category ?? null,
        unit: input.unit,
        cost: input.cost ?? null,
        sellingPrice: input.sellingPrice ?? null,
        reorderPoint: input.reorderPoint,
        reorderQuantity: input.reorderQuantity ?? null,
      });
      response.status(201).json({ data: record });
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.'));
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
        return next(new HttpError(409, 'PRODUCT_SKU_EXISTS', 'A product with this SKU already exists.'));
      }
      next(error);
    }
  });

  return router;
};
