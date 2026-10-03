import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { AnnualClosing, Expense, InvestmentProject, InvestmentReturn, Member, Payment, MonthlyLedger, ShareHistory } from '../models/index.js';
import { UserRole } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { getMemberTransparencySettings } from '../services/settings.service.js';

export async function getMyPortal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('This account is not linked to a member profile.', 403));
    const member = await Member.findById(req.user.memberId).lean();
    if (!member) return next(createError('Linked member profile was not found.', 404));
    const [share, payments, ledgers] = await Promise.all([
      ShareHistory.findOne({ memberId: member._id }).sort({ effectiveMonth: -1, createdAt: -1 }).lean(),
      Payment.find({ memberId: member._id }).select('receiptNumber paymentDate totalAmount principalAmount penaltyAmount advanceAmount cashoutCharge paymentMethod status').sort({ paymentDate: -1 }).limit(50).lean(),
      MonthlyLedger.find({ memberId: member._id }).sort({ month: -1 }).limit(24).lean(),
    ]);
    const due = ledgers.filter((item) => item.status === 'DUE' || item.status === 'PARTIAL').reduce((sum, item) => sum + Math.max(0, item.principalDue + item.penaltyDue - item.principalPaid - item.penaltyPaid - (item.penaltyWaived || 0)), 0);
    const advance = ledgers.reduce((sum, item) => sum + Number(item.excessAdvance || 0), 0);
    res.json({ success: true, data: { member, currentShares: share?.shareCount || 1, due, advance, payments, ledgers } });
  } catch (error) { next(error); }
}

/**
 * Member-safe organization overview. This deliberately omits custody accounts,
 * individual member data, funding sources, and audit-log details.
 */
export async function getOrganizationTransparency(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
    const disclosure = await getMemberTransparencySettings();
    const result: Record<string, unknown> = { disclosure };
    const [collections, expenses, returns, projects, annualClosings] = await Promise.all([
      disclosure.showCollections ? Payment.aggregate([{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]) : [],
      disclosure.showExpenses ? Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]) : [],
      disclosure.showRealizedProfit ? InvestmentReturn.aggregate([{ $group: { _id: null, profit: { $sum: '$actualProfit' }, loss: { $sum: '$actualLoss' } } }]) : [],
      disclosure.showInvestmentProjects || disclosure.showExpectedProfit ? InvestmentProject.find({ status: { $in: ['ACTIVE', 'MATURED'] } }).select('projectId name category status startDate maturityDate totalFunded expectedROI').sort({ startDate: -1 }).lean() : [],
      disclosure.allowAnnualProfitLossDownload ? AnnualClosing.find({ status: 'LOCKED' }).select('year').sort({ year: -1 }).lean() : [],
    ]);
    if (disclosure.showCollections) result.collections = Number(collections[0]?.total || 0);
    if (disclosure.showExpenses) result.expenses = Number(expenses[0]?.total || 0);
    if (disclosure.showRealizedProfit) {
      const realizedProfit = Number(returns[0]?.profit || 0);
      const realizedLoss = Number(returns[0]?.loss || 0);
      result.realizedProfit = realizedProfit;
      result.realizedLoss = realizedLoss;
      result.netRealizedProfit = realizedProfit - realizedLoss;
    }
    const safeProjects = projects.map((project) => ({
      projectId: project.projectId,
      name: project.name,
      category: project.category || 'General',
      status: project.status,
      startDate: project.startDate,
      maturityDate: project.maturityDate || null,
      totalFunded: project.totalFunded,
      expectedROI: project.expectedROI ?? null,
    }));
    if (disclosure.showInvestmentProjects) result.projects = safeProjects;
    if (disclosure.showExpectedProfit) {
      result.expectedProfit = safeProjects.filter((project) => project.status === 'ACTIVE').reduce((sum, project) => sum + Number(project.totalFunded || 0) * Number(project.expectedROI || 0) / 100, 0);
    }
    if (disclosure.allowAnnualProfitLossDownload) result.availableAnnualReportYears = annualClosings.map((closing) => closing.year);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export function requireOwnMember(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
  if (req.user.role === UserRole.MEMBER && String(req.user.memberId) !== req.params.memberId) return next(createError('Members may access only their own records.', 403));
  next();
}
