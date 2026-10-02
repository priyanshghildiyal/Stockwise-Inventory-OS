import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/authorization.js';
import { permissions } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import type { InventoryStore } from './store.js';

const adjustmentSchema = z.object({
  productId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  type: z.enum(['RECEIPT', 'ADJUSTMENT', 'SHIPMENT']).default('ADJUSTMENT'),
  reason: z.string().trim().min(1).max(200),
});

const reservationSchema = z.object({
  productId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  reason: z.string().trim().min(1).max(200).default('Reservation'),
});

export const createInventoryRouter = ({ inventory, products, warehouses }: {
  inventory: InventoryStore;
  products: { list: (organizationId: string, search?: string) => Promise<any[]> };
  warehouses: { list: (organizationId: string) => Promise<any[]> };
}) => {
  const router = Router();

  router.get('/movements', requirePermission(permissions.inventoryRead), async (request, response, next) => {
    try {
      const productId = typeof request.query.productId === 'string' ? request.query.productId : undefined;
      const items = await inventory.listMovements(request.auth!.user.organizationId, productId);
      response.json({ data: { items } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/adjustments', requirePermission(permissions.inventoryAdjust), async (request, response, next) => {
    try {
      const input = adjustmentSchema.parse(request.body);
      const product = (await products.list(request.auth!.user.organizationId)).find((entry) => entry.id === input.productId);
      const warehouse = (await warehouses.list(request.auth!.user.organizationId)).find((entry) => entry.id === input.warehouseId);
      if (!product || !warehouse) {
        return next(new HttpError(404, 'RESOURCE_NOT_FOUND', 'Product or warehouse not found in this organization.'));
      }
      const result = await inventory.adjust({
        organizationId: request.auth!.user.organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        type: input.type,
        reason: input.reason,
        createdByUserId: request.auth!.user.id,
      });
      if (result.error) return next(new HttpError(409, 'INVENTORY_INVALID_OPERATION', result.error));
      response.status(201).json({ data: result.movement });
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.'));
      next(error);
    }
  });

  router.post('/reservations', requirePermission(permissions.inventoryReserve), async (request, response, next) => {
    try {
      const input = reservationSchema.parse(request.body);
      const product = (await products.list(request.auth!.user.organizationId)).find((entry) => entry.id === input.productId);
      const warehouse = (await warehouses.list(request.auth!.user.organizationId)).find((entry) => entry.id === input.warehouseId);
      if (!product || !warehouse) {
        return next(new HttpError(404, 'RESOURCE_NOT_FOUND', 'Product or warehouse not found in this organization.'));
      }
      const result = await inventory.reserve({
        organizationId: request.auth!.user.organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        reason: input.reason,
        createdByUserId: request.auth!.user.id,
      });
      if (result.error) return next(new HttpError(409, 'INVENTORY_INVALID_OPERATION', result.error));
      response.status(201).json({ data: result.reservation });
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.'));
      next(error);
    }
  });

  return router;
};
