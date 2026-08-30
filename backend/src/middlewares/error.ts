import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Centralized error-handling middleware.
 * - Returns structured JSON.
 * - Hides stack traces in production.
 * - Never leaks credentials, secrets, or internal paths.
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.statusCode ?? 500;

  const body: Record<string, unknown> = {
    status: 'error',
    message: err.message || 'An unexpected error occurred.',
  };

  // Only expose stack traces in non-production environments
  if (!isProduction && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

/**
 * Helper to create a structured operational error with an HTTP status code.
 */
export function createError(message: string, statusCode = 500): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}
