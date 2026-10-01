import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/authorization.js';
import { permissions } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import type { WarehouseStore } from './store.js';

const warehouseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  capacity: z.number().finite().positive().optional().nullable(),
});

export const createWarehouseRouter = (warehouses: WarehouseStore) => {
  const router = Router();
  router.get('/', requirePermission(permissions.warehouseRead), async (request, response, next) => {
    try {
      response.json({ data: { items: await warehouses.list(request.auth!.user.organizationId) } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requirePermission(permissions.warehouseManage), async (request, response, next) => {
    try {
      const input = warehouseSchema.parse(request.body);
      const record = await warehouses.create({ organizationId: request.auth!.user.organizationId, name: input.name, capacity: input.capacity ?? null });
      response.status(201).json({ data: record });
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.'));
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return next(new HttpError(409, 'WAREHOUSE_EXISTS', 'A warehouse with this name already exists.'));
      next(error);
    }
  });

  return router;
};
