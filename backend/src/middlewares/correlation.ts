import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/**
 * Middleware: Attaches a unique correlation ID to every incoming request.
 * If the client sends an 'x-correlation-id' header, it is reused;
 * otherwise, a new secure random identifier is generated.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.headers['x-correlation-id'];
  const correlationId = (typeof existingId === 'string' && existingId.trim().length > 0)
    ? existingId.trim()
    : `corr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
}
