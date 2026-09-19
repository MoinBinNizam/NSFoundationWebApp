import { ShareHistory } from '../models/ShareHistory.js';
import { Member } from '../models/Member.js';
import { MemberYearAccount } from '../models/MemberYearAccount.js';
import { SystemConfig } from '../models/SystemConfig.js';
import { AuditLog } from '../models/AuditLog.js';
import { Payment } from '../models/Payment.js';
import { ShareEventType, IUser, IMemberYearAccount, IShareHistory } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { HydratedDocument, Types } from 'mongoose';

const DEFAULT_MONTHLY_SHARE_VALUE = 500; // BDT per month per share (SRS section 5.1)

/**
 * Retrieves the effective monthly installment per share (default: 500 BDT).
 */
export async function getMonthlyShareValue(): Promise<number> {
  const config = await SystemConfig.findOne({ key: 'MONTHLY_SHARE_VALUE' });
  if (config && typeof config.value === 'number') {
    return config.value;
  }
  return DEFAULT_MONTHLY_SHARE_VALUE;
}

/**
 * Retrieves the latest active share count for a member as of an effective month.
 */
export async function getMemberCurrentShares(memberId: string | Types.ObjectId): Promise<{
  shareCount: number;
  effectiveMonth: string;
  lastUpdated?: Date;
}> {
  const latestEvent = await ShareHistory.findOne({ memberId })
    .sort({ effectiveMonth: -1, createdAt: -1 })
    .lean();

  if (!latestEvent) {
    return { shareCount: 0, effectiveMonth: 'None' };
  }

  return {
    shareCount: latestEvent.shareCount,
    effectiveMonth: latestEvent.effectiveMonth,
    lastUpdated: latestEvent.createdAt,
  };
}

export interface RecordShareChangeInput {
  memberId: string;
  effectiveMonth: string; // "YYYY-MM"
  shareCount: number;
  eventType?: ShareEventType;
  isAdministrativeOverride?: boolean;
  notes?: string;
}

/**
 * Records a normal share change or administrative finalization with strict post-2024 locking.
 */
export async function recordShareChange(
  input: RecordShareChangeInput,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<HydratedDocument<IShareHistory>> {
  const member = await Member.findById(input.memberId);
  if (!member) {
    throw createError('Member not found.', 404);
  }

  const effectiveMonth = input.effectiveMonth.trim();
  const eventType = input.eventType || ShareEventType.TEMPORARY_CHANGE;

  // Strict business rule: Normal changes are locked from 2025-01 onwards
  if (
    eventType === ShareEventType.TEMPORARY_CHANGE &&
    effectiveMonth >= '2025-01' &&
    !input.isAdministrativeOverride
  ) {
    throw createError(
      `Business Rule Violation: Normal share adjustments are permanently locked starting from January 2025 (effectiveMonth: ${effectiveMonth}). Post-2024 share movements must be recorded as TRANSFER or require authorized administrative override.`,
      400
    );
  }

  const current = await getMemberCurrentShares(member._id);
  const previousShareCount = current.shareCount;

  const shareEvent = await ShareHistory.create({
    memberId: member._id,
    effectiveMonth,
    shareCount: input.shareCount,
    previousShareCount,
    eventType,
    isAdministrativeOverride: input.isAdministrativeOverride || false,
    changedBy: actingUser._id,
    notes: input.notes?.trim(),
  });

  // Audit log
  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'RECORD_SHARE_CHANGE',
    entityName: 'ShareHistory',
    entityId: shareEvent._id,
    afterState: shareEvent.toObject(),
    reason: `Share count changed from ${previousShareCount} to ${input.shareCount} for member ${member.memberId} (${effectiveMonth})`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return shareEvent;
}

export interface TransferSharesInput {
  fromMemberId: string;
  toMemberId: string;
  shareCount: number;
  effectiveMonth: string; // "YYYY-MM"
  notes?: string;
}

/**
 * Transfers shares from one existing member to another (Post-2024 supported transfer).
 * Records atomic reduction for seller and increment for buyer.
 */
export async function recordShareTransfer(
  input: TransferSharesInput,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<{ sellerEvent: HydratedDocument<IShareHistory>; buyerEvent: HydratedDocument<IShareHistory> }> {
  if (input.fromMemberId === input.toMemberId) {
    throw createError('Seller and buyer members cannot be the same person.', 400);
  }

  if (input.shareCount <= 0) {
    throw createError('Transfer share count must be greater than 0.', 400);
  }

  const [seller, buyer] = await Promise.all([
    Member.findById(input.fromMemberId),
    Member.findById(input.toMemberId),
  ]);

  if (!seller) throw createError('Seller member not found.', 404);
  if (!buyer) throw createError('Buyer member not found.', 404);

  const [sellerCurrent, buyerCurrent] = await Promise.all([
    getMemberCurrentShares(seller._id),
    getMemberCurrentShares(buyer._id),
  ]);

  if (sellerCurrent.shareCount < input.shareCount) {
    throw createError(
      `Seller '${seller.name}' (${seller.memberId}) holds only ${sellerCurrent.shareCount} shares, cannot transfer ${input.shareCount} shares.`,
      400
    );
  }

  const effectiveMonth = input.effectiveMonth.trim();
  const transferNote = input.notes?.trim() || `Transferred ${input.shareCount} shares from ${seller.memberId} to ${buyer.memberId}`;

  // 1. Record seller reduction
  const sellerEvent = await ShareHistory.create({
    memberId: seller._id,
    effectiveMonth,
    shareCount: sellerCurrent.shareCount - input.shareCount,
    previousShareCount: sellerCurrent.shareCount,
    eventType: ShareEventType.TRANSFER,
    transferDetails: {
      fromMemberId: seller._id,
      toMemberId: buyer._id,
      transferNote,
    },
    changedBy: actingUser._id,
    notes: `Transferred OUT ${input.shareCount} shares to ${buyer.memberId}`,
  });

  // 2. Record buyer increase
  const buyerEvent = await ShareHistory.create({
    memberId: buyer._id,
    effectiveMonth,
    shareCount: buyerCurrent.shareCount + input.shareCount,
    previousShareCount: buyerCurrent.shareCount,
    eventType: ShareEventType.TRANSFER,
    transferDetails: {
      fromMemberId: seller._id,
      toMemberId: buyer._id,
      transferNote,
    },
    changedBy: actingUser._id,
    notes: `Transferred IN ${input.shareCount} shares from ${seller.memberId}`,
  });

  // Audit log
  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'SHARE_TRANSFER',
    entityName: 'ShareHistory',
    entityId: sellerEvent._id,
    beforeState: { sellerShares: sellerCurrent.shareCount, buyerShares: buyerCurrent.shareCount },
    afterState: { sellerShares: sellerEvent.shareCount, buyerShares: buyerEvent.shareCount, transferred: input.shareCount },
    reason: `Share transfer of ${input.shareCount} shares from ${seller.memberId} to ${buyer.memberId}`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return { sellerEvent, buyerEvent };
}

/**
 * Retrieves chronological share event history with filters and pagination.
 */
export async function getShareHistory(options: {
  memberId?: string;
  effectiveMonth?: string;
  eventType?: string;
  page?: number;
  limit?: number;
} = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (options.memberId) {
    if (Types.ObjectId.isValid(options.memberId)) {
      filter.memberId = options.memberId;
    } else {
      const member = await Member.findOne({ memberId: options.memberId.toUpperCase() });
      if (member) filter.memberId = member._id;
    }
  }

  if (options.effectiveMonth && options.effectiveMonth !== 'ALL') {
    filter.effectiveMonth = options.effectiveMonth;
  }

  if (options.eventType && options.eventType !== 'ALL') {
    filter.eventType = options.eventType;
  }

  const [history, total] = await Promise.all([
    ShareHistory.find(filter)
      .sort({ effectiveMonth: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('memberId', 'memberId name phone status')
      .populate('changedBy', 'name role email')
      .populate('transferDetails.fromMemberId', 'memberId name')
      .populate('transferDetails.toMemberId', 'memberId name')
      .lean(),
    ShareHistory.countDocuments(filter),
  ]);

  return {
    history,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Retrieves members along with their current share count and monthly obligation.
 */
export async function getMembersWithShares() {
  const [members, shareValue] = await Promise.all([
    Member.find({ status: { $ne: 'DROPPED' } }).sort({ memberId: 1 }).lean(),
    getMonthlyShareValue(),
  ]);

  const memberSharesList = await Promise.all(
    members.map(async (m) => {
      const current = await getMemberCurrentShares(m._id);
      const monthlyObligation = current.shareCount * shareValue;
      
      // Check 2024 annual account status
      const yearAccount = await MemberYearAccount.findOne({ memberId: m._id, year: 2024 }).lean();

      return {
        _id: m._id,
        memberId: m.memberId,
        name: m.name,
        phone: m.phone,
        status: m.status,
        currentShares: current.shareCount,
        monthlyObligation,
        effectiveMonth: current.effectiveMonth,
        yearAccount2024: yearAccount
          ? {
              finalShares: yearAccount.finalShares,
              annualObligation: yearAccount.annualObligation,
              totalPrincipalPaid: yearAccount.totalPrincipalPaid,
              shortfall: yearAccount.shortfall,
              excessAdvance: yearAccount.excessAdvance,
              isSettled: yearAccount.isSettled,
            }
          : null,
      };
    })
  );

  return {
    shareValue,
    members: memberSharesList,
  };
}

/**
 * Reconciles a member's annual account for a given year (e.g. 2024 baseline).
 * Formula (SRS Section 1.1A & 5.2):
 * 2024 Annual Principal Obligation = December 2024 Final Shares × Share Value × 12
 */
export async function reconcileMemberYearAccount(
  memberIdInput: string,
  year: number,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<HydratedDocument<IMemberYearAccount>> {
  let member: HydratedDocument<any> | null = null;
  if (Types.ObjectId.isValid(memberIdInput)) {
    member = await Member.findById(memberIdInput);
  }
  if (!member) {
    member = await Member.findOne({ memberId: memberIdInput.toUpperCase() });
  }
  if (!member) {
    throw createError('Member not found.', 404);
  }

  const shareValue = await getMonthlyShareValue();

  // For 2024: find December baseline (or latest share event in/before that year)
  let finalShares = 0;
  const decEvent = await ShareHistory.findOne({
    memberId: member._id,
    effectiveMonth: `${year}-12`,
  }).sort({ createdAt: -1 });

  if (decEvent) {
    finalShares = decEvent.shareCount;
  } else {
    // If no explicit December record, look for the latest record on or before December of that year
    const lastRecordInYear = await ShareHistory.findOne({
      memberId: member._id,
      effectiveMonth: { $lte: `${year}-12` },
    }).sort({ effectiveMonth: -1, createdAt: -1 });

    finalShares = lastRecordInYear ? lastRecordInYear.shareCount : 0;
  }

  const annualObligation = finalShares * shareValue * 12;

  // Aggregate actual principal payments made in that year
  const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

  const payments = await Payment.find({
    memberId: member._id,
    paymentDate: { $gte: startOfYear, $lte: endOfYear },
    status: { $ne: 'CANCELLED' },
  }).lean();

  const totalPrincipalPaid = payments.reduce((sum, p) => sum + (p.principalAmount || 0), 0);

  const shortfall = Math.max(0, annualObligation - totalPrincipalPaid);
  const excessAdvance = Math.max(0, totalPrincipalPaid - annualObligation);
  const isSettled = shortfall === 0;

  const yearAccount = await MemberYearAccount.findOneAndUpdate(
    { memberId: member._id, year },
    {
      finalShares,
      annualObligation,
      totalPrincipalPaid,
      shortfall,
      excessAdvance,
      isSettled,
      settledAt: isSettled ? new Date() : undefined,
      notes: `Annual reconciliation for ${year} computed against final share count of ${finalShares}`,
    },
    { upsert: true, new: true }
  );

  // Audit log
  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'RECONCILE_YEAR_ACCOUNT',
    entityName: 'MemberYearAccount',
    entityId: yearAccount._id,
    afterState: yearAccount.toObject(),
    reason: `Annual account reconciled for ${member.memberId} year ${year}: Final Shares=${finalShares}, Obligation=${annualObligation}, Shortfall=${shortfall}, Advance=${excessAdvance}`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return yearAccount;
}

/**
 * Retrieves annual reconciliation accounts with filtering by year.
 */
export async function getYearAccounts(options: { year?: number; memberId?: string } = {}) {
  const filter: Record<string, unknown> = {};
  if (options.year) filter.year = options.year;
  if (options.memberId) filter.memberId = options.memberId;

  const accounts = await MemberYearAccount.find(filter)
    .sort({ year: -1 })
    .populate('memberId', 'memberId name phone status')
    .lean();

  return accounts;
}

/**
 * Computes global society share metrics.
 */
export async function getShareStats() {
  const shareValue = await getMonthlyShareValue();
  const members = await Member.find({ status: { $ne: 'DROPPED' } }, { _id: 1 }).lean();

  let totalActiveShares = 0;
  for (const m of members) {
    const current = await getMemberCurrentShares(m._id);
    totalActiveShares += current.shareCount;
  }

  const monthlyObligationPool = totalActiveShares * shareValue;
  const total2024Reconciled = await MemberYearAccount.countDocuments({ year: 2024, isSettled: true });
  const totalTransfers = await ShareHistory.countDocuments({ eventType: ShareEventType.TRANSFER });

  return {
    shareValue,
    totalActiveShares,
    monthlyObligationPool,
    total2024Reconciled,
    totalTransfers,
  };
}
