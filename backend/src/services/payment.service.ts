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

function currency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
    penaltyWaiverAmount?: number;
    cashoutWaiverAmount?: number;
    waiverReason?: string;
    paymentMethod: PaymentMethod;
    custodyAccountId?: string;
  }) {
    const { memberId, totalAmount } = input;
    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const cashoutChargePaid = Math.max(0, Number(input.cashoutChargePaid) || 0);
    const penaltyWaiverAmount = currency(Math.max(0, Number(input.penaltyWaiverAmount) || 0));
    const cashoutWaiverAmount = currency(Math.max(0, Number(input.cashoutWaiverAmount) || 0));
    const waiverReason = input.waiverReason?.trim() || '';
    if ((penaltyWaiverAmount > 0 || cashoutWaiverAmount > 0) && waiverReason.length < 5) {
      throw createError('A waiver reason of at least 5 characters is required.', 400);
    }

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
    }).sort({ month: 1 });

    const currentLedger = await MonthlyLedger.findOne({
      memberId: member._id,
      month: currentYearMonth,
    });

    const allocations: Array<{
      targetMonth: string;
      allocationType: AllocationType;
      amount: number;
      description: string;
    }> = [];

    let totalPrincipal = 0;
    let totalPenalty = 0;
    let totalAdvance = 0;
    let remainingPenaltyWaiver = penaltyWaiverAmount;
    const penaltyWaiversByMonth: Array<{ month: string; amount: number }> = [];

    for (const due of existingDues) {
      if (remainingPenaltyWaiver <= 0) break;
      const outstandingPenalty = Math.max(0, due.penaltyDue - due.penaltyPaid - (due.penaltyWaived || 0));
      const waived = Math.min(remainingPenaltyWaiver, outstandingPenalty);
      if (waived > 0) {
        penaltyWaiversByMonth.push({ month: due.month, amount: waived });
        remainingPenaltyWaiver = currency(remainingPenaltyWaiver - waived);
      }
    }

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
      const waiverForMonth = penaltyWaiversByMonth.find((waiver) => waiver.month === due.month)?.amount || 0;
      const outstandingPenalty = Math.max(0, due.penaltyDue - due.penaltyPaid - (due.penaltyWaived || 0) - waiverForMonth);
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
    const currentPenaltyRule = await this.getPenaltyRule(currentYearMonth);
    const currentPenaltyApplies = dayOfMonth > currentPenaltyRule.graceDayOfMonth
      && !(await this.isMonthWaived(currentYearMonth, member._id));
    const currentPenaltyDue = currentPenaltyApplies
      ? currentMemberShares * currentPenaltyRule.ratePerShare
      : 0;
    const currentPenaltyOutstanding = Math.max(
      0,
      currentPenaltyDue - (currentLedger?.penaltyPaid || 0) - (currentLedger?.penaltyWaived || 0)
    );
    const currentPenaltyWaived = Math.min(remainingPenaltyWaiver, currentPenaltyOutstanding);
    if (currentPenaltyWaived > 0) {
      penaltyWaiversByMonth.push({ month: currentYearMonth, amount: currentPenaltyWaived });
      remainingPenaltyWaiver = currency(remainingPenaltyWaiver - currentPenaltyWaived);
    }
    if (remainingPenaltyWaiver > 0) {
      throw createError(`Penalty waiver cannot exceed the member's outstanding penalty of BDT ${currency(penaltyWaiverAmount - remainingPenaltyWaiver)}.`, 400);
    }

    const isCurrentPaid = !!currentLedger
      && currentLedger.principalPaid >= monthlyObligation
      && (currentLedger.penaltyPaid + (currentLedger.penaltyWaived || 0)) >= currentPenaltyDue;

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

      if (currentPenaltyApplies && remainingCash > 0) {
        const penaltyNeeded = Math.max(0, currentPenaltyOutstanding - currentPenaltyWaived);

        if (penaltyNeeded > 0) {
          const penaltyAllocated = Math.min(remainingCash, penaltyNeeded);
          allocations.push({
            targetMonth: currentYearMonth,
            allocationType: AllocationType.PENALTY,
            amount: penaltyAllocated,
            description: `Current month (${currentYearMonth}) late penalty (${currentPenaltyRule.ratePerShare} BDT/share)`,
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
    const rawGatewayCharge = currency(paymentBaseAmount * (gatewayRate.cashoutRatePercentage / 100) + gatewayRate.fixedFee);
    const roundingIncrement = gatewayRate.roundingIncrement ?? 0;
    // Round upward so a member payment never leaves the accountant short of the gateway's charge.
    const requiredCashoutCharge = rawGatewayCharge > 0
      ? roundingIncrement > 0 ? Math.ceil(rawGatewayCharge / roundingIncrement) * roundingIncrement : currency(rawGatewayCharge)
      : 0;
    if (cashoutChargePaid > totalAmount) {
      throw createError('Cash-out charge paid cannot exceed the total amount received.', 400);
    }
    const totalChargeDueBeforePayment = currentCashoutDue + requiredCashoutCharge;
    if (cashoutChargePaid + cashoutWaiverAmount > totalChargeDueBeforePayment) {
      throw createError(`Cash-out payment and waiver cannot exceed the member's due charge of BDT ${totalChargeDueBeforePayment}.`, 400);
    }
    if (cashoutChargePaid > totalChargeDueBeforePayment) {
      throw createError(`Cash-out charge paid cannot exceed the member's due charge of BDT ${totalChargeDueBeforePayment}.`, 400);
    }
    const newCashoutDue = Math.max(0, totalChargeDueBeforePayment - cashoutChargePaid - cashoutWaiverAmount);
    const cashoutWaiverAgainstCurrentCharge = Math.max(0, cashoutWaiverAmount - currentCashoutDue);
    const newlyUnpaidCashoutCharge = Math.max(0, requiredCashoutCharge - Math.max(0, cashoutChargePaid - currentCashoutDue) - cashoutWaiverAgainstCurrentCharge);
    const pastPrincipalDue = existingDues.reduce((sum, due) => sum + Math.max(0, due.principalDue - due.principalPaid), 0);
    const pastPenaltyDue = existingDues.reduce((sum, due) => {
      const waiverForMonth = penaltyWaiversByMonth.find((waiver) => waiver.month === due.month)?.amount || 0;
      return sum + Math.max(0, due.penaltyDue - due.penaltyPaid - (due.penaltyWaived || 0) - waiverForMonth);
    }, 0);
    const currentPrincipalDue = Math.max(0, monthlyObligation - (currentLedger?.principalPaid || 0));
    const currentPenaltyDueAfterWaiver = Math.max(0, currentPenaltyOutstanding - currentPenaltyWaived);
    const requiredChargeForCurrentDue = (() => {
      const dueBase = pastPrincipalDue + pastPenaltyDue + currentPrincipalDue + currentPenaltyDueAfterWaiver;
      const raw = currency(dueBase * (gatewayRate.cashoutRatePercentage / 100) + gatewayRate.fixedFee);
      return raw > 0 ? roundingIncrement > 0 ? Math.ceil(raw / roundingIncrement) * roundingIncrement : currency(raw) : 0;
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
        penaltyWaived: penaltyWaiverAmount,
        cashoutChargeWaived: cashoutWaiverAmount,
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
        currentMonthPenalty: currentPenaltyDueAfterWaiver,
        carriedCashoutCharge: currentCashoutDue,
        estimatedCashoutCharge: requiredChargeForCurrentDue,
        totalDue: pastPrincipalDue + pastPenaltyDue + currentPrincipalDue + currentPenaltyDueAfterWaiver + newCashoutDue,
      },
      coverage: {
        coversFrom,
        coversTo,
      },
      waivers: {
        penaltyAmount: penaltyWaiverAmount,
        cashoutAmount: cashoutWaiverAmount,
        reason: waiverReason,
        penaltyByMonth: penaltyWaiversByMonth,
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
      penaltyWaiverAmount?: number;
      cashoutWaiverAmount?: number;
      waiverReason?: string;
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
    const actingUserId = (actingUser as unknown as { _id?: Types.ObjectId; linkedGatewayChannels?: CustodyChannel[]; accountantType?: string | null })._id;
    const configuredGateways = (actingUser as unknown as { linkedGatewayChannels?: CustodyChannel[] }).linkedGatewayChannels || [];
    if (configuredGateways.length > 0 && !configuredGateways.includes(custodyAccount.channel)) {
      throw createError(`Your staff profile is not permitted to receive payments through ${custodyAccount.channel}.`, 403);
    }
    if (actingUser.accountantType && actingUserId && String(custodyAccount.holderId || '') !== String(actingUserId)) {
      throw createError('Accountants can record collections only in their own assigned custody accounts.', 403);
    }

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();
    const currentYearMonth = toYearMonth(paymentDate);

    // 1. Calculate authoritative allocations
    const preview = await this.calculatePaymentPreview({
      memberId,
      paymentDate,
      totalAmount,
      cashoutChargePaid: input.cashoutChargePaid,
      penaltyWaiverAmount: input.penaltyWaiverAmount,
      cashoutWaiverAmount: input.cashoutWaiverAmount,
      waiverReason: input.waiverReason,
      paymentMethod,
      custodyAccountId,
    });

    // 2. Generate formatted sequential Receipt Number: RCP-YYYYMM-XXXX
    const prefix = `RCP-${currentYearMonth.replace('-', '')}`;
    const latestPayment = await Payment.findOne({
      receiptNumber: { $regex: `^${prefix}` },
    }).sort({ receiptNumber: -1 });

    let nextSeq = 1;
    if (latestPayment?.receiptNumber) {
      const parts = latestPayment.receiptNumber.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }

    let receiptNumber = '';
    while (true) {
      const candidate = `${prefix}-${String(nextSeq).padStart(4, '0')}`;
      const exists = await Payment.exists({ receiptNumber: candidate });
      if (!exists) {
        receiptNumber = candidate;
        break;
      }
      nextSeq += 1;
    }

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
      penaltyWaived: preview.breakdown.penaltyWaived,
      cashoutChargeWaived: preview.breakdown.cashoutChargeWaived,
      waiverReason: preview.waivers.reason,
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
    const affectedMonths = Array.from(new Set([
      ...preview.allocations.map((a) => a.targetMonth),
      ...preview.waivers.penaltyByMonth.map((waiver) => waiver.month),
    ]));
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
      const penaltyWaived = preview.waivers.penaltyByMonth
        .filter((waiver) => waiver.month === month)
        .reduce((sum, waiver) => sum + waiver.amount, 0);

      const shareCount = await this.getMemberShareCount(member._id, month);
      const monthlyObligation = shareCount * (await getMonthlyShareValue());

      const existingLedger = await MonthlyLedger.findOne({ memberId: member._id, month });
      if (existingLedger) {
        existingLedger.principalPaid += principalAlloc;
        existingLedger.penaltyPaid += penaltyAlloc;
        existingLedger.penaltyWaived = (existingLedger.penaltyWaived || 0) + penaltyWaived;
        if (
          existingLedger.principalPaid >= existingLedger.principalDue
          && existingLedger.penaltyPaid + (existingLedger.penaltyWaived || 0) >= existingLedger.penaltyDue
        ) {
          existingLedger.status = MonthlyLedgerStatus.PAID;
        } else {
          existingLedger.status = MonthlyLedgerStatus.PARTIAL;
        }
        existingLedger.lastRebuiltAt = new Date();
        await existingLedger.save();
      } else {
        const penaltyDueForNewLedger = month === currentYearMonth
          ? preview.dueSummary.currentMonthPenalty + penaltyWaived
          : penaltyAlloc;
        const isPaid = principalAlloc >= monthlyObligation && penaltyAlloc + penaltyWaived >= penaltyDueForNewLedger;
        await MonthlyLedger.create({
          memberId: member._id,
          month,
          shareCount,
          principalDue: monthlyObligation,
          penaltyDue: penaltyDueForNewLedger,
          principalPaid: principalAlloc,
          penaltyPaid: penaltyAlloc,
          penaltyWaived,
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
        penaltyWaived: payment.penaltyWaived,
        cashoutChargeWaived: payment.cashoutChargeWaived,
        waiverReason: payment.waiverReason,
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
   * Supports filtering by all-time, daily, monthly, yearly intervals, Accountant, and Payment Method.
   */
  static async getPaymentStats(filters: {
    timeframe?: 'all' | 'daily' | 'monthly' | 'yearly';
    date?: string; // YYYY-MM-DD for daily, YYYY-MM for monthly, YYYY for yearly
    receiverId?: string;
    paymentMethod?: string;
  }) {
    const timeframe = filters.timeframe || 'all';
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
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (timeframe === 'all') {
      // Intentionally no payment-date predicate: the overview must reconcile
      // with the full receipt and payment-history ledger.
    } else if (timeframe === 'daily') {
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

    if (startDate && endDate) {
      matchQuery.paymentDate = { $gte: startDate, $lte: endDate };
    }

    // 1. Live receipt aggregations. These are queried after every posted
    // payment; no analytics value is cached in the application process.
    const [overall, byMethod, byAccountant, dueLedgers, cashoutDues] = await Promise.all([
      Payment.aggregate([
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
      ]),

      // 2. Breakdown by Payment Method (bKash, Nagad, Cash, Bank)
      Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$paymentMethod',
          total: { $sum: '$totalAmount' },
          count: { $sum: 1 },
        },
      },
      ]),

      // 3. Breakdown by Accountant (Moin vs Samrat) for Admin oversight
      Payment.aggregate([
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
      ]),

      // Outstanding ledger parts are kept separate so accountants can see
      // exactly whether principal, penalty, or gateway charges need action.
      MonthlyLedger.find({}).select('principalDue penaltyDue principalPaid penaltyPaid penaltyWaived').lean(),
      Member.aggregate([
        { $match: { cashoutDue: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$cashoutDue' }, count: { $sum: 1 } } },
      ]),
    ]);

    const dueSummary = dueLedgers.reduce(
      (summary, ledger) => {
        summary.principal += Math.max(0, Number(ledger.principalDue || 0) - Number(ledger.principalPaid || 0));
        summary.penalty += Math.max(0, Number(ledger.penaltyDue || 0) - Number(ledger.penaltyPaid || 0) - Number(ledger.penaltyWaived || 0));
        return summary;
      },
      { principal: 0, penalty: 0 }
    );
    const cashout = Number(cashoutDues[0]?.total || 0);

    return {
      timeframe,
      dateRange: startDate && endDate ? { startDate, endDate } : null,
      totals: overall[0] || {
        totalReceived: 0,
        totalPrincipal: 0,
        totalPenalty: 0,
        totalAdvance: 0,
        totalCashoutCharge: 0,
        totalUnpaidCashout: 0,
        count: 0,
      },
      dueSummary: {
        principal: currency(dueSummary.principal),
        penalty: currency(dueSummary.penalty),
        cashout,
        total: currency(dueSummary.principal + dueSummary.penalty + cashout),
        cashoutMemberCount: Number(cashoutDues[0]?.count || 0),
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
    year?: string;
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
    } else if (query.year && /^\d{4}$/.test(query.year)) {
      const year = Number(query.year);
      filter.paymentDate = {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1),
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
   * Corrects non-financial receipt metadata without changing the payment amount,
   * allocations, or custody movement.
   */
  static async updatePaymentMetadata(
    paymentId: string,
    input: { transactionReference?: string; notes?: string },
    actingUser: IUser
  ) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw createError('Payment receipt not found', 404);
    if (payment.status === PaymentStatus.CANCELLED) throw createError('A voided payment cannot be edited.', 409);

    const beforeState = { transactionReference: payment.transactionReference || '', notes: payment.notes || '' };
    if (input.transactionReference !== undefined) payment.transactionReference = input.transactionReference.trim();
    if (input.notes !== undefined) payment.notes = input.notes.trim();
    await payment.save();

    await AuditLog.create({
      performedBy: (actingUser as any)._id,
      action: 'EDIT_PAYMENT_METADATA',
      entityName: 'Payment',
      entityId: payment._id,
      beforeState,
      afterState: { transactionReference: payment.transactionReference || '', notes: payment.notes || '' },
      reason: `Corrected non-financial payment metadata for ${payment.receiptNumber}`,
    });
    return payment;
  }

  /**
   * A posted payment is never physically deleted. This provides an auditable
   * void for the latest simple payment, paired with a compensating custody OUT.
   */
  static async voidPayment(paymentId: string, reason: string, actingUser: IUser) {
    const payment = await Payment.findById(paymentId);
    if (!payment) throw createError('Payment receipt not found', 404);
    if (payment.status === PaymentStatus.CANCELLED) throw createError('This payment has already been voided.', 409);
    if (!reason || reason.trim().length < 5) throw createError('A void reason of at least 5 characters is required.', 400);
    if ((payment.cashoutCharge || 0) > 0 || (payment.unpaidCashoutCharge || 0) > 0 || (payment.penaltyWaived || 0) > 0 || (payment.cashoutChargeWaived || 0) > 0) {
      throw createError('Payments containing cash-out charges or waivers require an Admin correction; they cannot be voided automatically.', 409);
    }

    const latestActive = await Payment.findOne({ memberId: payment.memberId, status: { $ne: PaymentStatus.CANCELLED } })
      .sort({ paymentDate: -1, createdAt: -1 });
    if (!latestActive || String(latestActive._id) !== String(payment._id)) {
      throw createError('Only the member\'s latest active payment can be voided automatically. Use an Admin correction for an older payment.', 409);
    }

    const allocations = await PaymentAllocation.find({ paymentId: payment._id });
    for (const allocation of allocations) {
      const ledger = await MonthlyLedger.findOne({ memberId: payment.memberId, month: allocation.targetMonth });
      if (!ledger) continue;
      if ([AllocationType.PRINCIPAL, AllocationType.PREVIOUS_DUE, AllocationType.ADVANCE].includes(allocation.allocationType)) {
        ledger.principalPaid = Math.max(0, ledger.principalPaid - allocation.amount);
      } else if (allocation.allocationType === AllocationType.PENALTY) {
        ledger.penaltyPaid = Math.max(0, ledger.penaltyPaid - allocation.amount);
      }
      ledger.status = ledger.principalPaid >= ledger.principalDue
        && ledger.penaltyPaid + (ledger.penaltyWaived || 0) >= ledger.penaltyDue
        ? MonthlyLedgerStatus.PAID
        : ledger.principalPaid > 0 || ledger.penaltyPaid > 0 ? MonthlyLedgerStatus.PARTIAL : MonthlyLedgerStatus.DUE;
      ledger.lastRebuiltAt = new Date();
      await ledger.save();
    }

    const custodyAccount = await CustodyAccount.findById(payment.custodyAccountId);
    if (!custodyAccount) throw createError('Payment custody account not found.', 404);
    await CustodyMovement.create({
      custodyAccountId: custodyAccount._id,
      movementType: MovementType.OUT,
      amount: payment.totalAmount,
      sourceType: MovementSourceType.MEMBER_PAYMENT,
      sourceRefId: payment._id,
      date: new Date(),
      description: `Void of member payment ${payment.receiptNumber}: ${reason.trim()}`,
      performedBy: (actingUser as any)._id,
    });
    const movements = await CustodyMovement.aggregate([
      { $match: { custodyAccountId: custodyAccount._id } },
      { $group: { _id: '$movementType', total: { $sum: '$amount' } } },
    ]);
    custodyAccount.cachedBalance = movements.reduce((sum, movement) => sum + (movement._id === MovementType.IN ? movement.total : -movement.total), 0);
    await custodyAccount.save();

    payment.status = PaymentStatus.CANCELLED;
    payment.voidReason = reason.trim();
    payment.voidedAt = new Date();
    payment.voidedBy = (actingUser as any)._id;
    await payment.save();
    await AuditLog.create({
      performedBy: (actingUser as any)._id,
      action: 'VOID_MEMBER_PAYMENT',
      entityName: 'Payment',
      entityId: payment._id,
      beforeState: { status: PaymentStatus.COLLECTED, totalAmount: payment.totalAmount },
      afterState: { status: PaymentStatus.CANCELLED, voidReason: payment.voidReason },
      reason: `Voided ${payment.receiptNumber}: ${payment.voidReason}`,
    });
    return payment;
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
