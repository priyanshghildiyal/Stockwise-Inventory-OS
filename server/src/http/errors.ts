import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const status = error instanceof HttpError ? error.status : error.name === 'ConflictError' ? 409 : error.name === 'AuthenticationError' ? 401 : 500;
  const code = error instanceof HttpError ? error.code : error.name === 'ConflictError' ? 'EMAIL_EXISTS' : error.name === 'AuthenticationError' ? 'INVALID_CREDENTIALS' : 'INTERNAL_ERROR';
  if (status >= 500) request.log.error({ err: error }, 'request failed');
  response.status(status).json({ error: { code, message: status >= 500 ? 'An unexpected error occurred.' : error.message, requestId: request.id } });
};
