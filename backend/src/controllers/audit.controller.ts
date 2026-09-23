import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { createError } from '../middlewares/error.js';
import { AuditService } from '../services/audit.service.js';

const one = (value: unknown) => Array.isArray(value) ? value[0] : value;
export class AuditController {
  static async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const filters = Object.fromEntries(Object.entries(req.query).map(([key, value]) => [key, one(value)]));
      res.json({ success: true, data: await AuditService.list(filters) });
    } catch (error) { next(error); }
  }

  static async verifyIntegrity(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      res.json({ success: true, data: await AuditService.verifyIntegrity(req.user, { ipAddress: req.ip, userAgent: req.get('user-agent') }) });
    } catch (error) { next(error); }
  }
}
