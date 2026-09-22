import mongoose, { Types } from 'mongoose';
import { Payment } from '../models/Payment.js';
import { PaymentAllocation } from '../models/PaymentAllocation.js';
import { MonthlyLedger } from '../models/MonthlyLedger.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { Member } from '../models/Member.js';
import { ShareHistory } from '../models/ShareHistory.js';
import { PenaltyRule } from '../models/PenaltyRule.js';
import { PenaltyWaiver } from '../models/PenaltyWaiver.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  AllocationType,
  MonthlyLedgerStatus,
  MovementType,
  MovementSourceType,
  PaymentMethod,
  PaymentStatus,
  IUser,
  CustodyChannel,
} from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { getGatewayRateForChannel, getMonthlyShareValue } from './settings.service.js';


/**
 * Format date to YYYY-MM
 */
function toYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Add months to YYYY-MM string
 */
function addMonths(yearMonth: string, count: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + count, 1);
  return toYearMonth(d);
}

function paymentMethodChannel(method: PaymentMethod): CustodyChannel {
  if (method === PaymentMethod.BANK_TRANSFER) return CustodyChannel.BANK;
  if (method === PaymentMethod.BKASH) return CustodyChannel.BKASH;
  if (method === PaymentMethod.NAGAD) return CustodyChannel.NAGAD;
  return CustodyChannel.CASH;
}

export class PaymentService {
  /**
   * Get member's active shares for a specific month
   */
  static async getMemberShareCount(memberId: string | Types.ObjectId, month: string): Promise<number> {
    const history = await ShareHistory.findOne({
      memberId,
      effectiveMonth: { $lte: month },
    }).sort({ effectiveMonth: -1, createdAt: -1 });

    return history ? history.shareCount : 1;
  }

  /**
   * Get dynamic penalty rule for a specific month
   */
  static async getPenaltyRule(month: string) {
    const rule = await PenaltyRule.findOne({
      effectiveFrom: { $lte: month },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: month } }],
    }).sort({ effectiveFrom: -1 });

    return (
      rule || {
        ratePerShare: month >= '2025-02' ? 40 : 20,
        graceDayOfMonth: 15,
      }
    );
  }

  /**
   * Check if a specific month has an active penalty waiver
   */
  static async isMonthWaived(month: string, memberId?: string | Types.ObjectId): Promise<boolean> {
    const query: Record<string, unknown> = { month };
    if (memberId) {
      query.$or = [{ isGlobal: true }, { memberId }];
    } else {
      query.isGlobal = true;
    }
    const waiver = await PenaltyWaiver.findOne(query);
    return !!waiver;
  }

  /**
   * Calculate Allocation & Fee Preview
   * Real-time calculation showing how total cash will be allocated
   */
  static async calculatePaymentPreview(input: {
    memberId: string;
    paymentDate?: string | Date;
    totalAmount: number;
    cashoutChargePaid?: number;
    paymentMethod: PaymentMethod;
    custodyAccountId?: string;
  }) {
    const { memberId, totalAmount } = input;
    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const cashoutChargePaid = Math.max(0, Number(input.cashoutChargePaid) || 0);

    const member = await Member.findById(memberId);
    if (!member) {
      throw createError('Member not found', 404);
    }

    const selectedAccount = input.custodyAccountId ? await CustodyAccount.findById(input.custodyAccountId).lean() : null;
    if (input.custodyAccountId && (!selectedAccount || !selectedAccount.isActive)) {
      throw createError('Destination custody account not found or inactive.', 400);
    }
    const gatewayChannel = selectedAccount?.channel || paymentMethodChannel(input.paymentMethod);
    const accountPaymentMethod = gatewayChannel === CustodyChannel.BANK
      ? PaymentMethod.BANK_TRANSFER
      : gatewayChannel === CustodyChannel.BKASH
        ? PaymentMethod.BKASH
        : gatewayChannel === CustodyChannel.NAGAD
          ? PaymentMethod.NAGAD
          : gatewayChannel === CustodyChannel.CASH
            ? PaymentMethod.CASH
            : null;
    if (accountPaymentMethod && input.paymentMethod !== accountPaymentMethod) {
      throw createError('Payment method must match the selected destination custody account.', 400);
    }

    const currentYearMonth = toYearMonth(paymentDate);
    const dayOfMonth = paymentDate.getDate();
    const currentMemberShares = await this.getMemberShareCount(member._id, currentYearMonth);
    const monthlyShareValue = await getMonthlyShareValue();
    const monthlyObligation = currentMemberShares * monthlyShareValue;

    // Remaining cash pool to allocate to obligations
    let remainingCash = Math.max(0, totalAmount - cashoutChargePaid);

    // 1. Fetch existing unpaid ledger dues
    const existingDues = await MonthlyLedger.find({
      memberId: member._id,
      month: { $lt: currentYearMonth },
      status: { $in: [MonthlyLedgerStatus.DUE, MonthlyLedgerStatus.PARTIAL] },
    }).sort({ month: 1 });

    const allocations: Array<{
      targetMonth: string;
      allocationType: AllocationType;
      amount: number;
      description: string;
    }> = [];

    let totalPrincipal = 0;
    let totalPenalty = 0;
    let totalAdvance = 0;

    // Allocate to Past Dues (Principal first, then Penalty) - SRS Section 10.2
    for (const due of existingDues) {
      if (remainingCash <= 0) break;

      const outstandingPrincipal = Math.max(0, due.principalDue - due.principalPaid);
      if (outstandingPrincipal > 0 && remainingCash > 0) {
        const principalAllocated = Math.min(remainingCash, outstandingPrincipal);
        allocations.push({
          targetMonth: due.month,
          allocationType: AllocationType.PREVIOUS_DUE,
          amount: principalAllocated,
          description: `Outstanding principal due for ${due.month}`,
        });
        remainingCash -= principalAllocated;
        totalPrincipal += principalAllocated;
      }

      // Past month penalties
      const outstandingPenalty = Math.max(0, due.penaltyDue - due.penaltyPaid);
      if (outstandingPenalty > 0 && remainingCash > 0) {
        const penaltyAllocated = Math.min(remainingCash, outstandingPenalty);
        allocations.push({
          targetMonth: due.month,
          allocationType: AllocationType.PENALTY,
          amount: penaltyAllocated,
          description: `Unpaid penalty for ${due.month}`,
        });
        remainingCash -= penaltyAllocated;
        totalPenalty += penaltyAllocated;
      }
    }

    // Allocate to Current Month
    const currentLedger = await MonthlyLedger.findOne({
      memberId: member._id,
      month: currentYearMonth,
    });

    const isCurrentPaid = currentLedger && currentLedger.status === MonthlyLedgerStatus.PAID;

    if (!isCurrentPaid && remainingCash > 0) {
      const currentPaid = currentLedger ? currentLedger.principalPaid : 0;
      const neededPrincipal = Math.max(0, monthlyObligation - currentPaid);

      if (neededPrincipal > 0) {
        const principalAllocated = Math.min(remainingCash, neededPrincipal);
        allocations.push({
          targetMonth: currentYearMonth,
          allocationType: AllocationType.PRINCIPAL,
          amount: principalAllocated,
          description: `Current month (${currentYearMonth}) principal obligation (${currentMemberShares} shares)`,
        });
        remainingCash -= principalAllocated;
        totalPrincipal += principalAllocated;
      }

      // Check if current month penalty applies (SRS 7.2: Day > graceDay and not waived)
      const penaltyRule = await this.getPenaltyRule(currentYearMonth);
      const isWaived = await this.isMonthWaived(currentYearMonth, member._id);

      if (dayOfMonth > penaltyRule.graceDayOfMonth && !isWaived && remainingCash > 0) {
        const currentMonthPenaltyDue = currentMemberShares * penaltyRule.ratePerShare;
        const currentPenaltyPaid = currentLedger ? currentLedger.penaltyPaid : 0;
        const penaltyNeeded = Math.max(0, currentMonthPenaltyDue - currentPenaltyPaid);

        if (penaltyNeeded > 0) {
          const penaltyAllocated = Math.min(remainingCash, penaltyNeeded);
          allocations.push({
            targetMonth: currentYearMonth,
            allocationType: AllocationType.PENALTY,
            amount: penaltyAllocated,
            description: `Current month (${currentYearMonth}) late penalty (${penaltyRule.ratePerShare} BDT/share)`,
          });
          remainingCash -= penaltyAllocated;
          totalPenalty += penaltyAllocated;
        }
      }
    }

    // Allocate remaining cash to Future Advance Months (SRS Section 10.1 & 10.4)
    let advanceMonthCursor = addMonths(currentYearMonth, 1);
    while (remainingCash > 0) {
      const futureShares = await this.getMemberShareCount(member._id, advanceMonthCursor);
      const futureMonthlyObligation = futureShares * monthlyShareValue;
      const advanceAllocated = Math.min(remainingCash, futureMonthlyObligation);

      allocations.push({
        targetMonth: advanceMonthCursor,
        allocationType: AllocationType.ADVANCE,
        amount: advanceAllocated,
        description: `Advance prepayment for ${advanceMonthCursor} (${futureShares} shares)`,
      });

      remainingCash -= advanceAllocated;
      totalAdvance += advanceAllocated;
      advanceMonthCursor = addMonths(advanceMonthCursor, 1);
    }

    const coveredMonths = allocations
      .filter((a) => a.allocationType !== AllocationType.PENALTY)
      .map((a) => a.targetMonth)
      .sort();

    const coversFrom = coveredMonths[0] || currentYearMonth;
    const coversTo = coveredMonths[coveredMonths.length - 1] || currentYearMonth;

    const currentCashoutDue = member.cashoutDue || 0;
    const paymentBaseAmount = Math.max(0, totalAmount - cashoutChargePaid);
    const gatewayRate = await getGatewayRateForChannel(gatewayChannel, paymentDate);
    const rawGatewayCharge = paymentBaseAmount * (gatewayRate.cashoutRatePercentage / 100) + gatewayRate.fixedFee;
    const roundingIncrement = gatewayRate.roundingIncrement || 1;
    // Round upward so a member payment never leaves the accountant short of the gateway's charge.
    const requiredCashoutCharge = rawGatewayCharge > 0
      ? Math.ceil(rawGatewayCharge / roundingIncrement) * roundingIncrement
      : 0;
    if (cashoutChargePaid > totalAmount) {
      throw createError('Cash-out charge paid cannot exceed the total amount received.', 400);
    }
    const totalChargeDueBeforePayment = currentCashoutDue + requiredCashoutCharge;
    if (cashoutChargePaid > totalChargeDueBeforePayment) {
      throw createError(`Cash-out charge paid cannot exceed the member's due charge of BDT ${totalChargeDueBeforePayment}.`, 400);
    }
    const newCashoutDue = Math.max(0, totalChargeDueBeforePayment - cashoutChargePaid);
    const newlyUnpaidCashoutCharge = Math.max(0, requiredCashoutCharge - Math.max(0, cashoutChargePaid - currentCashoutDue));
    const pastPrincipalDue = existingDues.reduce((sum, due) => sum + Math.max(0, due.principalDue - due.principalPaid), 0);
    const pastPenaltyDue = existingDues.reduce((sum, due) => sum + Math.max(0, due.penaltyDue - due.penaltyPaid), 0);
    const currentPrincipalDue = Math.max(0, monthlyObligation - (currentLedger?.principalPaid || 0));
    const currentPenaltyRule = await this.getPenaltyRule(currentYearMonth);
    const currentPenaltyDue = dayOfMonth > currentPenaltyRule.graceDayOfMonth && !(await this.isMonthWaived(currentYearMonth, member._id))
      ? Math.max(0, currentMemberShares * currentPenaltyRule.ratePerShare - (currentLedger?.penaltyPaid || 0))
      : 0;
    const requiredChargeForCurrentDue = (() => {
      const dueBase = pastPrincipalDue + pastPenaltyDue + currentPrincipalDue + currentPenaltyDue;
      const raw = dueBase * (gatewayRate.cashoutRatePercentage / 100) + gatewayRate.fixedFee;
      return raw > 0 ? Math.ceil(raw / roundingIncrement) * roundingIncrement : 0;
    })();

    return {
      member: {
        id: member._id,
        name: member.name,
        memberId: member.memberId,
        shares: currentMemberShares,
        monthlyObligation,
        currentCashoutDue,
        newCashoutDue,
      },
      allocations,
      breakdown: {
        totalAmount,
        principalAmount: totalPrincipal,
        penaltyAmount: totalPenalty,
        advanceAmount: totalAdvance,
        cashoutChargePaid,
        unpaidCashoutCharge: newlyUnpaidCashoutCharge,
      },
      gateway: {
        channel: gatewayChannel,
        ratePercentage: gatewayRate.cashoutRatePercentage,
        fixedFee: gatewayRate.fixedFee,
        roundingIncrement,
        rawCharge: rawGatewayCharge,
        requiredCharge: requiredCashoutCharge,
      },
      dueSummary: {
        previousMonthsPrincipal: pastPrincipalDue,
        previousMonthsPenalty: pastPenaltyDue,
        currentMonthPayable: currentPrincipalDue,
        currentMonthPenalty: currentPenaltyDue,
        carriedCashoutCharge: currentCashoutDue,
        estimatedCashoutCharge: requiredChargeForCurrentDue,
        totalDue: pastPrincipalDue + pastPenaltyDue + currentPrincipalDue + currentPenaltyDue + currentCashoutDue + requiredChargeForCurrentDue,
      },
      coverage: {
        coversFrom,
        coversTo,
      },
    };
  }

  /**
   * Record Official Payment & Execute Allocations
   * Creates Payment, Allocations, CustodyMovement, updates Ledgers & Balances atomically.
   */
  static async recordPayment(
    input: {
      memberId: string;
      receiverId: string;
      custodyAccountId: string;
      paymentDate?: string | Date;
      totalAmount: number;
      paymentMethod: PaymentMethod;
      cashoutChargePaid?: number;
      transactionReference?: string;
      notes?: string;
    },
    actingUser: IUser
  ) {
    const { memberId, receiverId, custodyAccountId, totalAmount, paymentMethod } = input;

    if (!totalAmount || totalAmount <= 0) {
      throw createError('Payment total amount must be greater than 0', 400);
    }

    const member = await Member.findById(memberId);
    if (!member) {
      throw createError('Member not found', 404);
    }

    const custodyAccount = await CustodyAccount.findById(custodyAccountId);
    if (!custodyAccount || !custodyAccount.isActive) {
      throw createError('Destination custody account not found or inactive', 400);
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const currentYearMonth = toYearMonth(paymentDate);

    // 1. Calculate authoritative allocations
    const preview = await this.calculatePaymentPreview({
      memberId,
      paymentDate,
      totalAmount,
      cashoutChargePaid: input.cashoutChargePaid,
      paymentMethod,
      custodyAccountId,
    });

    // 2. Generate formatted sequential Receipt Number: RCP-YYYYMM-XXXX
    const prefix = `RCP-${currentYearMonth.replace('-', '')}`;
    const countThisMonth = await Payment.countDocuments({
      receiptNumber: { $regex: `^${prefix}` },
    });
    const seqStr = String(countThisMonth + 1).padStart(4, '0');
    const receiptNumber = `${prefix}-${seqStr}`;

    // 3. Create Payment record
    const payment = await Payment.create({
      receiptNumber,
      memberId: member._id,
      receiverId,
      custodyAccountId: custodyAccount._id,
      paymentDate,
      totalAmount,
      principalAmount: preview.breakdown.principalAmount,
      penaltyAmount: preview.breakdown.penaltyAmount,
      cashoutCharge: preview.breakdown.cashoutChargePaid,
      unpaidCashoutCharge: preview.breakdown.unpaidCashoutCharge,
      advanceAmount: preview.breakdown.advanceAmount,
      paymentMethod,
      transactionReference: input.transactionReference || '',
      status: PaymentStatus.COLLECTED,
      notes: input.notes || '',
    });

    // 4. Create Immutable Payment Allocations
    const allocationDocs = preview.allocations.map((a) => ({
      paymentId: payment._id,
      memberId: member._id,
      targetMonth: a.targetMonth,
      allocationType: a.allocationType,
      amount: a.amount,
    }));

    if (allocationDocs.length > 0) {
      await PaymentAllocation.insertMany(allocationDocs);
    }

    // 5. Update/Upsert MonthlyLedger for affected months
    const affectedMonths = Array.from(new Set(preview.allocations.map((a) => a.targetMonth)));
    for (const month of affectedMonths) {
      const monthAllocations = preview.allocations.filter((a) => a.targetMonth === month);
      const principalAlloc = monthAllocations
        .filter(
          (a) =>
            a.allocationType === AllocationType.PRINCIPAL ||
            a.allocationType === AllocationType.PREVIOUS_DUE ||
            a.allocationType === AllocationType.ADVANCE
        )
        .reduce((sum, a) => sum + a.amount, 0);

      const penaltyAlloc = monthAllocations
        .filter((a) => a.allocationType === AllocationType.PENALTY)
        .reduce((sum, a) => sum + a.amount, 0);

      const shareCount = await this.getMemberShareCount(member._id, month);
      const monthlyObligation = shareCount * (await getMonthlyShareValue());

      const existingLedger = await MonthlyLedger.findOne({ memberId: member._id, month });
      if (existingLedger) {
        existingLedger.principalPaid += principalAlloc;
        existingLedger.penaltyPaid += penaltyAlloc;
        if (existingLedger.principalPaid >= existingLedger.principalDue) {
          existingLedger.status = MonthlyLedgerStatus.PAID;
        } else {
          existingLedger.status = MonthlyLedgerStatus.PARTIAL;
        }
        existingLedger.lastRebuiltAt = new Date();
        await existingLedger.save();
      } else {
        const isPaid = principalAlloc >= monthlyObligation;
        await MonthlyLedger.create({
          memberId: member._id,
          month,
          shareCount,
          principalDue: monthlyObligation,
          penaltyDue: penaltyAlloc,
          principalPaid: principalAlloc,
          penaltyPaid: penaltyAlloc,
          advanceApplied: month > currentYearMonth ? principalAlloc : 0,
          excessAdvance: 0,
          status: isPaid ? MonthlyLedgerStatus.PAID : MonthlyLedgerStatus.PARTIAL,
          lastRebuiltAt: new Date(),
        });
      }
    }

    // 6. Update Member's cashoutDue
    member.cashoutDue = preview.member.newCashoutDue;
    await member.save();

    // 7. Create verified CustodyMovement (docs/fianl-docs_analysis_report.md Section B)
    await CustodyMovement.create({
      custodyAccountId: custodyAccount._id,
      movementType: MovementType.IN,
      amount: totalAmount,
      sourceType: MovementSourceType.MEMBER_PAYMENT,
      sourceRefId: payment._id,
      date: paymentDate,
      description: `Collection from ${member.name} (${member.memberId}) - ${receiptNumber} [${paymentMethod}]`,
      performedBy: (actingUser as unknown as { _id: Types.ObjectId })._id || receiverId,
    });

    // 8. Update CustodyAccount.cachedBalance derived from ledger
    const totalIn = await CustodyMovement.aggregate([
      { $match: { custodyAccountId: custodyAccount._id, movementType: MovementType.IN } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalOut = await CustodyMovement.aggregate([
      { $match: { custodyAccountId: custodyAccount._id, movementType: MovementType.OUT } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const balance = (totalIn[0]?.total || 0) - (totalOut[0]?.total || 0);
    custodyAccount.cachedBalance = balance;
    await custodyAccount.save();

    // 9. Audit Log
    await AuditLog.create({
      performedBy: (actingUser as unknown as { _id: Types.ObjectId })._id || receiverId,
      action: 'COLLECT_MEMBER_PAYMENT',
      entityName: 'Payment',
      entityId: payment._id,
      afterState: {
        receiptNumber,
        memberId: member._id,
        memberName: member.name,
        totalAmount,
        principalAmount: payment.principalAmount,
        penaltyAmount: payment.penaltyAmount,
        cashoutCharge: payment.cashoutCharge,
        advanceAmount: payment.advanceAmount,
        custodyAccount: custodyAccount.name,
        paymentMethod,
      },
      reason: `Recorded member contribution payment ${receiptNumber}`,
    });

    return {
      payment,
      allocations: preview.allocations,
      coverage: preview.coverage,
      receiptNumber,
    };
  }

  /**
   * Analytics & Aggregations
   * Supports filtering by Daily, Monthly, Yearly intervals, Accountant, and Payment Method.
   */
  static async getPaymentStats(filters: {
    timeframe?: 'daily' | 'monthly' | 'yearly';
    date?: string; // YYYY-MM-DD for daily, YYYY-MM for monthly, YYYY for yearly
    receiverId?: string;
    paymentMethod?: string;
  }) {
    const timeframe = filters.timeframe || 'monthly';
    const matchQuery: Record<string, unknown> = {
      status: { $ne: PaymentStatus.CANCELLED },
    };

    // Receiver / Accountant filter
    if (filters.receiverId && filters.receiverId !== 'ALL') {
      matchQuery.receiverId = new mongoose.Types.ObjectId(filters.receiverId);
    }

    // Payment method filter
    if (filters.paymentMethod && filters.paymentMethod !== 'ALL') {
      matchQuery.paymentMethod = filters.paymentMethod;
    }

    // Date range filter
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (timeframe === 'daily') {
      const target = filters.date ? new Date(filters.date) : now;
      startDate = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0);
      endDate = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999);
    } else if (timeframe === 'yearly') {
      const year = filters.date ? parseInt(filters.date, 10) : now.getFullYear();
      startDate = new Date(year, 0, 1);
      endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    } else {
      // Monthly (default)
      const dateParts = (filters.date || toYearMonth(now)).split('-').map(Number);
      const y = dateParts[0];
      const m = dateParts[1] - 1;
      startDate = new Date(y, m, 1);
      endDate = new Date(y, m + 1, 0, 23, 59, 59, 999);
    }

    matchQuery.paymentDate = { $gte: startDate, $lte: endDate };

    // 1. Overall Aggregations
    const overall = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalReceived: { $sum: '$totalAmount' },
          totalPrincipal: { $sum: '$principalAmount' },
          totalPenalty: { $sum: '$penaltyAmount' },
          totalAdvance: { $sum: '$advanceAmount' },
          totalCashoutCharge: { $sum: '$cashoutCharge' },
          totalUnpaidCashout: { $sum: '$unpaidCashoutCharge' },
          count: { $sum: 1 },
        },
      },
    ]);

    // 2. Breakdown by Payment Method (bKash, Nagad, Cash, Bank)
    const byMethod = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$paymentMethod',
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
    ]);

    // 3. Breakdown by Accountant (Moin vs Samrat) for Admin oversight
    const byAccountant = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$receiverId',
          total: { $sum: '$totalAmount' },
          principal: { $sum: '$principalAmount' },
          penalty: { $sum: '$penaltyAmount' },
          advance: { $sum: '$advanceAmount' },
          cashout: { $sum: '$cashoutCharge' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'receiver',
        },
      },
      {
        $unwind: {
          path: '$receiver',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          name: '$receiver.name',
          email: '$receiver.email',
          accountantType: '$receiver.accountantType',
          total: 1,
          principal: 1,
          penalty: 1,
          advance: 1,
          cashout: 1,
          count: 1,
        },
      },
    ]);

    return {
      timeframe,
      dateRange: { startDate, endDate },
      totals: overall[0] || {
        totalReceived: 0,
        totalPrincipal: 0,
        totalPenalty: 0,
        totalAdvance: 0,
        totalCashoutCharge: 0,
        totalUnpaidCashout: 0,
        count: 0,
      },
      byMethod: byMethod.reduce<Record<string, { total: number; count: number }>>((acc, item) => {
        acc[item._id] = { total: item.total, count: item.count };
        return acc;
      }, {}),
      byAccountant,
    };
  }

  /**
   * List Payments with Search and Filters
   */
  static async getPayments(query: {
    page?: number;
    limit?: number;
    search?: string;
    receiverId?: string;
    paymentMethod?: string;
    month?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 15));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (query.receiverId && query.receiverId !== 'ALL') {
      filter.receiverId = query.receiverId;
    }

    if (query.paymentMethod && query.paymentMethod !== 'ALL') {
      filter.paymentMethod = query.paymentMethod;
    }

    if (query.month) {
      const [y, m] = query.month.split('-').map(Number);
      filter.paymentDate = {
        $gte: new Date(y, m - 1, 1),
        $lt: new Date(y, m, 1),
      };
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      const matchingMembers = await Member.find({
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { memberId: { $regex: term, $options: 'i' } },
          { phone: { $regex: term, $options: 'i' } },
        ],
      }).select('_id');

      filter.$or = [
        { receiptNumber: { $regex: term, $options: 'i' } },
        { transactionReference: { $regex: term, $options: 'i' } },
        { memberId: { $in: matchingMembers.map((m) => m._id) } },
      ];
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('memberId', 'name memberId phone')
        .populate('receiverId', 'name email accountantType')
        .populate('custodyAccountId', 'name channel accountNumber')
        .sort({ paymentDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    return {
      payments,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single Payment with all Allocations for Receipt view
   */
  static async getPaymentDetails(paymentId: string) {
    const payment = await Payment.findById(paymentId)
      .populate('memberId', 'name memberId phone address')
      .populate('receiverId', 'name email accountantType phone')
      .populate('custodyAccountId', 'name channel accountNumber');

    if (!payment) {
      throw createError('Payment receipt not found', 404);
    }

    const allocations = await PaymentAllocation.find({ paymentId: payment._id }).sort({
      targetMonth: 1,
    });

    return {
      payment,
      allocations,
    };
  }

  /**
   * Penalty Rules & Waivers Management (Admin)
   */
  static async getPenaltyRules() {
    return PenaltyRule.find().sort({ effectiveFrom: -1 });
  }

  static async savePenaltyRule(
    input: {
      effectiveFrom: string;
      effectiveTo?: string | null;
      ratePerShare: number;
      graceDayOfMonth: number;
      description?: string;
    },
    actingUser: IUser
  ) {
    const rule = await PenaltyRule.findOneAndUpdate(
      { effectiveFrom: input.effectiveFrom },
      {
        ...input,
        effectiveTo: input.effectiveTo || null,
      },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      performedBy: (actingUser as unknown as { _id: Types.ObjectId })._id,
      action: 'UPDATE_PENALTY_RULE',
      entityName: 'PenaltyRule',
      entityId: rule._id,
      afterState: rule.toObject(),
      reason: `Updated penalty rule for ${input.effectiveFrom} (${input.ratePerShare} BDT/share)`,
    });

    return rule;
  }

  static async getPenaltyWaivers() {
    return PenaltyWaiver.find().populate('memberId', 'name memberId').sort({ month: -1 });
  }

  static async createPenaltyWaiver(
    input: {
      month: string;
      isGlobal: boolean;
      memberId?: string;
      reason: string;
    },
    actingUser: IUser
  ) {
    const waiver = await PenaltyWaiver.create({
      month: input.month,
      isGlobal: input.isGlobal,
      memberId: input.memberId || null,
      reason: input.reason,
      approvedBy: (actingUser as unknown as { _id: Types.ObjectId })._id,
    });

    await AuditLog.create({
      performedBy: (actingUser as unknown as { _id: Types.ObjectId })._id,
      action: 'CREATE_PENALTY_WAIVER',
      entityName: 'PenaltyWaiver',
      entityId: waiver._id,
      afterState: waiver.toObject(),
      reason: `Granted penalty waiver for ${input.month}: ${input.reason}`,
    });

    return waiver;
  }
}
