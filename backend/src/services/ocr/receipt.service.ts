import crypto from 'crypto';
import { Types } from 'mongoose';
import { PaymentReceipt, PaymentReceiptDocument } from '../../models/PaymentReceipt.js';
import { AuditLog } from '../../models/AuditLog.js';
import { CustodyAccount } from '../../models/CustodyAccount.js';
import {
  ReceiptGateway,
  ReceiptStatus,
  ReviewedReceiptData,
} from '../../types/receipt.js';
import { IUser, PaymentMethod } from '../../types/models.js';
import { ReceiptStorageService } from './storage/receipt-storage.service.js';
import { ReceiptExtractionEngine } from './providers/default-ocr.provider.js';
import { ReceiptMatchingService } from './receipt-matching.service.js';
import { PaymentService } from '../payment.service.js';
import { createError } from '../../middlewares/error.js';
import { logger } from '../../utils/logger.js';

export class ReceiptService {
  /**
   * Uploads receipt file, saves to private storage, extracts OCR data,
   * runs candidate matching and duplicate detection.
   */
  static async uploadReceipt(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    uploadedBy: Types.ObjectId,
    batchId?: string
  ): Promise<PaymentReceiptDocument> {
    const receiptId = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // 1. Save to private filesystem storage
    const storageResult = await ReceiptStorageService.putBuffer(
      buffer,
      originalFilename,
      mimeType
    );

    // 2. Extract OCR data
    const extracted = await ReceiptExtractionEngine.extract(buffer, mimeType);

    // Determine gateway from text
    let gateway = ReceiptGateway.UNKNOWN;
    if (extracted.rawText.toLowerCase().includes('bkash') || extracted.rawText.includes('বিকাশ')) {
      gateway = ReceiptGateway.BKASH;
    } else if (extracted.rawText.toLowerCase().includes('nagad') || extracted.rawText.includes('নগদ')) {
      gateway = ReceiptGateway.NAGAD;
    } else if (extracted.rawText.toLowerCase().includes('bank') || extracted.rawText.includes('ব্যাংক')) {
      gateway = ReceiptGateway.BANK;
    }

    // 3. Match Member and Custody Account
    const memberMatch = await ReceiptMatchingService.matchMember(extracted);
    const custodyMatch = await ReceiptMatchingService.matchCustodyAccount(extracted, gateway);

    // 4. Duplicate Check
    const duplicateCheck = await ReceiptMatchingService.detectDuplicates(
      receiptId,
      storageResult.sha256,
      extracted,
      gateway
    );

    // 5. Determine Initial Review Status
    let initialStatus = ReceiptStatus.NEEDS_REVIEW;
    if (duplicateCheck.isDuplicate) {
      initialStatus = ReceiptStatus.DUPLICATE_SUSPECTED;
    } else if (memberMatch.selectedMemberId && custodyMatch.selectedCustodyAccountId && extracted.amount) {
      initialStatus = ReceiptStatus.READY_TO_POST;
    }

    // Pre-populate reviewedData with candidates
    const defaultMethod = gateway === ReceiptGateway.BKASH
      ? PaymentMethod.BKASH
      : gateway === ReceiptGateway.NAGAD
      ? PaymentMethod.NAGAD
      : gateway === ReceiptGateway.BANK
      ? PaymentMethod.BANK_TRANSFER
      : PaymentMethod.CASH;

    const receipt = await PaymentReceipt.create({
      receiptId,
      batchId: batchId || null,
      uploadedBy,
      uploadedAt: new Date(),
      originalFilename,
      storageKey: storageResult.storageKey,
      mimeType,
      byteSize: storageResult.byteSize,
      sha256: storageResult.sha256,
      gateway,
      status: initialStatus,
      extractedData: extracted,
      reviewedData: {
        memberId: memberMatch.selectedMemberId,
        custodyAccountId: custodyMatch.selectedCustodyAccountId,
        amount: extracted.amount || undefined,
        paymentDate: extracted.date ? new Date(extracted.date) : new Date(),
        paymentMethod: defaultMethod,
        cashoutChargePaid: 0,
        transactionReference: extracted.transactionId || '',
        notes: extracted.reference ? `Ref: ${extracted.reference}` : '',
      },
      memberMatch,
      custodyMatch,
      duplicateCheck,
      corrections: [],
    });

    // Audit log
    await AuditLog.create({
      performedBy: uploadedBy,
      action: 'RECEIPT_UPLOADED',
      entityName: 'PaymentReceipt',
      entityId: receipt._id,
      afterState: {
        receiptId,
        status: initialStatus,
        gateway,
        amount: extracted.amount,
        isDuplicate: duplicateCheck.isDuplicate,
      },
      reason: `Uploaded receipt image for OCR review (${originalFilename})`,
    });

    logger.info(`Receipt uploaded and processed: ${receiptId} [Status: ${initialStatus}]`, {
      component: 'ReceiptService',
      receiptId,
      gateway,
    });

    return receipt;
  }

  /**
   * Retrieves a receipt document by receiptId with populated references.
   */
  static async getReceiptById(receiptId: string): Promise<PaymentReceiptDocument | null> {
    return PaymentReceipt.findOne({ receiptId })
      .populate('uploadedBy', 'name email role')
      .populate('reviewedBy', 'name email role')
      .populate('reviewedData.memberId', 'memberId name phone totalShares')
      .populate('reviewedData.custodyAccountId', 'name channel accountNumber cachedBalance')
      .populate('memberMatch.selectedMemberId', 'memberId name phone')
      .populate('custodyMatch.selectedCustodyAccountId', 'name channel accountNumber');
  }

  /**
   * Lists receipts with filtering and pagination.
   */
  static async listReceipts(filter: {
    status?: ReceiptStatus;
    gateway?: ReceiptGateway;
    limit?: number;
    skip?: number;
  } = {}): Promise<{ receipts: PaymentReceiptDocument[]; total: number }> {
    const query: Record<string, any> = {};
    if (filter.status) query.status = filter.status;
    if (filter.gateway) query.gateway = filter.gateway;

    const limit = Math.min(filter.limit ?? 20, 100);
    const skip = filter.skip ?? 0;

    const [receipts, total] = await Promise.all([
      PaymentReceipt.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('reviewedData.memberId', 'memberId name phone')
        .populate('reviewedData.custodyAccountId', 'name channel')
        .populate('uploadedBy', 'name email'),
      PaymentReceipt.countDocuments(query),
    ]);

    return { receipts, total };
  }

  /**
   * Review and edit working fields of a receipt before posting.
   */
  static async reviewReceipt(
    receiptId: string,
    reviewData: ReviewedReceiptData,
    actor: IUser | Types.ObjectId
  ): Promise<PaymentReceiptDocument> {
    const receipt = await PaymentReceipt.findOne({ receiptId });
    if (!receipt) {
      throw createError(`Receipt not found: ${receiptId}`, 404);
    }

    if (receipt.status === ReceiptStatus.POSTED) {
      throw createError('Cannot edit a receipt that has already been posted.', 400);
    }

    const actorId = (actor as any)._id || actor;

    // Track corrections
    const corrections: any[] = [];
    const fields: Array<keyof ReviewedReceiptData> = [
      'memberId',
      'custodyAccountId',
      'amount',
      'paymentDate',
      'paymentMethod',
      'cashoutChargePaid',
      'transactionReference',
      'notes',
    ];

    for (const f of fields) {
      if (reviewData[f] !== undefined && String(reviewData[f]) !== String(receipt.reviewedData[f])) {
        corrections.push({
          field: String(f),
          oldValue: receipt.reviewedData[f],
          newValue: reviewData[f],
          changedBy: actorId,
          changedAt: new Date(),
        });
      }
    }

    receipt.reviewedData = {
      ...receipt.reviewedData,
      ...reviewData,
    };
    receipt.reviewedBy = actorId;
    receipt.reviewedAt = new Date();
    receipt.corrections.push(...corrections);

    // If duplicate was overridden or fields are now complete, update status
    if (receipt.duplicateCheck.isDuplicate && !receipt.duplicateCheck.overrideReason) {
      receipt.status = ReceiptStatus.DUPLICATE_SUSPECTED;
    } else if (receipt.reviewedData.memberId && receipt.reviewedData.custodyAccountId && receipt.reviewedData.amount) {
      receipt.status = ReceiptStatus.READY_TO_POST;
    } else {
      receipt.status = ReceiptStatus.NEEDS_REVIEW;
    }

    await receipt.save();

    await AuditLog.create({
      performedBy: actorId,
      action: 'RECEIPT_REVIEWED',
      entityName: 'PaymentReceipt',
      entityId: receipt._id,
      afterState: { receiptId, status: receipt.status, correctionsCount: corrections.length },
      reason: `Accountant reviewed/updated receipt parameters (${receiptId})`,
    });

    return receipt;
  }

  /**
   * Generates a preview of how the reviewed receipt amount will be allocated.
   */
  static async calculateReceiptAllocationPreview(receiptId: string) {
    const receipt = await PaymentReceipt.findOne({ receiptId });
    if (!receipt) {
      throw createError(`Receipt not found: ${receiptId}`, 404);
    }

    const { memberId, custodyAccountId, amount, paymentDate, paymentMethod, cashoutChargePaid } = receipt.reviewedData;

    if (!memberId) {
      throw createError('Please select a member before calculating allocation preview.', 400);
    }
    if (!amount || amount <= 0) {
      throw createError('Valid payment amount is required for allocation preview.', 400);
    }

    return PaymentService.calculatePaymentPreview({
      memberId: String(memberId),
      paymentDate: paymentDate || new Date(),
      totalAmount: amount,
      paymentMethod: (paymentMethod as PaymentMethod) || PaymentMethod.CASH,
      custodyAccountId: custodyAccountId ? String(custodyAccountId) : undefined,
      cashoutChargePaid: cashoutChargePaid || 0,
    });
  }

  /**
   * Overrides a duplicate warning with a documented reason.
   */
  static async overrideDuplicate(
    receiptId: string,
    reason: string,
    actor: IUser
  ): Promise<PaymentReceiptDocument> {
    const receipt = await PaymentReceipt.findOne({ receiptId });
    if (!receipt) {
      throw createError(`Receipt not found: ${receiptId}`, 404);
    }

    if (!reason || reason.trim().length < 5) {
      throw createError('A detailed reason is required to override a suspected duplicate.', 400);
    }

    const actorId = (actor as any)._id;

    receipt.duplicateCheck.overrideReason = reason.trim();
    receipt.duplicateCheck.overriddenBy = actorId;
    receipt.duplicateCheck.overriddenAt = new Date();

    if (receipt.reviewedData.memberId && receipt.reviewedData.custodyAccountId && receipt.reviewedData.amount) {
      receipt.status = ReceiptStatus.READY_TO_POST;
    } else {
      receipt.status = ReceiptStatus.NEEDS_REVIEW;
    }

    await receipt.save();

    await AuditLog.create({
      performedBy: actorId,
      action: 'RECEIPT_DUPLICATE_OVERRIDDEN',
      entityName: 'PaymentReceipt',
      entityId: receipt._id,
      afterState: { receiptId, overrideReason: reason },
      reason: `Accountant authorized duplicate override: ${reason}`,
    });

    return receipt;
  }

  /**
   * Posts payment to the financial ledger using PaymentService.recordPayment.
   */
  static async postPaymentFromReceipt(
    receiptId: string,
    actor: IUser
  ): Promise<{ receipt: PaymentReceiptDocument; payment: any; allocations?: any[] }> {
    const receipt = await PaymentReceipt.findOne({ receiptId });
    if (!receipt) {
      throw createError(`Receipt not found: ${receiptId}`, 404);
    }

    if (receipt.status === ReceiptStatus.POSTED) {
      throw createError('This receipt has already been posted to the financial ledger.', 409);
    }

    if (receipt.duplicateCheck.isDuplicate && !receipt.duplicateCheck.overrideReason) {
      throw createError('Cannot post a suspected duplicate without an authorized override reason.', 400);
    }

    const {
      memberId,
      custodyAccountId,
      amount,
      paymentDate,
      paymentMethod,
      cashoutChargePaid,
      transactionReference,
      notes,
    } = receipt.reviewedData;

    if (!memberId) throw createError('Member must be confirmed before posting.', 400);
    if (!custodyAccountId) throw createError('Custody account must be confirmed before posting.', 400);
    if (!amount || amount <= 0) throw createError('Valid payment amount required.', 400);

    const custodyAccount = await CustodyAccount.findById(custodyAccountId);
    if (!custodyAccount) throw createError('Custody account not found', 404);

    // Call authoritative PaymentService.recordPayment
    const paymentResult = await PaymentService.recordPayment(
      {
        memberId: String(memberId),
        receiverId: String((actor as any)._id),
        custodyAccountId: String(custodyAccountId),
        paymentDate: paymentDate || new Date(),
        totalAmount: amount,
        paymentMethod: (paymentMethod as PaymentMethod) || PaymentMethod.CASH,
        cashoutChargePaid: cashoutChargePaid || 0,
        transactionReference: transactionReference || undefined,
        notes: notes ? `${notes} (OCR Receipt: ${receipt.receiptId})` : `OCR Receipt: ${receipt.receiptId}`,
      },
      actor
    );

    const payment = paymentResult.payment;

    // Link payment and set status to POSTED
    receipt.paymentId = payment._id;
    receipt.status = ReceiptStatus.POSTED;
    await receipt.save();

    await AuditLog.create({
      performedBy: (actor as any)._id,
      action: 'RECEIPT_POSTED',
      entityName: 'PaymentReceipt',
      entityId: receipt._id,
      afterState: { receiptId, paymentId: payment._id, amount },
      reason: `Receipt ${receiptId} posted to financial ledger with Payment ID ${payment._id}`,
    });

    return { receipt, payment, allocations: paymentResult.allocations };
  }

  /**
   * Protected stream retrieval for authorized staff.
   */
  static async getReceiptFileStream(receiptId: string) {
    const receipt = await PaymentReceipt.findOne({ receiptId });
    if (!receipt) {
      throw createError(`Receipt not found: ${receiptId}`, 404);
    }

    return ReceiptStorageService.getReadStream(receipt.storageKey);
  }

  /**
   * Permanently removes an OCR draft and its source file before ledger posting.
   * Posted receipts and anything already linked to a payment are immutable evidence.
   */
  static async removeReceipt(receiptId: string, actor: IUser): Promise<void> {
    const receipt = await PaymentReceipt.findOne({ receiptId });
    if (!receipt) {
      throw createError(`Receipt not found: ${receiptId}`, 404);
    }

    if (receipt.status === ReceiptStatus.POSTED || receipt.paymentId) {
      throw createError('Posted receipts cannot be removed because they are financial evidence.', 409);
    }

    try {
      await ReceiptStorageService.delete(receipt.storageKey);
    } catch (error) {
      logger.error(`Failed to remove receipt source file: ${receiptId}`, {
        component: 'ReceiptService',
        receiptId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw createError('Unable to remove the stored receipt image. The draft was not deleted.', 500);
    }

    await PaymentReceipt.deleteOne({ _id: receipt._id });

    await AuditLog.create({
      performedBy: (actor as any)._id,
      action: 'RECEIPT_REMOVED',
      entityName: 'PaymentReceipt',
      entityId: receipt._id,
      beforeState: {
        receiptId,
        originalFilename: receipt.originalFilename,
        storageKey: receipt.storageKey,
        status: receipt.status,
      },
      reason: `Removed unposted OCR receipt and its source file (${receiptId})`,
    });

    logger.info(`Unposted receipt removed: ${receiptId}`, {
      component: 'ReceiptService',
      receiptId,
    });
  }
}
