import { Types } from 'mongoose';
import { Member } from '../../models/Member.js';
import { CustodyAccount } from '../../models/CustodyAccount.js';
import { Payment } from '../../models/Payment.js';
import { PaymentReceipt } from '../../models/PaymentReceipt.js';
import { MonthlyLedger } from '../../models/MonthlyLedger.js';
import { PaymentAllocation } from '../../models/PaymentAllocation.js';
import {
  ExtractedReceiptData,
  MemberMatchResult,
  CustodyMatchResult,
  DuplicateCheckResult,
  ReceiptGateway,
} from '../../types/receipt.js';
import { CustodyChannel } from '../../types/models.js';

function toYearMonth(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export class ReceiptMatchingService {
  /**
   * Matches extracted sender details to an active cooperative Member.
   */
  static async matchMember(extracted: ExtractedReceiptData): Promise<MemberMatchResult> {
    const members = await Member.find({ status: 'ACTIVE' })
      .select('_id memberId name phone')
      .lean();

    const candidates: Array<{ memberId: Types.ObjectId; name: string; phone: string; score: number }> = [];

    const senderPhone = extracted.senderPhone ? extracted.senderPhone.replace(/\D/g, '').slice(-11) : null;
    const ref = (extracted.reference || '').trim().toUpperCase();

    for (const m of members) {
      let score = 0;
      const memberPhone = (m.phone || '').replace(/\D/g, '').slice(-11);

      // Strategy 1: Exact Member ID in reference or text
      if (ref && m.memberId && ref.includes(m.memberId.toUpperCase())) {
        score = 100;
        candidates.push({ memberId: m._id as any, name: m.name, phone: m.phone, score });
        continue;
      }

      // Strategy 2: Exact Phone Match
      if (senderPhone && memberPhone && senderPhone === memberPhone) {
        score = 95;
        candidates.push({ memberId: m._id as any, name: m.name, phone: m.phone, score });
        continue;
      }

      // Strategy 3: Name match in raw text
      const cleanName = m.name.toLowerCase().trim();
      const rawTextLower = extracted.rawText.toLowerCase();
      if (cleanName.length > 3 && rawTextLower.includes(cleanName)) {
        score = 80;
        candidates.push({ memberId: m._id as any, name: m.name, phone: m.phone, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score >= 80) {
      const top = candidates[0];
      const strategy = top.score === 100 ? 'EXACT_ID' : top.score === 95 ? 'EXACT_PHONE' : 'EXACT_NAME';
      return {
        selectedMemberId: top.memberId,
        confidence: top.score,
        strategy,
        candidates,
      };
    }

    return {
      selectedMemberId: null,
      confidence: 0,
      strategy: 'NONE',
      candidates,
    };
  }

  /**
   * Matches extracted receiver or gateway to an authorized CustodyAccount.
   */
  static async matchCustodyAccount(
    extracted: ExtractedReceiptData,
    gateway: ReceiptGateway
  ): Promise<CustodyMatchResult> {
    const accounts = await CustodyAccount.find({ isActive: true })
      .select('_id name accountNumber channel')
      .lean();

    const receiverClean = extracted.receiverAccount ? extracted.receiverAccount.replace(/\D/g, '').slice(-11) : null;
    const candidates: Array<{ custodyAccountId: Types.ObjectId; name: string; accountNumber: string; channel: string; score: number }> = [];

    for (const acc of accounts) {
      const accNum = (acc.accountNumber || '').replace(/\D/g, '').slice(-11);

      // Strategy 1: Exact account number match
      if (receiverClean && accNum && receiverClean === accNum) {
        candidates.push({
          custodyAccountId: acc._id as any,
          name: acc.name,
          accountNumber: acc.accountNumber || '',
          channel: acc.channel,
          score: 100,
        });
        continue;
      }

      // Strategy 2: Channel default match
      let channelMatch = false;
      if (gateway === ReceiptGateway.BKASH && acc.channel === CustodyChannel.BKASH) channelMatch = true;
      if (gateway === ReceiptGateway.NAGAD && acc.channel === CustodyChannel.NAGAD) channelMatch = true;
      if (gateway === ReceiptGateway.BANK && acc.channel === CustodyChannel.BANK) channelMatch = true;

      if (channelMatch) {
        candidates.push({
          custodyAccountId: acc._id as any,
          name: acc.name,
          accountNumber: acc.accountNumber || '',
          channel: acc.channel,
          score: 75,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score >= 75) {
      const top = candidates[0];
      return {
        selectedCustodyAccountId: top.custodyAccountId,
        confidence: top.score,
        strategy: top.score === 100 ? 'EXACT_ACCOUNT_NUMBER' : 'CHANNEL_DEFAULT',
        candidates,
      };
    }

    return {
      selectedCustodyAccountId: null,
      confidence: 0,
      strategy: 'NONE',
      candidates,
    };
  }

  /**
   * Checks if a member already has settled payment for the target month,
   * or if another unposted/posted receipt in the queue targets the exact same month.
   */
  static async checkMonthDuplicate(
    receiptId: string,
    memberId: Types.ObjectId | string,
    paymentDate: Date | string
  ): Promise<DuplicateCheckResult | null> {
    const targetMonth = toYearMonth(paymentDate);
    if (!targetMonth || !memberId) return null;

    const memberObjId = typeof memberId === 'string' ? new Types.ObjectId(memberId) : memberId;

    // 1. Check MonthlyLedger if this month's principal obligation is already paid
    const ledger = await MonthlyLedger.findOne({
      memberId: memberObjId,
      month: targetMonth,
    }).lean();

    if (ledger && ledger.principalDue > 0 && ledger.principalPaid >= ledger.principalDue) {
      const allocation = await PaymentAllocation.findOne({
        memberId: memberObjId,
        targetMonth,
        allocationType: { $in: ['PRINCIPAL', 'PREVIOUS_DUE', 'ADVANCE'] },
      }).select('paymentId amount').lean();

      return {
        isDuplicate: true,
        duplicateType: 'MONTH_ALREADY_PAID',
        matchedTargetMonth: targetMonth,
        matchedPaymentId: (allocation?.paymentId as any) || null,
        details: `সদস্যের ${targetMonth} মাসের কিস্তি (৳${ledger.principalDue}) ইতিমধ্যেই সম্পূর্ণ পরিশোধিত (পরিশোধিত: ৳${ledger.principalPaid})। (Month ${targetMonth} is already fully settled).`,
      };
    }

    // 2. Check PaymentAllocation for an existing principal allocation for this month
    const existingAlloc = await PaymentAllocation.findOne({
      memberId: memberObjId,
      targetMonth,
      allocationType: 'PRINCIPAL',
    }).select('paymentId amount').lean();

    if (existingAlloc) {
      return {
        isDuplicate: true,
        duplicateType: 'MONTH_ALREADY_PAID',
        matchedTargetMonth: targetMonth,
        matchedPaymentId: (existingAlloc.paymentId as any) || null,
        details: `${targetMonth} মাসের জন্য পূর্বেই ৳${existingAlloc.amount} মূল কিস্তি জমা হয়েছে। (Principal payment already recorded for ${targetMonth}).`,
      };
    }

    // 3. Check another receipt in queue for the same member & target month
    const [year, month] = targetMonth.split('-').map(Number);
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const conflictingReceipt = await PaymentReceipt.findOne({
      receiptId: { $ne: receiptId },
      status: { $in: ['POSTED', 'READY_TO_POST', 'NEEDS_REVIEW', 'DUPLICATE_SUSPECTED'] },
      $or: [
        { 'reviewedData.memberId': memberObjId },
        { 'memberMatch.selectedMemberId': memberObjId },
      ],
      $and: [
        {
          $or: [
            { 'reviewedData.paymentDate': { $gte: startOfMonth, $lte: endOfMonth } },
            { 'extractedData.date': { $regex: new RegExp(`^${targetMonth}`) } },
          ],
        },
      ],
    }).select('receiptId paymentId status reviewedData extractedData').lean();

    if (conflictingReceipt) {
      const isPosted = conflictingReceipt.status === 'POSTED';
      return {
        isDuplicate: true,
        duplicateType: 'MONTH_ALREADY_PAID',
        matchedReceiptId: conflictingReceipt.receiptId,
        matchedPaymentId: conflictingReceipt.paymentId || null,
        matchedTargetMonth: targetMonth,
        details: isPosted
          ? `এই সদস্যের ${targetMonth} মাসের পেমেন্ট ইতিমধ্যে লেজারে রেকর্ড করা হয়েছে (রিসিট: ${conflictingReceipt.receiptId})।`
          : `কিউতে এই সদস্যের ${targetMonth} মাসের আরেকটি রিসিট (${conflictingReceipt.receiptId}) অপেক্ষারত রয়েছে।`,
      };
    }

    return null;
  }

  /**
   * Detects duplicate receipts or payments using SHA-256, Transaction ID, composite factors,
   * and duplicate monthly payment prevention.
   */
  static async detectDuplicates(
    receiptId: string,
    sha256: string,
    extracted: ExtractedReceiptData,
    _gateway: ReceiptGateway,
    memberId?: Types.ObjectId | string | null,
    paymentDate?: Date | string | null
  ): Promise<DuplicateCheckResult> {
    // 1. Exact file duplicate (SHA-256)
    const exactShaMatch = await PaymentReceipt.findOne({
      receiptId: { $ne: receiptId },
      sha256,
    }).select('receiptId paymentId').lean();

    if (exactShaMatch) {
      return {
        isDuplicate: true,
        duplicateType: 'SHA256_EXACT',
        matchedReceiptId: exactShaMatch.receiptId,
        matchedPaymentId: exactShaMatch.paymentId || null,
        details: 'একই রিসিট ফাইল ইতিপূর্বে আপলোড করা হয়েছে (Exact SHA-256 Match).',
      };
    }

    // 2. Transaction ID match
    if (extracted.transactionId && extracted.transactionId.length >= 6) {
      // Check existing receipts
      const existingReceipt = await PaymentReceipt.findOne({
        receiptId: { $ne: receiptId },
        'extractedData.transactionId': extracted.transactionId,
      }).select('receiptId paymentId').lean();

      if (existingReceipt) {
        return {
          isDuplicate: true,
          duplicateType: 'TRANSACTION_ID',
          matchedReceiptId: existingReceipt.receiptId,
          matchedPaymentId: existingReceipt.paymentId || null,
          details: `একই ট্রানজেকশন আইডি (${extracted.transactionId}) ইতিমধ্যে ব্যবহৃত হয়েছে।`,
        };
      }

      // Check existing posted payments
      const existingPayment = await Payment.findOne({
        transactionReference: extracted.transactionId,
      }).select('_id receiptNumber').lean();

      if (existingPayment) {
        return {
          isDuplicate: true,
          duplicateType: 'TRANSACTION_ID',
          matchedReceiptId: null,
          matchedPaymentId: existingPayment._id as any,
          details: `ট্রানজেকশন আইডি (${extracted.transactionId}) ইতিমধ্যে পেমেন্ট লেজারে সংরক্ষিত আছে।`,
        };
      }
    }

    // 3. Composite duplicate: same amount, date, and sender
    if (extracted.amount && extracted.date && extracted.senderPhone) {
      const suspectPayment = await Payment.findOne({
        totalAmount: extracted.amount,
        paymentDate: {
          $gte: new Date(`${extracted.date}T00:00:00.000Z`),
          $lte: new Date(`${extracted.date}T23:59:59.999Z`),
        },
      }).select('_id receiptNumber').lean();

      if (suspectPayment) {
        return {
          isDuplicate: true,
          duplicateType: 'COMPOSITE_SUSPECT',
          matchedPaymentId: suspectPayment._id as any,
          details: 'একই তারিখ ও পরিমাণের একটি পেমেন্ট ইতিমধ্যে বিদ্যমান।',
        };
      }
    }

    // 4. Monthly payment duplication check
    const effectiveMemberId = memberId || null;
    const effectiveDate = paymentDate || extracted.date;
    if (effectiveMemberId && effectiveDate) {
      const monthCheck = await this.checkMonthDuplicate(
        receiptId,
        effectiveMemberId,
        effectiveDate
      );
      if (monthCheck && monthCheck.isDuplicate) {
        return monthCheck;
      }
    }

    return {
      isDuplicate: false,
      duplicateType: 'NONE',
    };
  }
}
