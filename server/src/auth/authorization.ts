import type { RequestHandler } from 'express';
import { HttpError } from '../http/errors.js';
import { hasPermission, type Permission } from './permissions.js';

export const requirePermission = (permission: Permission): RequestHandler => (request, _response, next) => {
  const role = request.auth?.user.role;
  if (!role) return next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
  if (!hasPermission(role as Parameters<typeof hasPermission>[0], permission)) {
    return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
  }
  next();
};
