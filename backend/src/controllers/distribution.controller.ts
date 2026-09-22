import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { DistributionService } from '../services/distribution.service.js';
import { createError } from '../middlewares/error.js';
import { getOperationalEndYear } from '../services/settings.service.js';

export class DistributionController {
  static async preview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year, customProfitAmount, retainedAmount, basis } = req.query;
      const operationalEndYear = (await getOperationalEndYear()).value;
      if (Number(year) > operationalEndYear) return next(createError(`The operational end year is currently approved through ${operationalEndYear}.`, 400));
      const preview = await DistributionService.calculatePreview({
        year: Number(year),
        customProfitAmount: customProfitAmount ? Number(customProfitAmount) : undefined,
        retainedAmount: retainedAmount ? Number(retainedAmount) : undefined,
        basis: basis as any,
      });
      res.json({ success: true, data: preview });
    } catch (error) {
      next(error);
    }
  }

  static async createBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const batch = await DistributionService.createBatch(req.body, req.user);
      res.status(201).json({ success: true, data: batch });
    } catch (error) {
      next(error);
    }
  }

  static async reviewBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const batch = await DistributionService.reviewBatch(req.params.id, req.user);
      res.json({ success: true, data: batch });
    } catch (error) {
      next(error);
    }
  }

  static async approveBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const batch = await DistributionService.approveBatch(req.params.id, req.user);
      res.json({ success: true, data: batch });
    } catch (error) {
      next(error);
    }
  }

  static async executePayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const { custodyAccountId } = req.body;
      if (!custodyAccountId) {
        return next(createError('Custody account ID is required for payout.', 400));
      }
      const result = await DistributionService.executePayment(
        req.params.id,
        custodyAccountId,
        req.user
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async listBatches(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const batches = await DistributionService.getBatches(req.query as any);
      res.json({ success: true, data: batches });
    } catch (error) {
      next(error);
    }
  }

  static async getBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await DistributionService.getBatchById(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async exportCsv(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const csv = await DistributionService.exportBatchCsv(req.params.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="distribution-batch-${req.params.id}.csv"`
      );
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
}
