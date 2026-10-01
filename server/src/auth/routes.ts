import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../http/errors.js';
import { config } from '../config.js';
import { AuthService } from './service.js';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
});
const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(100),
  organizationName: z.string().trim().min(2).max(120),
});

const setSessionCookie = (response: any, token: string, expiresAt: string) => {
  response.cookie(config.COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  });
};

export const createAuthRouter = (auth: AuthService) => {
  const router = Router();

  router.post('/register', async (request, response, next) => {
    try {
      const input = registrationSchema.parse(request.body);
      const result = await auth.register(input);
      setSessionCookie(response, result.token, result.expiresAt);
      response.status(201).json({ data: { user: result.user, expiresAt: result.expiresAt } });
    } catch (error) {
      next(error instanceof z.ZodError ? new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.') : error);
    }
  });

  router.post('/login', async (request, response, next) => {
    try {
      const input = credentialsSchema.parse(request.body);
      const result = await auth.login(input.email, input.password);
      setSessionCookie(response, result.token, result.expiresAt);
      response.json({ data: { user: result.user, expiresAt: result.expiresAt } });
    } catch (error) {
      next(error instanceof z.ZodError ? new HttpError(400, 'VALIDATION_ERROR', 'Request validation failed.') : error);
    }
  });

  router.post('/logout', async (request, response, next) => {
    const token = request.cookies[config.COOKIE_NAME];
    try {
      if (token) await auth.logout(token);
      response.clearCookie(config.COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/' });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get('/me', (request, response, next) => {
    if (!request.auth) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    response.json({ data: { user: request.auth.user } });
  });

  return router;
};
