import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { MigrationService } from '../services/migration.service.js';
import { MigrationRecordStatus } from '../types/models.js';
import { createError } from '../middlewares/error.js';

export class MigrationController {
  static async stage(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); const batch = await MigrationService.stageCsv({ ...req.body, sourceYear: Number(req.body.sourceYear) }, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] }); res.status(201).json({ success: true, message: 'Historical rows were staged. No production records were changed.', data: batch }); } catch (error) { next(error); } }
  static async batches(_req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await MigrationService.listBatches() }); } catch (error) { next(error); } }
  static async records(req: AuthRequest, res: Response, next: NextFunction) { try { const status = req.query.status as MigrationRecordStatus | undefined; res.json({ success: true, data: await MigrationService.listRecords(req.params.id, status) }); } catch (error) { next(error); } }
  static async review(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); const { status, reason } = req.body; if (!Object.values(MigrationRecordStatus).includes(status)) return next(createError('Invalid migration status.', 400)); res.json({ success: true, data: await MigrationService.reviewRecord(req.params.id, status, reason, req.user) }); } catch (error) { next(error); } }
  static async reconciliation(req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await MigrationService.reconciliation(req.params.id) }); } catch (error) { next(error); } }
}
