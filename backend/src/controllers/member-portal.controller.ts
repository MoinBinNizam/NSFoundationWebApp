import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { AnnualClosing, Expense, InvestmentProject, InvestmentReturn, Member, Payment, MonthlyLedger, ShareHistory, PaymentReceipt } from '../models/index.js';
import { UserRole } from '../types/models.js';
import { ReceiptGateway, ReceiptStatus } from '../types/receipt.js';
import { createError } from '../middlewares/error.js';
import { getMemberTransparencySettings } from '../services/settings.service.js';
import { ReceiptStorageService } from '../services/ocr/storage/receipt-storage.service.js';
import { PaymentService } from '../services/payment.service.js';

export async function getMyPortal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('This account is not linked to a member profile.', 403));
    const member = await Member.findById(req.user.memberId).lean();
    if (!member) return next(createError('Linked member profile was not found.', 404));
    const [share, payments, ledgers] = await Promise.all([
      ShareHistory.findOne({ memberId: member._id }).sort({ effectiveMonth: -1, createdAt: -1 }).lean(),
      Payment.find({ memberId: member._id }).select('receiptNumber paymentDate totalAmount principalAmount penaltyAmount advanceAmount cashoutCharge paymentMethod status').sort({ paymentDate: -1 }).limit(50).lean(),
      MonthlyLedger.find({ memberId: member._id }).sort({ month: -1 }).limit(24).lean(),
    ]);
    const nonCancelledPayments = payments.filter((p) => p.status !== 'CANCELLED');
    const totalPayments = nonCancelledPayments.reduce((sum, p) => sum + Number(p.totalAmount || 0), 0);
    const totalPenaltyPaid = ledgers.reduce((sum, l) => sum + Number(l.penaltyPaid || 0), 0);
    const totalPenaltyDue = ledgers.reduce((sum, l) => sum + Math.max(0, Number(l.penaltyDue || 0) - Number(l.penaltyPaid || 0) - Number(l.penaltyWaived || 0)), 0);
    const totalPrincipalDue = ledgers.reduce((sum, l) => sum + Math.max(0, Number(l.principalDue || 0) - Number(l.principalPaid || 0)), 0);
    const totalDues = totalPrincipalDue + totalPenaltyDue + Number(member.cashoutDue || 0);
    const advance = ledgers.reduce((sum, item) => sum + Number(item.excessAdvance || 0), 0);

    res.json({
      success: true,
      data: {
        member,
        currentShares: share?.shareCount || 1,
        due: totalDues,
        advance,
        payments,
        ledgers,
        summary: {
          totalPayments,
          totalDues,
          totalPenaltyPaid,
          totalPenaltyDue,
          totalPrincipalDue,
        },
      },
    });
  } catch (error) { next(error); }
}

/**
 * Member-safe organization overview. This deliberately omits custody accounts,
 * individual member data, funding sources, and audit-log details.
 */
export async function getOrganizationTransparency(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
    const disclosure = await getMemberTransparencySettings();
    const result: Record<string, unknown> = { disclosure };
    const [collections, expenses, returns, projects, annualClosings] = await Promise.all([
      disclosure.showCollections ? Payment.aggregate([{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]) : [],
      disclosure.showExpenses ? Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]) : [],
      disclosure.showRealizedProfit ? InvestmentReturn.aggregate([{ $group: { _id: null, profit: { $sum: '$actualProfit' }, loss: { $sum: '$actualLoss' } } }]) : [],
      disclosure.showInvestmentProjects || disclosure.showExpectedProfit ? InvestmentProject.find({ status: { $in: ['ACTIVE', 'MATURED'] } }).select('projectId name category status startDate maturityDate totalFunded expectedROI').sort({ startDate: -1 }).lean() : [],
      disclosure.allowAnnualProfitLossDownload ? AnnualClosing.find({ status: 'LOCKED' }).select('year').sort({ year: -1 }).lean() : [],
    ]);
    if (disclosure.showCollections) result.collections = Number(collections[0]?.total || 0);
    if (disclosure.showExpenses) result.expenses = Number(expenses[0]?.total || 0);
    if (disclosure.showRealizedProfit) {
      const realizedProfit = Number(returns[0]?.profit || 0);
      const realizedLoss = Number(returns[0]?.loss || 0);
      result.realizedProfit = realizedProfit;
      result.realizedLoss = realizedLoss;
      result.netRealizedProfit = realizedProfit - realizedLoss;
    }
    const safeProjects = projects.map((project) => ({
      projectId: project.projectId,
      name: project.name,
      category: project.category || 'General',
      status: project.status,
      startDate: project.startDate,
      maturityDate: project.maturityDate || null,
      totalFunded: project.totalFunded,
      expectedROI: project.expectedROI ?? null,
    }));
    if (disclosure.showInvestmentProjects) result.projects = safeProjects;
    if (disclosure.showExpectedProfit) {
      result.expectedProfit = safeProjects.filter((project) => project.status === 'ACTIVE').reduce((sum, project) => sum + Number(project.totalFunded || 0) * Number(project.expectedROI || 0) / 100, 0);
    }
    if (disclosure.allowAnnualProfitLossDownload) result.availableAnnualReportYears = annualClosings.map((closing) => closing.year);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export function requireOwnMember(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
  if (req.user.role === UserRole.MEMBER && String(req.user.memberId) !== req.params.memberId) return next(createError('Members may access only their own records.', 403));
  next();
}

/**
 * Member Self-Service: Submit offline deposit proof (bKash/Nagad/Bank/Cash) with TrxID,
 * target month(s), and real receipt slip file/image upload.
 * Enters the Accountant's review queue for verification.
 */
export async function submitDepositRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
    const member = await Member.findById(req.user.memberId);
    if (!member) return next(createError('Member profile not found.', 404));

    const { amount, paymentMethod, transactionReference, paymentDate, targetMonth, notes, slipFile } = req.body;
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return next(createError('A valid payment amount greater than 0 is required.', 400));
    }
    if (!transactionReference || String(transactionReference).trim().length < 3) {
      return next(createError('Transaction Reference (TrxID / Bank Slip Ref) is required.', 400));
    }

    const receiptId = `MEMBER_DEP_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    let buffer: Buffer;
    let mimeType = 'text/plain';
    let originalFilename = `deposit-${member.memberId}-${receiptId}.txt`;

    if (slipFile && (slipFile.base64 || typeof slipFile === 'string')) {
      const rawString: string = typeof slipFile === 'string' ? slipFile : slipFile.base64;
      const matches = rawString.match(/^data:([A-Za-z0-9/+-]+);base64,(.+)$/);
      let base64Payload = rawString;
      if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Payload = matches[2];
      } else if (slipFile.type) {
        mimeType = slipFile.type;
      }

      buffer = Buffer.from(base64Payload, 'base64');
      if (buffer.length > 15 * 1024 * 1024) {
        return next(createError('Slip file size exceeds 15MB limit.', 400));
      }

      let ext = '.png';
      if (mimeType.includes('pdf')) ext = '.pdf';
      else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
      else if (mimeType.includes('webp')) ext = '.webp';

      originalFilename = slipFile.name || `slip-${member.memberId}-${receiptId}${ext}`;
    } else {
      const rawContent = `Member Self-Service Deposit: ${member.name} (${member.memberId})\nTarget Month: ${targetMonth || 'N/A'}\nMethod: ${paymentMethod || 'BKASH'}\nTrxID: ${transactionReference}\nAmount: ৳${parsedAmount}\nDate: ${paymentDate || new Date().toISOString().split('T')[0]}\nNotes: ${notes || 'N/A'}`;
      buffer = Buffer.from(rawContent, 'utf8');
    }

    const storageResult = await ReceiptStorageService.putBuffer(buffer, originalFilename, mimeType);

    const formattedNotes = [
      targetMonth ? `[মাস/Target: ${targetMonth}]` : '',
      notes ? String(notes).trim() : '',
    ].filter(Boolean).join(' ');

    const receipt = await PaymentReceipt.create({
      receiptId,
      originalFilename,
      storageKey: storageResult.storageKey,
      fileSize: storageResult.byteSize,
      byteSize: storageResult.byteSize,
      mimeType: storageResult.mimeType || mimeType,
      sha256: storageResult.sha256,
      gateway:
        paymentMethod === 'BKASH'
          ? ReceiptGateway.BKASH
          : paymentMethod === 'NAGAD'
          ? ReceiptGateway.NAGAD
          : paymentMethod === 'BANK_TRANSFER'
          ? ReceiptGateway.BANK
          : ReceiptGateway.UNKNOWN,
      status: ReceiptStatus.NEEDS_REVIEW,
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
      extractedData: {
        memberIdentifier: member.memberId,
        memberName: member.name,
        senderPhone: member.phone,
        amount: parsedAmount,
        transactionId: String(transactionReference).trim(),
        date: paymentDate || new Date().toISOString().split('T')[0],
        reference: targetMonth ? `Target Month: ${targetMonth}` : (notes ? String(notes).trim() : null),
        rawText: `Member Self-Service Submission for ${targetMonth || 'Monthly Due'}`,
        confidence: 1.0,
        provider: 'MEMBER_SELF_SERVICE',
      },
      reviewedData: {
        memberId: member._id,
        amount: parsedAmount,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        paymentMethod: paymentMethod || 'BKASH',
        transactionReference: String(transactionReference).trim(),
        notes: formattedNotes || `Member Deposit: ${member.name}`,
      },
      memberMatch: {
        selectedMemberId: member._id,
        confidence: 1.0,
        strategy: 'EXACT_ID',
        candidates: [{ memberId: member._id, name: member.name, phone: member.phone, score: 100 }],
      },
    });

    res.status(201).json({
      success: true,
      message: 'Deposit request submitted successfully. It is now awaiting accountant verification.',
      data: {
        receiptId: receipt.receiptId,
        status: receipt.status,
        amount: parsedAmount,
        targetMonth: targetMonth || null,
        transactionReference: String(transactionReference).trim(),
        originalFilename,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Member Self-Service: Get list of all submitted deposit receipts and their live review status.
 */
export async function getMyDeposits(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
    const member = await Member.findById(req.user.memberId).lean();
    if (!member) return next(createError('Member profile not found.', 404));

    const receipts = await PaymentReceipt.find({
      $or: [
        { uploadedBy: req.user._id },
        { 'memberMatch.selectedMemberId': member._id },
      ],
    })
      .sort({ uploadedAt: -1 })
      .limit(100)
      .lean();

    const formatted = receipts.map((r) => {
      // Extract target month if stored in notes or reference
      const notes = r.reviewedData?.notes || r.extractedData?.reference || '';
      const targetMatch = notes.match(/\[(?:মাস\/Target|Target Month):\s*([^\]]+)\]/i);
      const targetMonth = targetMatch ? targetMatch[1].trim() : null;

      return {
        _id: r._id,
        receiptId: r.receiptId,
        uploadedAt: r.uploadedAt,
        status: r.status,
        amount: r.reviewedData?.amount ?? r.extractedData?.amount ?? 0,
        paymentMethod: r.reviewedData?.paymentMethod || r.gateway || 'UNKNOWN',
        transactionReference: r.reviewedData?.transactionReference || r.extractedData?.transactionId || '',
        paymentDate: r.reviewedData?.paymentDate || r.extractedData?.date || r.uploadedAt,
        targetMonth,
        notes,
        originalFilename: r.originalFilename,
        hasSlip: r.mimeType ? !r.mimeType.includes('text/plain') : false,
        mimeType: r.mimeType,
        paymentId: r.paymentId || null,
        reviewedAt: r.reviewedAt || null,
      };
    });

    res.json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Member Self-Service: Stream member's own uploaded deposit slip image/file securely.
 * Enforces strict anti-IDOR check so members cannot access others' private slips.
 */
export async function getMyDepositSlip(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
    const receipt = await PaymentReceipt.findOne({ receiptId: req.params.receiptId });
    if (!receipt) return next(createError('Receipt document not found.', 404));

    // Anti-IDOR: Must be either the uploader or the matched member
    const isOwner =
      (receipt.uploadedBy && receipt.uploadedBy.toString() === req.user._id.toString()) ||
      (receipt.memberMatch?.selectedMemberId && receipt.memberMatch.selectedMemberId.toString() === req.user.memberId.toString());

    if (!isOwner) {
      return next(createError('Access denied: You can only view your own deposit slips.', 403));
    }

    const { stream, fullPath } = await ReceiptStorageService.getReadStream(receipt.storageKey);

    if (fullPath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (fullPath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    } else if (fullPath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else {
      res.setHeader('Content-Type', receipt.mimeType || 'application/octet-stream');
    }

    res.setHeader('Content-Disposition', `inline; filename="${receipt.originalFilename || 'slip.png'}"`);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * Member Self-Service: Get official payment receipt data with allocations.
 * Enforces anti-IDOR so members can only retrieve their own payment receipts.
 */
export async function getMyPaymentReceipt(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
    const { paymentId } = req.params;
    const details = await PaymentService.getPaymentDetails(paymentId);

    const paymentMemberId = details.payment?.memberId?._id
      ? details.payment.memberId._id.toString()
      : (details.payment?.memberId as any)?.toString();

    if (paymentMemberId !== req.user.memberId.toString()) {
      return next(createError('Access denied: You can only view your own payment receipts.', 403));
    }

    res.json({
      success: true,
      data: details,
    });
  } catch (error) {
    next(error);
  }
}


