import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { IdempotencyKey } from '../models/IdempotencyKey.js';
import { AuthRequest } from './auth.js';
import { createError } from './error.js';

const attempts = new Map<string, { count: number; resetAt: number }>();
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID(); res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  next();
}
export function loginRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const key = `${req.ip}:${String(req.body?.email || '').toLowerCase()}`; const now = Date.now(); const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= 10) return next(createError('Too many sign-in attempts. Please try again in 15 minutes.', 429));
  attempts.set(key, { count: current && current.resetAt > now ? current.count + 1 : 1, resetAt: now + 15 * 60 * 1000 }); next();
}
export function financialIdempotency(operation: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const key = req.header('Idempotency-Key'); if (!key || key.length < 16 || key.length > 200) return next(createError('A valid Idempotency-Key header is required for this financial operation.', 400));
      const actorId = req.user._id;
      try { await IdempotencyKey.create({ actorId, operation, key }); }
      catch (error: unknown) {
        if (!(error as { code?: number }).code || (error as { code?: number }).code !== 11000) throw error;
        const prior = await IdempotencyKey.findOne({ actorId, operation, key }).lean();
        if (prior?.status === 'COMPLETED' && prior.responseBody) { res.status(prior.responseStatus || 200).json(prior.responseBody); return; }
        return next(createError('This operation is already being processed. Please wait before retrying.', 409));
      }
      const originalJson = res.json.bind(res);
      res.json = ((body: Record<string, unknown>) => {
        const status = res.statusCode;
        if (status >= 200 && status < 400) void IdempotencyKey.updateOne({ actorId, operation, key }, { status: 'COMPLETED', responseStatus: status, responseBody: body });
        else void IdempotencyKey.deleteOne({ actorId, operation, key });
        return originalJson(body);
      }) as Response['json'];
      next();
    } catch (error) { next(error); }
  };
}
