import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { Expense } from '../models/Expense.js';
import { MonthlyLedger } from '../models/MonthlyLedger.js';
import { Payment } from '../models/Payment.js';
import { Member } from '../models/Member.js';
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
    const [payment, expense, accounts, activity, members, investment] = await Promise.all([
      Payment.aggregate([{ $match: paymentFilter }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 }, principal: { $sum: '$principalAmount' }, penalty: { $sum: '$penaltyAmount' } } }]),
      Expense.aggregate([{ $match: expenseFilter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      CustodyService.getCustodyAccounts({ isActive: true }),
      AuditLog.find(scoped ? { performedBy: userId } : {}).populate('performedBy', 'name email accountantType').sort({ createdAt: -1 }).limit(12),
      Member.countDocuments({ status: 'ACTIVE' }),
      canAccessInvestments(user) ? InvestmentService.getInvestmentStats() : Promise.resolve(null),
    ]);
    const visibleAccounts = scoped ? accounts.filter((account: any) => String(account.holderId?._id || account.holderId) === String(userId)) : accounts;
    return {
      roleScope: isAdmin(user) ? 'ORGANIZATION' : 'ACCOUNTANT',
      period: { startDate: query.startDate || null, endDate: query.endDate || null },
      metrics: { collection: payment[0] || { total: 0, count: 0, principal: 0, penalty: 0 }, expenses: expense[0] || { total: 0, count: 0 }, custody: visibleAccounts.reduce((sum: number, account: any) => sum + account.derivedBalance, 0), activeMembers: members, investments: investment },
      custodyByAccount: visibleAccounts.map((account: any) => ({ name: account.name, channel: account.channel, balance: account.derivedBalance })),
      recentActivity: activity.map((item: any) => ({ id: item._id, action: item.action, entityName: item.entityName, reason: item.reason, createdAt: item.createdAt, performedBy: item.performedBy?.name || 'System' })),
    };
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
