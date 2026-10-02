import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/authorization.js';
import { permissions } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import type { BusinessStore } from './store.js';

const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});

const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});

const orderSchema = z.object({
  type: z.enum(['PURCHASE', 'SALE']),
  reference: z.string().trim().min(1).max(120),
  customerOrSupplier: z.string().trim().min(1).max(160),
  status: z.enum(['DRAFT', 'APPROVED', 'RECEIVED', 'SHIPPED', 'COMPLETED']).optional(),
  total: z.number().finite().nonnegative().optional(),
});

export const createBusinessRouter = (business: BusinessStore) => {
  const router = Router();

  router.get('/suppliers', requirePermission(permissions.supplierRead), async (request, response, next) => {
    try {
      response.json({ data: { items: await business.listSuppliers(request.auth!.user.organizationId) } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/suppliers', requirePermission(permissions.supplierManage), async (request, response, next) => {
    try {
      const input = supplierSchema.parse(request.body);
      const record = await business.createSupplier(request.auth!.user.organizationId, input);
      response.status(201).json({ data: record });
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.'));
      next(error);
    }
  });

  router.get('/customers', requirePermission(permissions.customerRead), async (request, response, next) => {
    try {
      response.json({ data: { items: await business.listCustomers(request.auth!.user.organizationId) } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/customers', requirePermission(permissions.customerManage), async (request, response, next) => {
    try {
      const input = customerSchema.parse(request.body);
      const record = await business.createCustomer(request.auth!.user.organizationId, input);
      response.status(201).json({ data: record });
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.'));
      next(error);
    }
  });

  router.get('/orders', requirePermission(permissions.salesRead), async (request, response, next) => {
    try {
      response.json({ data: { items: await business.listOrders(request.auth!.user.organizationId) } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/orders', requirePermission(permissions.salesCreate), async (request, response, next) => {
    try {
      const input = orderSchema.parse(request.body);
      const record = await business.createOrder(request.auth!.user.organizationId, input);
      response.status(201).json({ data: record });
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.'));
      next(error);
    }
  });

  return router;
};
