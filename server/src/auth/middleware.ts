import type { RequestHandler } from 'express';
import { AuthService } from './service.js';
import { config } from '../config.js';

export const attachAuth = (auth: AuthService): RequestHandler => async (request, _response, next) => {
  try {
    const token = request.cookies[config.COOKIE_NAME];
    if (token) {
      const result = await auth.authenticate(token);
      if (result) request.auth = { user: result.user, token };
    }
    next();
  } catch (error) {
    next(error);
  }
};
