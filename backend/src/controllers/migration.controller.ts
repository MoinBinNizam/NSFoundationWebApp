import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { MigrationService } from '../services/migration.service.js';
import { HistoricalSyncService } from '../services/historicalSync.service.js';
import { MigrationRecordStatus } from '../types/models.js';
import { createError } from '../middlewares/error.js';

export class MigrationController {
  static async stage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const batch = await MigrationService.stageCsv(
        { ...req.body, sourceYear: Number(req.body.sourceYear) },
        req.user,
        { ip: req.ip, userAgent: req.headers['user-agent'] }
      );
      res.status(201).json({
        success: true,
        message: 'Historical rows were staged. No production records were changed.',
        data: batch,
      });
    } catch (error) {
      next(error);
    }
  }

  static async batches(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await MigrationService.listBatches() });
    } catch (error) {
      next(error);
    }
  }

  static async records(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as MigrationRecordStatus | undefined;
      res.json({ success: true, data: await MigrationService.listRecords(req.params.id, status) });
    } catch (error) {
      next(error);
    }
  }

  static async review(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const { status, reason } = req.body;
      if (!Object.values(MigrationRecordStatus).includes(status)) {
        return next(createError('Invalid migration status.', 400));
      }
      res.json({
        success: true,
        data: await MigrationService.reviewRecord(req.params.id, status, reason, req.user),
      });
    } catch (error) {
      next(error);
    }
  }

  static async reconciliation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await MigrationService.reconciliation(req.params.id) });
    } catch (error) {
      next(error);
    }
  }

  // ─── NEW ONE-CLICK ACTIONABLE ENDPOINTS ──────────────────────────────────────

  static async overview(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await HistoricalSyncService.getOverview();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async syncMembers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const dryRun = Boolean(req.body.dryRun);
      const force = Boolean(req.body.force);
      const result = await HistoricalSyncService.syncMembers(dryRun, req.user, force);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async sync2024(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const dryRun = Boolean(req.body.dryRun);
      const force = Boolean(req.body.force);
      const result = await HistoricalSyncService.sync2024(dryRun, req.user, force);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async sync2025(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const dryRun = Boolean(req.body.dryRun);
      const force = Boolean(req.body.force);
      const result = await HistoricalSyncService.sync2025(dryRun, req.user, force);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async syncExpenses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const dryRun = Boolean(req.body.dryRun);
      const force = Boolean(req.body.force);
      const result = await HistoricalSyncService.syncExpenses(dryRun, req.user, force);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async syncInvestments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const dryRun = Boolean(req.body.dryRun);
      const force = Boolean(req.body.force);
      const result = await HistoricalSyncService.syncInvestments(dryRun, req.user, force);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async purgeMembers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const result = await HistoricalSyncService.purgeMembers(req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async purge2024(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const result = await HistoricalSyncService.purge2024(req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async purge2025(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const result = await HistoricalSyncService.purge2025(req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async purgeExpenses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const result = await HistoricalSyncService.purgeExpenses(req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async purgeInvestments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const result = await HistoricalSyncService.purgeInvestments(req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async history(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const logs = await HistoricalSyncService.getHistory();
      res.json({ success: true, data: logs });
    } catch (error) {
      next(error);
    }
  }

  static async getModuleVisibility(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await HistoricalSyncService.getModuleVisibility();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async setModuleVisibility(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const enabled = Boolean(req.body.enabled);
      const data = await HistoricalSyncService.setModuleVisibility(enabled, req.user);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
}
