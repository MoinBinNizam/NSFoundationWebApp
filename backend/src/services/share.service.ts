import { ShareHistory } from '../models/ShareHistory.js';
import { Member } from '../models/Member.js';
import { MemberYearAccount } from '../models/MemberYearAccount.js';
import { AuditLog } from '../models/AuditLog.js';
import { Payment } from '../models/Payment.js';
import { MonthlyLedger } from '../models/MonthlyLedger.js';
import { MemberExitSettlement } from '../models/MemberExitSettlement.js';
import { ShareEventType, IUser, IMemberYearAccount, IShareHistory, MonthlyLedgerStatus, MemberExitStatus } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { HydratedDocument, Types } from 'mongoose';
import { getMonthlyShareValue } from './settings.service.js';
export { getMonthlyShareValue } from './settings.service.js';

/**
 * Retrieves the latest active share count for a member as of an effective month.
 */
export async function getMemberCurrentShares(
  memberId: string | Types.ObjectId,
  effectiveMonthLimit?: string
): Promise<{
  shareCount: number;
  effectiveMonth: string;
  lastUpdated?: Date;
}> {
  const query: Record<string, unknown> = { memberId };
  if (effectiveMonthLimit) {
    query.effectiveMonth = { $lte: effectiveMonthLimit };
  } else {
    query.effectiveMonth = { $lte: '2025-12' };
  }

  const latestEvent = await ShareHistory.findOne(query)
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

  const isOverride = Boolean(input.isAdministrativeOverride);

  // Strict business rule: Normal changes are locked from 2025-01 onwards unless explicit administrative override
  if (
    eventType === ShareEventType.TEMPORARY_CHANGE &&
    effectiveMonth >= '2025-01' &&
    !isOverride
  ) {
    throw createError(
      `Business Rule Violation: Normal share adjustments are permanently locked starting from January 2025 (effectiveMonth: ${effectiveMonth}). Post-2024 share movements must be recorded as TRANSFER or require authorized administrative override.`,
      400
    );
  }

  const current = await getMemberCurrentShares(member._id);
  const previousShareCount = current.shareCount;

  // Clean up any rogue future test records (> 2025-12)
  await ShareHistory.deleteMany({ memberId: member._id, effectiveMonth: { $gt: '2025-12' } });

  const shareEvent = await ShareHistory.create({
    memberId: member._id,
    effectiveMonth,
    shareCount: input.shareCount,
    previousShareCount,
    eventType,
    isAdministrativeOverride: isOverride,
    changedBy: actingUser._id,
    notes: input.notes?.trim(),
  });

  // Business Rule (Audio / SRS):
  // For the 2024 cooperative financial year, the closing December share count determines the total annual obligation.
  // If effectiveMonth is within 2024:
  if (effectiveMonth <= '2024-12') {
    // If an interim change was entered (e.g. 2024-05), also ensure closing 2024-12 matches this updated share count
    if (effectiveMonth < '2024-12') {
      await ShareHistory.findOneAndUpdate(
        { memberId: member._id, effectiveMonth: '2024-12' },
        {
          $set: {
            shareCount: input.shareCount,
            eventType: ShareEventType.ANNUAL_FINALIZATION,
            isAdministrativeOverride: isOverride,
            changedBy: actingUser._id,
            notes: `Closing shares synchronized from ${effectiveMonth} adjustment (${input.shareCount} shares)`,
          },
        },
        { upsert: true }
      );
    }

    // Immediately recalculate MemberYearAccount for 2024 and re-align MonthlyLedgers from effectiveMonth onwards
    await syncMember2024YearAndLedgers(member._id, effectiveMonth, actingUser, meta);
  } else if (effectiveMonth >= '2025-01') {
    // Post-2024: Update monthly ledgers from effectiveMonth onwards
    const shareVal = await getMonthlyShareValue();
    await MonthlyLedger.updateMany(
      { memberId: member._id, month: { $gte: effectiveMonth } },
      { $set: { shareCount: input.shareCount, principalDue: input.shareCount * shareVal } }
    );
  }

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

  // Synchronize 2024 ledgers and annual accounts if effective in 2024
  if (effectiveMonth <= '2024-12') {
    await syncMember2024YearAndLedgers(seller._id, effectiveMonth, actingUser, meta);
    await syncMember2024YearAndLedgers(buyer._id, effectiveMonth, actingUser, meta);
  } else {
    const shareVal = await getMonthlyShareValue();
    await MonthlyLedger.updateMany(
      { memberId: seller._id, month: { $gte: effectiveMonth } },
      { $set: { shareCount: sellerEvent.shareCount, principalDue: sellerEvent.shareCount * shareVal } }
    );
    await MonthlyLedger.updateMany(
      { memberId: buyer._id, month: { $gte: effectiveMonth } },
      { $set: { shareCount: buyerEvent.shareCount, principalDue: buyerEvent.shareCount * shareVal } }
    );
  }

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
 * Synchronizes a member's 2024 annual account based on December closing shares.
 *
 * CRITICAL RULE (User instruction):
 * - Prior months (e.g. Jan-Apr 2024 when a member had 4 shares and paid ৳2,000/month) MUST NEVER BE OVERWRITTEN.
 * - Each monthly ledger preserves the share count active in that specific month (e.g. Jan-Apr = 4 shares, May-Dec = 3 shares).
 * - When a share change occurs at `effectiveMonthFrom` (e.g. '2024-05'), only months from that month forward (month >= effectiveMonthFrom) update their active share expectation.
 * - In December 2024, the final closing share count determines the Total Annual Obligation (finalShares × ৳6,000).
 * - If total principal paid across 2024 > annual obligation, the excess is recorded as `excessAdvance` (Advance Credit for 2025).
 * - If total principal paid < annual obligation, the difference is recorded as `shortfall` (Due).
 */
export async function syncMember2024YearAndLedgers(
  memberId: string | Types.ObjectId,
  effectiveMonthFrom?: string,
  actingUser?: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<HydratedDocument<IMemberYearAccount>> {
  const member = await Member.findById(memberId);
  if (!member) {
    throw createError('Member not found.', 404);
  }

  const shareValue = await getMonthlyShareValue();

  // Clean up any rogue future share records (> 2025-12)
  await ShareHistory.deleteMany({ memberId: member._id, effectiveMonth: { $gt: '2025-12' } });

  // 1. Resolve closing December 2024 shares (or latest share record on or before 2024-12)
  const decEvent = await ShareHistory.findOne({
    memberId: member._id,
    effectiveMonth: '2024-12',
  }).sort({ createdAt: -1 });

  let finalShares = 0;
  if (decEvent) {
    finalShares = decEvent.shareCount;
  } else {
    const latest2024 = await ShareHistory.findOne({
      memberId: member._id,
      effectiveMonth: { $lte: '2024-12' },
    }).sort({ effectiveMonth: -1, createdAt: -1 });
    finalShares = latest2024 ? latest2024.shareCount : 1;
  }

  let activeMonths = 12;
  const exitSettlement = await MemberExitSettlement.findOne({ memberId: member._id, status: MemberExitStatus.SETTLED });
  const isDroppedOrExited = member.status === 'DROPPED' || !!exitSettlement;

  if (isDroppedOrExited) {
    const activeLedgersCount = await MonthlyLedger.countDocuments({
      memberId: member._id,
      month: { $gte: '2024-01', $lte: '2024-12' },
    });
    activeMonths = Math.min(12, Math.max(1, activeLedgersCount));
  }

  // 2. Annual Obligation for 2024 is strictly calculated from the closing December shares
  const annualObligation = finalShares * shareValue * activeMonths;

  // 3. Aggregate actual payments and monthly ledgers for 2024
  const startOfYear = new Date('2024-01-01T00:00:00.000Z');
  const endOfYear = new Date('2024-12-31T23:59:59.999Z');

  const payments = await Payment.find({
    memberId: member._id,
    status: { $ne: 'CANCELLED' },
    paymentDate: { $gte: startOfYear, $lte: endOfYear },
  }).lean();

  const rawPaymentPrincipal = payments.reduce((sum, p) => sum + (p.principalAmount || 0), 0);
  const rawPaymentAdvance = payments.reduce((sum, p) => sum + (p.advanceAmount || 0), 0);
  const totalPenaltyPaid = payments.reduce((sum, p) => sum + (p.penaltyAmount || 0), 0);
  const totalCashoutPaid = payments.reduce((sum, p) => sum + (p.cashoutCharge || 0), 0);
  const totalContributionFunds = rawPaymentPrincipal + rawPaymentAdvance;

  const ledgers = await MonthlyLedger.find({
    memberId: member._id,
    month: { $gte: '2024-01', $lte: '2024-12' },
  }).lean();

  const ledgerPrincipalPaid = ledgers.reduce((sum, l) => sum + (l.principalPaid || 0), 0);
  const ledgerPenaltyPaid = ledgers.reduce((sum, l) => sum + (l.penaltyPaid || 0), 0);
  const ledgerCashoutPaid = ledgers.reduce((sum, l) => sum + ((l as any).cashoutPaid || 0), 0);

  let totalPrincipalPaid = 0;
  let excessAdvance = 0;
  let finalPenaltyPaid = totalPenaltyPaid;
  let finalCashoutPaid = totalCashoutPaid;
  let totalPaid = 0;

  if (payments.length > 0) {
    if (totalContributionFunds >= annualObligation) {
      totalPrincipalPaid = Math.max(annualObligation, ledgerPrincipalPaid);
      excessAdvance = Math.max(0, totalContributionFunds - annualObligation);
    } else {
      totalPrincipalPaid = Math.min(annualObligation, Math.max(ledgerPrincipalPaid, totalContributionFunds));
      excessAdvance = Math.max(0, totalContributionFunds - totalPrincipalPaid);
    }
    totalPaid = totalPrincipalPaid + finalPenaltyPaid + finalCashoutPaid + excessAdvance;
  } else {
    totalPrincipalPaid = Math.min(annualObligation, ledgerPrincipalPaid);
    excessAdvance = Math.max(0, ledgerPrincipalPaid - annualObligation);
    finalPenaltyPaid = ledgerPenaltyPaid;
    finalCashoutPaid = ledgerCashoutPaid;
    totalPaid = totalPrincipalPaid + finalPenaltyPaid + finalCashoutPaid + excessAdvance;
  }

  const shortfall = Math.max(0, annualObligation - totalPrincipalPaid);
  const isSettled = shortfall === 0;

  // 4. Update or Upsert MemberYearAccount for 2024
  const yearAccount = await MemberYearAccount.findOneAndUpdate(
    { memberId: member._id, year: 2024 },
    {
      finalShares,
      annualObligation,
      totalPrincipalPaid,
      totalPenaltyPaid,
      totalCashoutPaid,
      totalPaid,
      shortfall,
      excessAdvance,
      isSettled,
      settledAt: isSettled ? new Date() : undefined,
      notes: isDroppedOrExited
        ? `Reconciled for ${activeMonths} active months in 2024 (Dropped/Exited member).`
        : `Annual reconciliation for 2024 computed against final share count of ${finalShares}`,
    },
    { upsert: true, new: true }
  );

  // 5. Update MonthlyLedgers:
  // IMPORTANT: As instructed by user, DO NOT overwrite prior historical months!
  // If effectiveMonthFrom is provided (e.g. '2024-05'), ONLY update ledgers where month >= effectiveMonthFrom.
  // Months prior to effectiveMonthFrom are NEVER modified, preserving their historical share count and payments.
  if (effectiveMonthFrom && effectiveMonthFrom <= '2024-12') {
    const startMonthNum = Math.max(1, parseInt(effectiveMonthFrom.split('-')[1], 10));
    for (let m = startMonthNum; m <= 12; m++) {
      const monthStr = `2024-${String(m).padStart(2, '0')}`;

      // Get the member's active shares in THAT month from ShareHistory
      const activeShareEvent = await ShareHistory.findOne({
        memberId: member._id,
        effectiveMonth: { $lte: monthStr },
      }).sort({ effectiveMonth: -1, createdAt: -1 });

      const monthShares = activeShareEvent ? activeShareEvent.shareCount : finalShares;
      const monthExpected = monthShares * shareValue;

      const existing = await MonthlyLedger.findOne({ memberId: member._id, month: monthStr });
      if (existing) {
        existing.shareCount = monthShares;
        existing.principalDue = monthExpected;
        const penaltyWaived = existing.penaltyWaived || 0;
        const isPaid = (existing.principalPaid >= monthExpected) &&
          (existing.penaltyPaid + penaltyWaived >= existing.penaltyDue);
        existing.status = isPaid
          ? MonthlyLedgerStatus.PAID
          : (existing.principalPaid > 0 ? MonthlyLedgerStatus.PARTIAL : MonthlyLedgerStatus.DUE);
        if (monthStr === '2024-12') {
          existing.excessAdvance = excessAdvance;
        }
        existing.lastRebuiltAt = new Date();
        await existing.save();
      }
    }
  } else if (!effectiveMonthFrom) {
    // If called without effectiveMonthFrom (e.g. Year Reconciliation),
    // only update the closing month excessAdvance without altering prior monthly ledgers
    if (excessAdvance > 0) {
      await MonthlyLedger.updateOne(
        { memberId: member._id, month: '2024-12' },
        { $set: { excessAdvance, lastRebuiltAt: new Date() } }
      );
    }
  }

  if (actingUser) {
    await AuditLog.create({
      performedBy: actingUser._id,
      action: 'SYNC_2024_SHARES_LEDGERS',
      entityName: 'MemberYearAccount',
      entityId: yearAccount._id,
      afterState: yearAccount.toObject(),
      reason: `Synchronized 2024 year account for ${member.memberId}: finalShares=${finalShares}, annualObligation=${annualObligation}, shortfall=${shortfall}, excessAdvance=${excessAdvance}`,
      ipAddress: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  return yearAccount;
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

  if (year === 2024) {
    return await syncMember2024YearAndLedgers(member._id, undefined, actingUser, meta);
  }

  const shareValue = await getMonthlyShareValue();

  // For other years: find December baseline (or latest share event in/before that year)
  let finalShares = 0;
  const decEvent = await ShareHistory.findOne({
    memberId: member._id,
    effectiveMonth: `${year}-12`,
  }).sort({ createdAt: -1 });

  if (decEvent) {
    finalShares = decEvent.shareCount;
  } else {
    const lastRecordInYear = await ShareHistory.findOne({
      memberId: member._id,
      effectiveMonth: { $lte: `${year}-12` },
    }).sort({ effectiveMonth: -1, createdAt: -1 });

    finalShares = lastRecordInYear ? lastRecordInYear.shareCount : 0;
  }

  let activeMonths = 12;
  const exitSettlement = await MemberExitSettlement.findOne({ memberId: member._id, status: MemberExitStatus.SETTLED });
  const isDroppedOrExited = member.status === 'DROPPED' || !!exitSettlement;

  if (isDroppedOrExited) {
    const activeLedgersCount = await MonthlyLedger.countDocuments({
      memberId: member._id,
      month: { $gte: `${year}-01`, $lte: `${year}-12` },
    });
    activeMonths = Math.min(12, Math.max(1, activeLedgersCount));
  }

  const annualObligation = finalShares * shareValue * activeMonths;

  // Aggregate actual payments and monthly ledgers for that year
  const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);

  const payments = await Payment.find({
    memberId: member._id,
    status: { $ne: 'CANCELLED' },
    paymentDate: { $gte: startOfYear, $lte: endOfYear },
  }).lean();

  const rawPaymentPrincipal = payments.reduce((sum, p) => sum + (p.principalAmount || 0), 0);
  const rawPaymentAdvance = payments.reduce((sum, p) => sum + (p.advanceAmount || 0), 0);
  const totalPenaltyPaid = payments.reduce((sum, p) => sum + (p.penaltyAmount || 0), 0);
  const totalCashoutPaid = payments.reduce((sum, p) => sum + (p.cashoutCharge || 0), 0);
  const totalContributionFunds = rawPaymentPrincipal + rawPaymentAdvance;

  const ledgers = await MonthlyLedger.find({
    memberId: member._id,
    month: { $gte: `${year}-01`, $lte: `${year}-12` },
  }).lean();

  const ledgerPrincipalPaid = ledgers.reduce((sum, l) => sum + (l.principalPaid || 0), 0);
  const ledgerPenaltyPaid = ledgers.reduce((sum, l) => sum + (l.penaltyPaid || 0), 0);
  const ledgerCashoutPaid = ledgers.reduce((sum, l) => sum + ((l as any).cashoutPaid || 0), 0);

  let totalPrincipalPaid = 0;
  let excessAdvance = 0;
  let finalPenaltyPaid = totalPenaltyPaid;
  let finalCashoutPaid = totalCashoutPaid;
  let totalPaid = 0;

  if (payments.length > 0) {
    if (totalContributionFunds >= annualObligation) {
      totalPrincipalPaid = annualObligation;
      excessAdvance = totalContributionFunds - annualObligation;
    } else {
      totalPrincipalPaid = Math.min(annualObligation, Math.max(ledgerPrincipalPaid, totalContributionFunds));
      excessAdvance = Math.max(0, totalContributionFunds - totalPrincipalPaid);
    }
    totalPaid = totalPrincipalPaid + finalPenaltyPaid + finalCashoutPaid + excessAdvance;
  } else {
    totalPrincipalPaid = Math.min(annualObligation, ledgerPrincipalPaid);
    excessAdvance = Math.max(0, ledgerPrincipalPaid - annualObligation);
    finalPenaltyPaid = ledgerPenaltyPaid;
    finalCashoutPaid = ledgerCashoutPaid;
    totalPaid = totalPrincipalPaid + finalPenaltyPaid + finalCashoutPaid + excessAdvance;
  }

  const shortfall = Math.max(0, annualObligation - totalPrincipalPaid);
  const isSettled = shortfall === 0;

  const yearAccount = await MemberYearAccount.findOneAndUpdate(
    { memberId: member._id, year },
    {
      finalShares,
      annualObligation,
      totalPrincipalPaid,
      totalPenaltyPaid,
      totalCashoutPaid,
      totalPaid,
      shortfall,
      excessAdvance,
      isSettled,
      settledAt: isSettled ? new Date() : undefined,
      notes: isDroppedOrExited
        ? `Reconciled for ${activeMonths} active months in ${year} (Dropped/Exited member).`
        : `Annual reconciliation for ${year} computed against final share count of ${finalShares}`,
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
 * Reconciles all members' annual accounts for a given year (triggered manually by Admin).
 */
export async function reconcileAllYearAccounts(
  year: number,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<{ reconciledCount: number; accounts: HydratedDocument<IMemberYearAccount>[] }> {
  const members = await Member.find().lean();
  const accounts: HydratedDocument<IMemberYearAccount>[] = [];
  for (const m of members) {
    const acc = await reconcileMemberYearAccount(String(m._id), year, actingUser, meta);
    accounts.push(acc);
  }
  return { reconciledCount: accounts.length, accounts };
}

/**
 * Retrieves annual reconciliation accounts with filtering by year.
 */
export async function getYearAccounts(options: { year?: number; memberId?: string } = {}) {
  const filter: Record<string, unknown> = {};
  if (options.year) filter.year = options.year;
  if (options.memberId) filter.memberId = options.memberId;

  const accounts = await MemberYearAccount.find(filter)
    .populate('memberId', 'memberId name phone status currentShares')
    .lean();

  // Natural numeric sort by member ID (NSF001, NSF002, ..., NSF035)
  accounts.sort((a: any, b: any) => {
    const idA = a.memberId?.memberId || '';
    const idB = b.memberId?.memberId || '';
    return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
  });

  return accounts.map((acc: any) => ({
    ...acc,
    totalPenaltyPaid: acc.totalPenaltyPaid ?? 0,
    totalCashoutPaid: acc.totalCashoutPaid ?? 0,
    totalPaid: acc.totalPaid ?? ((acc.totalPrincipalPaid || 0) + (acc.totalPenaltyPaid || 0) + (acc.totalCashoutPaid || 0)),
  }));
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
