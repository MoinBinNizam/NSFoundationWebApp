import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { createError } from '../middlewares/error.js';
import { ReportingService, reportTypes, ReportType } from '../services/reporting.service.js';

const query = (input: Record<string, unknown>) => Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
export class ReportingController {
  static async dashboard(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required', 401)); res.json({ success: true, data: await ReportingService.getDashboard(query(req.query), req.user) }); } catch (error) { next(error); } }
  static async report(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required', 401)); const type = req.params.type as ReportType; if (!reportTypes.includes(type)) return next(createError('Unknown report type', 404)); res.json({ success: true, data: await ReportingService.getReport(type, query(req.query), req.user) }); } catch (error) { next(error); } }
  static async exportCsv(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required', 401)); const type = req.params.type as ReportType; if (!reportTypes.includes(type)) return next(createError('Unknown report type', 404)); const result = await ReportingService.getReport(type, { ...query(req.query), page: 1, limit: 100 }, req.user); const date = new Date().toISOString().slice(0, 10); res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="ns-foundation-${type}-report-${date}.csv"`); res.send(ReportingService.csv(result.rows)); } catch (error) { next(error); } }
}
