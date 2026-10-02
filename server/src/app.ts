import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { PrismaClient } from '@prisma/client';
import { AuthService } from './auth/service.js';
import { attachAuth } from './auth/middleware.js';
import { createAuthRouter } from './auth/routes.js';
import { MemoryAuthStore } from './auth/store.js';
import { PrismaAuthStore } from './auth/prisma-store.js';
import { config } from './config.js';
import { errorHandler, notFound } from './http/errors.js';
import { requestContext } from './http/request-context.js';
import { createProductRouter } from './products/routes.js';
import { MemoryProductStore, PrismaProductStore } from './products/store.js';
import { createWarehouseRouter } from './warehouses/routes.js';
import { MemoryWarehouseStore, PrismaWarehouseStore } from './warehouses/store.js';
import { createInventoryRouter } from './inventory/routes.js';
import { MemoryInventoryStore, PrismaInventoryStore } from './inventory/store.js';
import { createBusinessRouter } from './business/routes.js';
import { MemoryBusinessStore, PrismaBusinessStore } from './business/store.js';

const shouldUseDatabase = config.useDatabase && !!config.DATABASE_URL;

const createDefaultAuth = () => {
  if (config.isProduction) {
    if (!shouldUseDatabase) {
      throw new Error('Production requires USE_DATABASE=true with a valid DATABASE_URL.');
    }
    return { auth: new AuthService(new PrismaAuthStore(prisma!)), persistence: 'postgresql' };
  }
  if (shouldUseDatabase) {
    return { auth: new AuthService(new PrismaAuthStore(prisma!)), persistence: 'postgresql' };
  }
  return { auth: new AuthService(new MemoryAuthStore()), persistence: 'memory-dev-adapter' };
};

const prisma = config.DATABASE_URL ? new PrismaClient() : null;

export const createApp = (providedAuth?: AuthService) => {
  const defaultAuth = providedAuth ? null : createDefaultAuth();
  const auth = providedAuth || defaultAuth!.auth;
  const persistence = providedAuth ? 'injected-test-adapter' : defaultAuth!.persistence;
  const products = shouldUseDatabase ? new PrismaProductStore(prisma!) : new MemoryProductStore();
  const warehouses = shouldUseDatabase ? new PrismaWarehouseStore(prisma!) : new MemoryWarehouseStore();
  const inventory = shouldUseDatabase ? new PrismaInventoryStore(prisma!) : new MemoryInventoryStore();
  const business = shouldUseDatabase ? new PrismaBusinessStore(prisma!) : new MemoryBusinessStore();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(requestContext);
  app.use(pinoHttp({
    redact: ['req.headers.cookie', 'req.headers.authorization'],
    customProps: (request: express.Request) => ({ requestId: request.id }),
  }));
  app.use(helmet({ contentSecurityPolicy: config.isProduction ? undefined : false }));
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/ready', (_request, response) => response.json({ status: 'ready', persistence }));
  app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }), attachAuth(auth), createAuthRouter(auth));
  app.use('/api/v1/products', attachAuth(auth), createProductRouter(products));
  app.use('/api/v1/warehouses', attachAuth(auth), createWarehouseRouter(warehouses));
  app.use('/api/v1/inventory', attachAuth(auth), createInventoryRouter({ inventory, products, warehouses }));
  app.use('/api/v1', attachAuth(auth), createBusinessRouter(business));
  app.use(notFound);
  app.use(errorHandler);
  return app;
};
