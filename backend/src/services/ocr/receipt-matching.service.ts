import { Types } from 'mongoose';
import { Member } from '../../models/Member.js';
import { CustodyAccount } from '../../models/CustodyAccount.js';
import { Payment } from '../../models/Payment.js';
import { PaymentReceipt } from '../../models/PaymentReceipt.js';
import {
  ExtractedReceiptData,
  MemberMatchResult,
  CustodyMatchResult,
  DuplicateCheckResult,
  ReceiptGateway,
} from '../../types/receipt.js';
import { CustodyChannel } from '../../types/models.js';

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
   * Detects duplicate receipts or payments using SHA-256, Transaction ID, and composite factors.
   */
  static async detectDuplicates(
    receiptId: string,
    sha256: string,
    extracted: ExtractedReceiptData,
    _gateway: ReceiptGateway
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
        };
      }
    }

    return {
      isDuplicate: false,
      duplicateType: 'NONE',
    };
  }
}
