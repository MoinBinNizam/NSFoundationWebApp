import { Types } from 'mongoose';
import { AuditLog, CustodyAccount, CustodyMovement, MemberYearAccount, Payment, PaymentAllocation, ShareHistory } from '../models/index.js';
import { IUser } from '../types/models.js';

type AuditFilters = { entityName?: string; performedBy?: string; action?: string; search?: string; startDate?: string; endDate?: string; page?: string | number; limit?: string | number };
type RequestMeta = { ipAddress?: string; userAgent?: string };
const actorId = (user: IUser) => (user as unknown as { _id: Types.ObjectId })._id;
const pageValue = (value: string | number | undefined, fallback: number) => Math.max(1, Number(value) || fallback);

export class AuditService {
  static async list(filters: AuditFilters) {
    const page = pageValue(filters.page, 1);
    const limit = Math.min(100, pageValue(filters.limit, 25));
    const query: Record<string, unknown> = {};
    if (filters.entityName) query.entityName = filters.entityName;
    if (filters.action) query.action = filters.action;
    if (filters.performedBy && Types.ObjectId.isValid(filters.performedBy)) query.performedBy = new Types.ObjectId(filters.performedBy);
    if (filters.startDate || filters.endDate) {
      const createdAt: Record<string, Date> = {};
      if (filters.startDate) createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) { const end = new Date(filters.endDate); end.setHours(23, 59, 59, 999); createdAt.$lte = end; }
      query.createdAt = createdAt;
    }
    if (filters.search) {
      const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ action: new RegExp(escaped, 'i') }, { entityName: new RegExp(escaped, 'i') }, { reason: new RegExp(escaped, 'i') }];
    }
    const [items, total] = await Promise.all([
      AuditLog.find(query).populate('performedBy', 'name email role accountantType').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);
    return { items, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /** Read-only cross-checks of cached projections against immutable source records. */
  static async verifyIntegrity(user: IUser, meta?: RequestMeta) {
    const accounts = await CustodyAccount.find({}).select('name cachedBalance').lean();
    const movementTotals = await CustodyMovement.aggregate([{ $group: { _id: '$custodyAccountId', balance: { $sum: { $cond: [{ $eq: ['$movementType', 'IN'] }, '$amount', { $multiply: ['$amount', -1] }] } } } }]);
    const balanceByAccount = new Map(movementTotals.map((row: { _id: Types.ObjectId; balance: number }) => [String(row._id), Number(row.balance || 0)]));
    const custodyVariances = accounts.map((account: any) => {
      const ledgerBalance = balanceByAccount.get(String(account._id)) || 0;
      const cachedBalance = Number(account.cachedBalance || 0);
      return { accountId: account._id, accountName: account.name, cachedBalance, ledgerBalance, variance: Number((cachedBalance - ledgerBalance).toFixed(2)) };
    }).filter((row) => Math.abs(row.variance) >= 0.01);

    const payments = await Payment.find({}).select('receiptNumber totalAmount principalAmount penaltyAmount advanceAmount cashoutCharge').lean();
    const allocationTotals = await PaymentAllocation.aggregate([{ $group: { _id: '$paymentId', total: { $sum: '$amount' } } }]);
    const allocationsByPayment = new Map(allocationTotals.map((row: { _id: Types.ObjectId; total: number }) => [String(row._id), Number(row.total || 0)]));
    const paymentVariances = payments.map((payment: any) => {
      const expectedAllocation = Number(payment.principalAmount || 0) + Number(payment.penaltyAmount || 0) + Number(payment.advanceAmount || 0);
      const allocationTotal = allocationsByPayment.get(String(payment._id)) || 0;
      return { paymentId: payment._id, receiptNumber: payment.receiptNumber, expectedAllocation, allocationTotal, variance: Number((expectedAllocation - allocationTotal).toFixed(2)) };
    }).filter((row) => Math.abs(row.variance) >= 0.01);

    const yearAccounts = await MemberYearAccount.find({}).select('memberId year finalShares').lean();
    const finalShareVariances = [] as Array<Record<string, unknown>>;
    for (const account of yearAccounts) {
      const history = await ShareHistory.findOne({ memberId: account.memberId, effectiveMonth: { $lte: `${account.year}-12` } }).sort({ effectiveMonth: -1, createdAt: -1 }).select('shareCount effectiveMonth').lean();
      if (!history || Number(history.shareCount) !== Number(account.finalShares)) finalShareVariances.push({ memberId: account.memberId, year: account.year, finalShares: account.finalShares, historyShares: history?.shareCount ?? null, historyMonth: history?.effectiveMonth ?? null });
    }
    const result = { passed: custodyVariances.length === 0 && paymentVariances.length === 0 && finalShareVariances.length === 0, checkedAt: new Date().toISOString(), custody: { checked: accounts.length, variances: custodyVariances }, payments: { checked: payments.length, variances: paymentVariances }, memberYearAccounts: { checked: yearAccounts.length, variances: finalShareVariances } };
    await AuditLog.create({ performedBy: actorId(user), action: 'VERIFY_SYSTEM_INTEGRITY', entityName: 'SystemIntegrity', afterState: { passed: result.passed, custodyVarianceCount: custodyVariances.length, paymentVarianceCount: paymentVariances.length, shareVarianceCount: finalShareVariances.length }, reason: 'Ran read-only ledger, allocation, and share-finalization integrity checks.', ipAddress: meta?.ipAddress, userAgent: meta?.userAgent });
    return result;
  }
}
