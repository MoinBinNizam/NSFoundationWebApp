import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { AnnualClosing, Expense, InvestmentProject, InvestmentReturn, Member, Payment, MonthlyLedger, ShareHistory, PaymentReceipt } from '../models/index.js';
import { UserRole } from '../types/models.js';
import { ReceiptGateway, ReceiptStatus } from '../types/receipt.js';
import { createError } from '../middlewares/error.js';
import { getMemberTransparencySettings } from '../services/settings.service.js';
import { ReceiptStorageService } from '../services/ocr/storage/receipt-storage.service.js';

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
 * Member Self-Service: Submit offline deposit proof (bKash/Nagad/Bank/Cash) with TrxID.
 * Enters the Accountant's review queue for verification.
 */
export async function submitDepositRequest(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.memberId) return next(createError('A linked member profile is required.', 403));
    const member = await Member.findById(req.user.memberId);
    if (!member) return next(createError('Member profile not found.', 404));

    const { amount, paymentMethod, transactionReference, paymentDate, notes } = req.body;
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return next(createError('A valid payment amount greater than 0 is required.', 400));
    }
    if (!transactionReference || String(transactionReference).trim().length < 3) {
      return next(createError('Transaction Reference (TrxID / Bank Slip Ref) is required.', 400));
    }

    const receiptId = `MEMBER_DEP_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const rawContent = `Member Self-Service Deposit: ${member.name} (${member.memberId})\nMethod: ${paymentMethod || 'BKASH'}\nTrxID: ${transactionReference}\nAmount: ৳${parsedAmount}\nDate: ${paymentDate || new Date().toISOString().split('T')[0]}\nNotes: ${notes || 'N/A'}`;
    const buffer = Buffer.from(rawContent, 'utf8');
    const storageResult = await ReceiptStorageService.putBuffer(
      buffer,
      `deposit-${member.memberId}-${receiptId}.txt`,
      'text/plain'
    );

    const receipt = await PaymentReceipt.create({
      receiptId,
      originalFilename: `deposit-${member.memberId}-${receiptId}.txt`,
      storageKey: storageResult.storageKey,
      fileSize: storageResult.byteSize,
      byteSize: storageResult.byteSize,
      mimeType: 'text/plain',
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
        reference: notes ? String(notes).trim() : null,
        rawText: rawContent,
        confidence: 1.0,
        provider: 'MEMBER_SELF_SERVICE',
      },
      reviewedData: {
        memberId: member._id,
        amount: parsedAmount,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        paymentMethod: paymentMethod || 'BKASH',
        transactionReference: String(transactionReference).trim(),
        notes: `Member Self-Service Submission: ${notes || ''}`.trim(),
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
        transactionReference: String(transactionReference).trim(),
      },
    });
  } catch (error) {
    next(error);
  }
}

