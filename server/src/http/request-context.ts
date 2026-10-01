import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: {
        user: {
          id: string;
          email: string;
          name: string;
          organizationId: string;
          organization: string;
          role: string;
        };
        token: string;
      };
    }
  }
}

export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = request.header('x-request-id') || randomUUID();
  request.id = requestId;
  response.setHeader('x-request-id', requestId);
  next();
};
