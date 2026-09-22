import { NextFunction, Request, Response } from 'express';
import { createError } from './error.js';

/** Reject MongoDB operator keys and normalize strings before application code
 * receives request data. Mongoose queries remain parameterized objects. */
function clean(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/<[^>]*>/g, '').trim();
  }
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith('$') || key.includes('.')) throw createError('Request contains an invalid field name.', 400);
      output[key] = clean(child);
    }
    return output;
  }
  return value;
}

export function sanitizeRequest(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (req.body && typeof req.body === 'object') req.body = clean(req.body);
    next();
  } catch (error) { next(error); }
}

export function normalizePhone(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\s().-]/g, '');
  if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) {
    throw createError('Phone number must use an international E.164 format, for example +8801712345678.', 400);
  }
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}
