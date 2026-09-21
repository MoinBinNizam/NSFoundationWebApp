import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { Expense } from '../models/Expense.js';
import { MonthlyLedger } from '../models/MonthlyLedger.js';
import { Payment } from '../models/Payment.js';
import { Member } from '../models/Member.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { InvestmentProject } from '../models/InvestmentProject.js';
import { CustodyService } from './custody.service.js';
import { InvestmentService } from './investment.service.js';
import { IUser, UserRole, AccountantType } from '../types/models.js';
import { createError } from '../middlewares/error.js';

export type ReportType = 'collection' | 'custody' | 'investments' | 'expenses' | 'dues';
export const reportTypes: ReportType[] = ['collection', 'custody', 'investments', 'expenses', 'dues'];

const isAdmin = (user: IUser) => user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
export const canAccessInvestments = (user: IUser) => isAdmin(user) || user.accountantType === AccountantType.PRIMARY;
const objectId = (user: IUser) => (user as unknown as { _id: Types.ObjectId })._id;
const dates = (query: Record<string, unknown>, field: string) => {
  const date: Record<string, Date> = {};
  if (query.startDate) date.$gte = new Date(String(query.startDate));
  if (query.endDate) { const end = new Date(String(query.endDate)); end.setHours(23, 59, 59, 999); date.$lte = end; }
  return Object.keys(date).length ? { [field]: date } : {};
};
const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthRange = (query: Record<string, unknown>) => {
  const end = query.endDate ? new Date(String(query.endDate)) : new Date();
  const start = query.startDate ? new Date(String(query.startDate)) : new Date(end.getFullYear(), end.getMonth() - 5, 1);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  const months: string[] = [];
  while (cursor <= last && months.length < 120) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.slice(-12);
};
const monthBounds = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(year, monthNumber - 1, 1),
    end: new Date(year, monthNumber, 0, 23, 59, 59, 999),
  };
};
const monthlyOutstanding = (ledger: any) => Math.max(0, Number(ledger.principalDue || 0) + Number(ledger.penaltyDue || 0) - Number(ledger.principalPaid || 0) - Number(ledger.penaltyPaid || 0));
const percentageChange = (current: number, previous: number) => previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
const activityPageSize = 10;
const mapActivity = (item: any) => ({ id: item._id, action: item.action, entityName: item.entityName, reason: item.reason, createdAt: item.createdAt, performedBy: item.performedBy?.name || 'System' });
const paginate = <T>(rows: T[], query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page) || 1); const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
  const search = String(query.search || '').trim().toLowerCase();
  const filtered = search ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search)) : rows;
  const sortBy = String(query.sortBy || 'date'); const direction = String(query.sortDirection).toLowerCase() === 'asc' ? 1 : -1;
  filtered.sort((a: any, b: any) => { const av = a[sortBy] ?? ''; const bv = b[sortBy] ?? ''; return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * direction; });
  return { rows: filtered.slice((page - 1) * limit, page * limit), pagination: { total: filtered.length, page, limit, totalPages: Math.max(1, Math.ceil(filtered.length / limit)) } };
};

export class ReportingService {
  static async getDashboard(query: Record<string, unknown>, user: IUser) {
    const scoped = !isAdmin(user); const userId = objectId(user); const paymentFilter: Record<string, unknown> = { ...dates(query, 'paymentDate') }; const expenseFilter: Record<string, unknown> = { ...dates(query, 'date') };
    if (scoped) { paymentFilter.receiverId = userId; expenseFilter.createdBy = userId; }
    const activityFilter = scoped ? { performedBy: userId } : {};
    const trendMonths = monthRange(query);
    const trendBounds = monthBounds(trendMonths[0] || currentMonth());
    const trendEnd = monthBounds(trendMonths[trendMonths.length - 1] || currentMonth()).end;
    const trendPaymentFilter = { ...(scoped ? { receiverId: userId } : {}), paymentDate: { $gte: query.startDate ? new Date(String(query.startDate)) : trendBounds.start, $lte: query.endDate ? (() => { const end = new Date(String(query.endDate)); end.setHours(23, 59, 59, 999); return end; })() : trendEnd } };
    const trendExpenseFilter = { ...(scoped ? { createdBy: userId } : {}), date: { $gte: query.startDate ? new Date(String(query.startDate)) : trendBounds.start, $lte: query.endDate ? (() => { const end = new Date(String(query.endDate)); end.setHours(23, 59, 59, 999); return end; })() : trendEnd } };
    const [payment, expense, accounts, activity, activityTotal, members, investment, dueLedgers, paymentTrend, expenseTrend, duesTrend, maturingProjects] = await Promise.all([
      Payment.aggregate([{ $match: paymentFilter }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 }, principal: { $sum: '$principalAmount' }, penalty: { $sum: '$penaltyAmount' } } }]),
      Expense.aggregate([{ $match: expenseFilter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      CustodyService.getCustodyAccounts({ isActive: true }),
      AuditLog.find(activityFilter).populate('performedBy', 'name email accountantType').sort({ createdAt: -1, _id: -1 }).limit(activityPageSize),
      AuditLog.countDocuments(activityFilter),
      Member.countDocuments({ status: 'ACTIVE' }),
      canAccessInvestments(user) ? InvestmentService.getInvestmentStats() : Promise.resolve(null),
      MonthlyLedger.find({ month: { $gte: '2024-01', $lte: currentMonth() } }).select('memberId month principalDue penaltyDue principalPaid penaltyPaid').lean(),
      Payment.aggregate([{ $match: trendPaymentFilter }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } }, total: { $sum: '$totalAmount' } } }]),
      Expense.aggregate([{ $match: trendExpenseFilter }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, total: { $sum: '$amount' } } }]),
      MonthlyLedger.aggregate([
        { $match: { month: { $gte: trendMonths[0] || currentMonth(), $lte: trendMonths[trendMonths.length - 1] || currentMonth() } } },
        { $project: { month: 1, outstanding: { $max: [0, { $subtract: [{ $add: ['$principalDue', '$penaltyDue'] }, { $add: ['$principalPaid', '$penaltyPaid'] }] }] } } },
        { $group: { _id: '$month', total: { $sum: '$outstanding' } } },
      ]),
      canAccessInvestments(user)
        ? InvestmentProject.find({ status: 'ACTIVE', maturityDate: { $exists: true, $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } }).select('projectId name maturityDate').sort({ maturityDate: 1 }).limit(5).lean()
        : Promise.resolve([]),
    ]);
    const visibleAccounts = scoped ? accounts.filter((account: any) => String(account.holderId?._id || account.holderId) === String(userId)) : accounts;
    const currentCustody = visibleAccounts.reduce((sum: number, account: any) => sum + account.derivedBalance, 0);
    const previousMonthEnd = new Date(); previousMonthEnd.setDate(0); previousMonthEnd.setHours(23, 59, 59, 999);
    const custodySnapshot = visibleAccounts.length
      ? await CustodyMovement.aggregate([
          { $match: { custodyAccountId: { $in: visibleAccounts.map((account: any) => account._id) }, date: { $lte: previousMonthEnd } } },
          { $group: { _id: '$movementType', total: { $sum: '$amount' } } },
        ])
      : [];
    const previousCustody = custodySnapshot.reduce((total: number, item: any) => total + (item._id === 'IN' ? item.total : -item.total), 0);
    const paymentTrendByMonth = new Map(paymentTrend.map((item: any) => [item._id, item.total]));
    const expenseTrendByMonth = new Map(expenseTrend.map((item: any) => [item._id, item.total]));
    const duesTrendByMonth = new Map(duesTrend.map((item: any) => [item._id, item.total]));
    const trend = trendMonths.map((month) => ({ month, collections: paymentTrendByMonth.get(month) || 0, expenses: expenseTrendByMonth.get(month) || 0, dues: duesTrendByMonth.get(month) || 0 }));
    const currentTrend = trend[trend.length - 1] || { month: currentMonth(), collections: 0, expenses: 0, dues: 0 };
    const previousTrend = trend[trend.length - 2] || { collections: 0, expenses: 0, dues: 0 };
    const dueAging = [
      { label: '0–30 days', min: 0, max: 30, total: 0, count: 0 },
      { label: '31–60 days', min: 31, max: 60, total: 0, count: 0 },
      { label: '61–90 days', min: 61, max: 90, total: 0, count: 0 },
      { label: '90+ days', min: 91, max: Number.POSITIVE_INFINITY, total: 0, count: 0 },
    ];
    const overdueMemberIds = new Set<string>();
    for (const ledger of dueLedgers) {
      const outstanding = monthlyOutstanding(ledger);
      if (!outstanding) continue;
      const monthEnd = monthBounds(ledger.month).end;
      const ageDays = Math.max(0, Math.floor((Date.now() - monthEnd.getTime()) / (24 * 60 * 60 * 1000)));
      const bucket = dueAging.find((item) => ageDays >= item.min && ageDays <= item.max);
      if (bucket) { bucket.total += outstanding; bucket.count += 1; }
      if (ageDays > 30) overdueMemberIds.add(String(ledger.memberId));
    }
    const dues = { total: dueAging.reduce((sum, item) => sum + item.total, 0), count: dueAging.reduce((sum, item) => sum + item.count, 0) };
    const lowBalanceThreshold = 1000;
    const lowCustodyAccounts = visibleAccounts.filter((account: any) => account.derivedBalance <= lowBalanceThreshold).slice(0, 4).map((account: any) => ({ name: account.name, balance: account.derivedBalance }));
    return {
      roleScope: isAdmin(user) ? 'ORGANIZATION' : 'ACCOUNTANT',
      period: { startDate: query.startDate || null, endDate: query.endDate || null },
      metrics: { collection: payment[0] || { total: 0, count: 0, principal: 0, penalty: 0 }, expenses: expense[0] || { total: 0, count: 0 }, dues, custody: currentCustody, activeMembers: members, investments: investment },
      custodyByAccount: visibleAccounts.map((account: any) => ({ name: account.name, channel: account.channel, balance: account.derivedBalance })),
      trend,
      comparisons: {
        period: { current: currentTrend.month, previous: trend[trend.length - 2]?.month || null },
        collections: { previous: previousTrend.collections, change: currentTrend.collections - previousTrend.collections, percentage: percentageChange(currentTrend.collections, previousTrend.collections) },
        expenses: { previous: previousTrend.expenses, change: currentTrend.expenses - previousTrend.expenses, percentage: percentageChange(currentTrend.expenses, previousTrend.expenses) },
        dues: { previous: previousTrend.dues, change: currentTrend.dues - previousTrend.dues, percentage: percentageChange(currentTrend.dues, previousTrend.dues) },
        custody: { previous: previousCustody, change: currentCustody - previousCustody, percentage: percentageChange(currentCustody, previousCustody) },
      },
      alerts: {
        dueAging,
        overdueMembers: overdueMemberIds.size,
        lowBalanceThreshold,
        lowCustodyAccounts,
        investmentMaturities: maturingProjects.map((project: any) => ({ projectId: project.projectId, name: project.name, maturityDate: project.maturityDate, daysRemaining: Math.ceil((new Date(project.maturityDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) })),
      },
      activityTotal,
      recentActivity: activity.map(mapActivity),
      activityPagination: { page: 1, limit: activityPageSize, totalPages: Math.max(1, Math.ceil(activityTotal / activityPageSize)) },
    };
  }

  static async activity(query: Record<string, unknown>, user: IUser) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(activityPageSize, Number(query.limit) || activityPageSize));
    const filter = isAdmin(user) ? {} : { performedBy: objectId(user) };
    const [items, total] = await Promise.all([
      AuditLog.find(filter).populate('performedBy', 'name email accountantType').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      AuditLog.countDocuments(filter),
    ]);
    return { items: items.map(mapActivity), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  static async getReport(type: ReportType, query: Record<string, unknown>, user: IUser) {
    if (!reportTypes.includes(type)) throw createError('Unknown report type', 404);
    if (type === 'collection') return this.collection(query, user);
    if (type === 'custody') return this.custody(query, user);
    if (type === 'investments') return this.investments(query, user);
    if (type === 'expenses') return this.expenses(query, user);
    return this.dues(query);
  }

  static async collection(query: Record<string, unknown>, user: IUser) {
    const filter: Record<string, unknown> = { ...dates(query, 'paymentDate') }; if (!isAdmin(user)) filter.receiverId = objectId(user);
    const payments = await Payment.find(filter).populate('memberId', 'memberId name').populate('receiverId', 'name').populate('custodyAccountId', 'name channel').lean();
    const rows = payments.map((item: any) => ({ receiptNumber: item.receiptNumber, date: item.paymentDate, member: `${item.memberId?.memberId || ''} ${item.memberId?.name || ''}`.trim(), receiver: item.receiverId?.name || '', account: item.custodyAccountId?.name || '', method: item.paymentMethod, principal: item.principalAmount, penalty: item.penaltyAmount, total: item.totalAmount }));
    return { type: 'collection', ...paginate(rows, query) };
  }

  static async custody(query: Record<string, unknown>, user: IUser) {
    const accounts = await CustodyService.getCustodyAccounts({ isActive: true }); const userId = objectId(user);
    const rows = accounts.filter((item: any) => isAdmin(user) || String(item.holderId?._id || item.holderId) === String(userId)).map((item: any) => ({ name: item.name, channel: item.channel, accountType: item.accountType, holder: item.holderId?.name || 'External', totalInflow: item.totalInflow, totalOutflow: item.totalOutflow, balance: item.derivedBalance }));
    return { type: 'custody', ...paginate(rows, query) };
  }

  static async investments(query: Record<string, unknown>, user: IUser) {
    if (!canAccessInvestments(user)) throw createError('Investment reports are restricted to administrators and the primary accountant.', 403);
    const projects = await InvestmentService.getProjects({ search: query.search ? String(query.search) : undefined, status: query.status ? String(query.status) : undefined });
    const rows = projects.map((item: any) => ({ projectId: item.projectId, name: item.name, partner: item.externalEntity || '', status: item.status, targetPrincipal: item.targetPrincipal, totalFunded: item.totalFunded, principalReturned: item.metrics?.totalPrincipalReturned || 0, profit: item.metrics?.netRealizedProfit || 0, outstanding: item.metrics?.netOutstandingCapital || 0, date: item.startDate }));
    return { type: 'investments', ...paginate(rows, query) };
  }

  static async expenses(query: Record<string, unknown>, user: IUser) {
    const filter: Record<string, unknown> = { ...dates(query, 'date') }; if (!isAdmin(user)) filter.createdBy = objectId(user);
    const expenses = await Expense.find(filter).populate('custodyAccountId', 'name channel').populate('createdBy', 'name').lean();
    const rows = expenses.map((item: any) => ({ expenseNumber: item.expenseNumber, date: item.date, category: item.category, description: item.description, account: item.custodyAccountId?.name || '', recorder: item.createdBy?.name || '', amount: item.amount }));
    return { type: 'expenses', ...paginate(rows, query) };
  }

  static async dues(query: Record<string, unknown>) {
    const ledgers = await MonthlyLedger.find(query.month ? { month: String(query.month) } : {}).populate('memberId', 'memberId name').lean();
    const rows = ledgers.map((item: any) => ({ memberId: item.memberId?.memberId || '', member: item.memberId?.name || '', month: item.month, status: item.status, principalDue: item.principalDue, penaltyDue: item.penaltyDue, paid: item.principalPaid + item.penaltyPaid, advance: item.excessAdvance, outstanding: Math.max(0, item.principalDue + item.penaltyDue - item.principalPaid - item.penaltyPaid) }));
    return { type: 'dues', ...paginate(rows, query) };
  }

  static csv(rows: Array<Record<string, unknown>>) {
    if (!rows.length) return 'No data\n'; const headers = Object.keys(rows[0]); const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
  }
}
