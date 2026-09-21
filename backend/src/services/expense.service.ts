import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { Expense } from '../models/Expense.js';
import { CustodyService } from './custody.service.js';
import { AccountType, MovementSourceType, MovementType, IUser } from '../types/models.js';
import { createError } from '../middlewares/error.js';

type ActingUser = IUser & { _id: Types.ObjectId };
const actingUserId = (user: IUser) => (user as ActingUser)._id;

function parseDate(value: string | Date | undefined, field: string, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createError(`${field} is invalid`, 400);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function monthPrefix(date: Date) {
  return `EXP-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export class ExpenseService {
  static async createExpense(
    input: {
      custodyAccountId: string;
      amount: number;
      category: string;
      date?: string | Date;
      description: string;
      receiptUrl?: string;
      notes?: string;
    },
    actingUser: IUser
  ) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw createError('amount must be greater than 0', 400);
    const category = input.category?.trim();
    const description = input.description?.trim();
    if (!category) throw createError('category is required', 400);
    if (!description) throw createError('description is required', 400);
    const date = parseDate(input.date, 'date') ?? new Date();
    const account = await CustodyAccount.findById(input.custodyAccountId);
    if (!account || !account.isActive || account.accountType !== AccountType.ACCOUNTANT_CUSTODY) {
      throw createError('Expenses must be paid from an active accountant custody account', 400);
    }
    const balance = await CustodyService.getDerivedAccountBalance(account._id);
    if (balance.currentBalance < amount) {
      throw createError(`Insufficient funds in ${account.name}. Available: ৳${balance.currentBalance.toLocaleString()}`, 400);
    }

    const prefix = monthPrefix(date);
    const count = await Expense.countDocuments({ expenseNumber: { $regex: `^${prefix}-` } });
    const expenseNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`;
    const performedBy = actingUserId(actingUser);

    const expense = await Expense.create({
      expenseNumber,
      custodyAccountId: account._id,
      amount,
      category,
      date,
      description,
      receiptUrl: input.receiptUrl?.trim() || '',
      notes: input.notes?.trim() || '',
      createdBy: performedBy,
    });
    const movement = await CustodyMovement.create({
      custodyAccountId: account._id,
      movementType: MovementType.OUT,
      amount,
      sourceType: MovementSourceType.EXPENSE,
      sourceRefId: expense._id,
      date,
      description: `Expense ${expenseNumber}: ${description}`,
      performedBy,
    });
    expense.custodyMovementId = movement._id;
    await expense.save();

    const updatedBalance = await CustodyService.getDerivedAccountBalance(account._id);
    account.cachedBalance = updatedBalance.currentBalance;
    await account.save();
    await AuditLog.create({
      performedBy,
      action: 'CREATE_EXPENSE',
      entityName: 'Expense',
      entityId: expense._id,
      afterState: { expenseNumber, account: account.name, amount, category, date, description },
      reason: `Recorded expense ${expenseNumber}: ৳${amount.toLocaleString()} for ${category}`,
    });
    return { expense, movement, account, balanceAfter: updatedBalance.currentBalance };
  }

  static async getExpenses(query: {
    page?: number; limit?: number; search?: string; category?: string; custodyAccountId?: string; startDate?: string; endDate?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const filter = this.toFilter(query);
    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate('custodyAccountId', 'name channel accountNumber holderId')
        .populate('createdBy', 'name email accountantType')
        .populate('custodyMovementId', 'movementType amount sourceType date description')
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Expense.countDocuments(filter),
    ]);
    return { expenses, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  static async getExpenseById(expenseId: string) {
    const expense = await Expense.findById(expenseId)
      .populate('custodyAccountId', 'name channel accountNumber holderId')
      .populate('createdBy', 'name email accountantType')
      .populate('custodyMovementId', 'movementType amount sourceType date description performedBy');
    if (!expense) throw createError('Expense not found', 404);
    return expense;
  }

  static async getExpenseStats(query: { startDate?: string; endDate?: string; category?: string; custodyAccountId?: string }) {
    const filter = this.toFilter(query);
    const [summary, categories, accounts, monthlyTrend, currentMonth] = await Promise.all([
      Expense.aggregate([{ $match: filter }, { $group: { _id: null, totalExpense: { $sum: '$amount' }, count: { $sum: 1 }, averageExpense: { $avg: '$amount' } } }]),
      Expense.aggregate([{ $match: filter }, { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }]),
      Expense.aggregate([{ $match: filter }, { $group: { _id: '$custodyAccountId', total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }, { $lookup: { from: 'custodyaccounts', localField: '_id', foreignField: '_id', as: 'account' } }, { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } }, { $project: { total: 1, count: 1, name: '$account.name', channel: '$account.channel' } }]),
      Expense.aggregate([{ $match: filter }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$date' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Expense.aggregate([{ $match: { date: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const totals = summary[0] ?? { totalExpense: 0, count: 0, averageExpense: 0 };
    return { ...totals, currentMonthTotal: currentMonth[0]?.total ?? 0, largestCategory: categories[0] ? { category: categories[0]._id, total: categories[0].total } : null, byCategory: categories.map((item) => ({ category: item._id, total: item.total, count: item.count })), byAccount: accounts, monthlyTrend: monthlyTrend.map((item) => ({ month: item._id, total: item.total, count: item.count })) };
  }

  private static toFilter(query: { search?: string; category?: string; custodyAccountId?: string; startDate?: string; endDate?: string }): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (query.category?.trim()) filter.category = query.category.trim();
    if (query.custodyAccountId) filter.custodyAccountId = new Types.ObjectId(query.custodyAccountId);
    if (query.search?.trim()) {
      const term = query.search.trim();
      filter.$or = [{ expenseNumber: { $regex: term, $options: 'i' } }, { category: { $regex: term, $options: 'i' } }, { description: { $regex: term, $options: 'i' } }];
    }
    const start = parseDate(query.startDate, 'startDate');
    const end = parseDate(query.endDate, 'endDate', true);
    if (start || end) filter.date = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
    return filter;
  }
}
