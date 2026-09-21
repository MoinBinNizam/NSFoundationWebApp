import { Types } from 'mongoose';
import {
  DistributionBatch,
  MemberDistribution,
  Member,
  MemberYearAccount,
  ShareHistory,
  CustodyAccount,
  CustodyMovement,
  InvestmentReturn,
  Expense,
  AuditLog,
} from '../models/index.js';
import {
  IUser,
  UserRole,
  DistributionBatchStatus,
  DistributionBasis,
  MovementType,
  MovementSourceType,
} from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { CustodyService } from './custody.service.js';

interface PreviewOptions {
  year: number;
  title?: string;
  basis?: DistributionBasis;
  customProfitAmount?: number;
  retainedAmount?: number;
  includePrincipal?: boolean;
}

export class DistributionService {
  /**
   * Generates a read-only distribution preview with penny-perfect reconciliation.
   */
  static async calculatePreview(options: PreviewOptions) {
    const year = Number(options.year);
    if (!year || isNaN(year) || year < 2020) {
      throw createError('A valid accounting year (>= 2020) is required.', 400);
    }

    const basis = options.basis || DistributionBasis.FINALIZED_SHARES;
    const retainedAmount = Math.max(0, Number(options.retainedAmount) || 0);

    // 1. Gather authoritative member share counts
    let memberAccounts: Array<{
      memberId: Types.ObjectId;
      memberCode: string;
      memberName: string;
      finalShares: number;
      shortfall: number;
      excessAdvance: number;
    }> = [];

    const yearAccounts = await MemberYearAccount.find({ year })
      .populate('memberId', 'memberId name status totalShares')
      .lean();

    if (yearAccounts && yearAccounts.length > 0) {
      memberAccounts = yearAccounts
        .filter((ya: any) => ya.memberId && ya.memberId.status !== 'DROPPED')
        .map((ya: any) => ({
          memberId: ya.memberId._id,
          memberCode: ya.memberId.memberId || 'N/A',
          memberName: ya.memberId.name || 'Unknown Member',
          finalShares: Math.max(1, ya.finalShares || 1),
          shortfall: ya.shortfall || 0,
          excessAdvance: ya.excessAdvance || 0,
        }));
    } else {
      // Fallback to active registered members with ShareHistory lookup
      const activeMembers = await Member.find({ status: 'ACTIVE' }).lean();
      for (const m of activeMembers) {
        const latestShare = await ShareHistory.findOne({
          memberId: m._id,
          effectiveMonth: { $lte: `${year}-12` },
        })
          .sort({ effectiveMonth: -1, createdAt: -1 })
          .lean();

        const shareCount =
          latestShare?.shareCount ??
          (await ShareHistory.findOne({ memberId: m._id }).sort({ createdAt: -1 }).lean())
            ?.shareCount ??
          1;

        memberAccounts.push({
          memberId: m._id as any,
          memberCode: m.memberId,
          memberName: m.name,
          finalShares: Math.max(1, shareCount),
          shortfall: 0,
          excessAdvance: 0,
        });
      }
    }

    const totalShares = memberAccounts.reduce((sum, m) => sum + m.finalShares, 0);
    if (totalShares <= 0) {
      throw createError(`No eligible member shares found for year ${year}.`, 400);
    }

    // 2. Aggregate Source of Funds for the year
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    // Net Realized Profits from Investments
    let netRealizedProfit = 0;
    if (options.customProfitAmount !== undefined && !isNaN(options.customProfitAmount)) {
      netRealizedProfit = Number(options.customProfitAmount);
    } else {
      const returns = await InvestmentReturn.find({
        returnDate: { $gte: startOfYear, $lte: endOfYear },
      }).lean();
      netRealizedProfit = returns.reduce(
        (sum, r) => sum + (r.actualProfit || 0) - (r.actualLoss || 0),
        0
      );
    }

    // Operating expenses for the year
    const expenses = await Expense.find({
      date: { $gte: startOfYear, $lte: endOfYear },
    }).lean();
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Calculate Distributable Pool
    const totalPool = Math.max(0, netRealizedProfit);
    const distributableAmount = Math.max(0, Math.round((totalPool - retainedAmount) * 100) / 100);

    if (distributableAmount <= 0) {
      throw createError(
        `Calculated distributable amount is zero or negative (Total Pool: ৳${totalPool}, Retained: ৳${retainedAmount}).`,
        400
      );
    }

    const amountPerShare = Math.round((distributableAmount / totalShares) * 10000) / 10000;

    // 3. Calculate member line items
    let allocations = memberAccounts.map((m) => {
      const shareRatio = m.finalShares / totalShares;
      const gross = Math.round(distributableAmount * shareRatio * 100) / 100;
      const net = Math.max(0, Math.round((gross - m.shortfall + m.excessAdvance) * 100) / 100);

      return {
        memberId: m.memberId,
        memberCode: m.memberCode,
        memberName: m.memberName,
        year,
        finalShares: m.finalShares,
        shareRatio: Math.round(shareRatio * 10000) / 10000,
        grossEntitlement: gross,
        shortfallDeduction: m.shortfall,
        advanceCredit: m.excessAdvance,
        penaltyAdjustment: 0,
        netDistributionAmount: net,
        status: 'PENDING' as const,
      };
    });

    // 4. Exact Penny Reconciliation (avoid fractional paisa leakage)
    const grossSum = allocations.reduce((sum, a) => sum + a.grossEntitlement, 0);
    const diff = Math.round((distributableAmount - grossSum) * 100) / 100;

    if (diff !== 0 && allocations.length > 0) {
      // Apply residual diff to the member with the highest shares
      allocations.sort((a, b) => b.finalShares - a.finalShares);
      allocations[0].grossEntitlement =
        Math.round((allocations[0].grossEntitlement + diff) * 100) / 100;
      allocations[0].netDistributionAmount = Math.max(
        0,
        Math.round(
          (allocations[0].grossEntitlement -
            allocations[0].shortfallDeduction +
            allocations[0].advanceCredit) *
            100
        ) / 100
      );
    }

    // Sort alphabetically by member code
    allocations.sort((a, b) => a.memberCode.localeCompare(b.memberCode));

    return {
      year,
      basis,
      totalPool,
      totalPrincipalReturned: 0,
      netRealizedProfit,
      totalExpenses,
      retainedAmount,
      distributableAmount,
      totalShares,
      amountPerShare,
      memberCount: allocations.length,
      allocations,
    };
  }

  /**
   * Creates an immutable distribution batch in DRAFT status.
   */
  static async createBatch(
    data: {
      year: number;
      title: string;
      basis?: DistributionBasis;
      customProfitAmount?: number;
      retainedAmount?: number;
      notes?: string;
    },
    user: IUser
  ) {
    const preview = await this.calculatePreview({
      year: data.year,
      basis: data.basis,
      customProfitAmount: data.customProfitAmount,
      retainedAmount: data.retainedAmount,
    });

    // Check if an existing approved or paid batch already exists for this year
    const existingActive = await DistributionBatch.findOne({
      year: data.year,
      status: { $in: [DistributionBatchStatus.APPROVED, DistributionBatchStatus.PAID] },
    });
    if (existingActive) {
      throw createError(
        `A finalized or approved distribution batch (${existingActive.batchNumber}) already exists for year ${data.year}.`,
        400
      );
    }

    // Generate serial batchNumber
    const count = await DistributionBatch.countDocuments({ year: data.year });
    const batchNumber = `FD-${data.year}-${String(count + 1).padStart(3, '0')}`;

    const batch = new DistributionBatch({
      batchNumber,
      year: preview.year,
      title: data.title || `Annual Final Distribution ${data.year}`,
      status: DistributionBatchStatus.DRAFT,
      basis: preview.basis,
      totalPool: preview.totalPool,
      totalPrincipalReturned: preview.totalPrincipalReturned,
      netRealizedProfit: preview.netRealizedProfit,
      totalExpenses: preview.totalExpenses,
      retainedAmount: preview.retainedAmount,
      distributableAmount: preview.distributableAmount,
      totalShares: preview.totalShares,
      amountPerShare: preview.amountPerShare,
      memberCount: preview.memberCount,
      preparedBy: (user as any)._id,
      notes: data.notes,
    });

    await batch.save();

    // Insert MemberDistribution line items
    const memberDocs = preview.allocations.map((alloc) => ({
      ...alloc,
      batchId: batch._id,
      status: 'PENDING',
    }));

    await MemberDistribution.insertMany(memberDocs);

    // Audit Log
    await AuditLog.create({
      action: 'DISTRIBUTION_BATCH_CREATED',
      entityName: 'DistributionBatch',
      entityId: batch._id,
      performedBy: (user as any)._id,
      reason: `Created draft distribution batch ${batchNumber} for year ${data.year}`,
    });

    return batch;
  }

  /**
   * Reviews a batch and moves it from DRAFT to REVIEWED.
   */
  static async reviewBatch(batchId: string, user: IUser) {
    const batch = await DistributionBatch.findById(batchId);
    if (!batch) throw createError('Distribution batch not found.', 404);

    if (batch.status !== DistributionBatchStatus.DRAFT) {
      throw createError(
        `Batch cannot be reviewed because it is in status '${batch.status}' (expected DRAFT).`,
        400
      );
    }

    batch.status = DistributionBatchStatus.REVIEWED;
    batch.reviewedBy = (user as any)._id;
    batch.reviewedAt = new Date();
    await batch.save();

    await AuditLog.create({
      action: 'DISTRIBUTION_BATCH_REVIEWED',
      entityName: 'DistributionBatch',
      entityId: batch._id,
      performedBy: (user as any)._id,
      reason: `Reviewed distribution batch ${batch.batchNumber}`,
    });

    return batch;
  }

  /**
   * Approves a batch. STRICTLY requires SUPER_ADMIN role.
   */
  static async approveBatch(batchId: string, user: IUser) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw createError(
        'Batch approval is restricted strictly to the Super Administrator.',
        403
      );
    }

    const batch = await DistributionBatch.findById(batchId);
    if (!batch) throw createError('Distribution batch not found.', 404);

    if (batch.status !== DistributionBatchStatus.REVIEWED) {
      throw createError(
        `Batch cannot be approved because it is in status '${batch.status}' (expected REVIEWED).`,
        400
      );
    }

    batch.status = DistributionBatchStatus.APPROVED;
    batch.approvedBy = (user as any)._id;
    batch.approvedAt = new Date();
    await batch.save();

    await AuditLog.create({
      action: 'DISTRIBUTION_BATCH_APPROVED',
      entityName: 'DistributionBatch',
      entityId: batch._id,
      performedBy: (user as any)._id,
      reason: `Approved distribution batch ${batch.batchNumber}`,
    });

    return batch;
  }

  /**
   * Executes settlement payout. STRICTLY requires SUPER_ADMIN role.
   * Validates custody liquidity, creates CustodyMovement, updates member records.
   */
  static async executePayment(
    batchId: string,
    custodyAccountId: string,
    user: IUser
  ) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw createError(
        'Execution of final distribution settlement is restricted strictly to Super Administrator.',
        403
      );
    }

    const batch = await DistributionBatch.findById(batchId);
    if (!batch) throw createError('Distribution batch not found.', 404);

    if (batch.status !== DistributionBatchStatus.APPROVED) {
      throw createError(
        `Batch cannot be paid because it is in status '${batch.status}' (expected APPROVED).`,
        400
      );
    }

    // Validate Custody Account & Liquidity
    const account = await CustodyAccount.findById(custodyAccountId);
    if (!account || !account.isActive) {
      throw createError('Selected custody account is invalid or inactive.', 400);
    }

    const accountsWithBalance = await CustodyService.getCustodyAccounts();
    const targetAccount = accountsWithBalance.find(
      (a: any) => String(a._id) === String(custodyAccountId)
    );

    const availableBalance = targetAccount?.derivedBalance ?? 0;
    if (availableBalance < batch.distributableAmount) {
      throw createError(
        `Insufficient custody balance. Account '${account.name}' has ৳${availableBalance.toLocaleString()}, but batch requires ৳${batch.distributableAmount.toLocaleString()}.`,
        400
      );
    }

    // 1. Create Outgoing Custody Movement
    const movement = new CustodyMovement({
      custodyAccountId: account._id,
      movementType: MovementType.OUT,
      amount: batch.distributableAmount,
      sourceType: MovementSourceType.FINAL_DISTRIBUTION,
      sourceRefId: batch._id,
      date: new Date(),
      description: `Settlement of ${batch.title} (${batch.batchNumber}) for ${batch.memberCount} members`,
      performedBy: (user as any)._id,
    });
    await movement.save();

    // 2. Mark Member Distributions as PAID
    const now = new Date();
    await MemberDistribution.updateMany(
      { batchId: batch._id },
      {
        $set: {
          status: 'PAID',
          custodyMovementId: movement._id,
          paidAt: now,
          paymentReference: `PAY-${batch.batchNumber}-${account.channel}`,
        },
      }
    );

    // 3. Mark Batch as PAID
    batch.status = DistributionBatchStatus.PAID;
    batch.custodyAccountId = account._id;
    batch.paidBy = (user as any)._id;
    batch.paidAt = now;
    await batch.save();

    // 4. Audit Log
    await AuditLog.create({
      action: 'DISTRIBUTION_BATCH_PAID',
      entityName: 'DistributionBatch',
      entityId: batch._id,
      performedBy: (user as any)._id,
      reason: `Executed payment of ৳${batch.distributableAmount.toLocaleString()} from '${account.name}' for batch ${batch.batchNumber}`,
    });

    return {
      batch,
      movement,
      availableBalanceAfter: availableBalance - batch.distributableAmount,
    };
  }

  /**
   * Lists distribution batches.
   */
  static async getBatches(query: {
    year?: string;
    status?: string;
    page?: string;
    limit?: string;
  }) {
    const filter: Record<string, unknown> = {};
    if (query.year) filter.year = Number(query.year);
    if (query.status) filter.status = query.status;

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));

    const [batches, total] = await Promise.all([
      DistributionBatch.find(filter)
        .populate('custodyAccountId', 'name channel')
        .populate('preparedBy', 'name email')
        .populate('reviewedBy', 'name email')
        .populate('approvedBy', 'name email')
        .populate('paidBy', 'name email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DistributionBatch.countDocuments(filter),
    ]);

    return {
      batches,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single batch detail and its member distributions.
   */
  static async getBatchById(id: string) {
    const batch = await DistributionBatch.findById(id)
      .populate('custodyAccountId', 'name channel accountNumber')
      .populate('preparedBy', 'name email accountantType')
      .populate('reviewedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('paidBy', 'name email')
      .lean();

    if (!batch) throw createError('Distribution batch not found.', 404);

    const distributions = await MemberDistribution.find({ batchId: id })
      .sort({ memberCode: 1 })
      .lean();

    return {
      batch,
      distributions,
    };
  }

  /**
   * Exports batch allocations to CSV.
   */
  static async exportBatchCsv(id: string) {
    const { batch, distributions } = await this.getBatchById(id);

    const headers = [
      'Batch Number',
      'Year',
      'Member Code',
      'Member Name',
      'Final Shares',
      'Share Ratio',
      'Gross Entitlement (BDT)',
      'Shortfall Deduction (BDT)',
      'Advance Credit (BDT)',
      'Net Distribution (BDT)',
      'Status',
      'Payment Reference',
      'Paid At',
    ];

    const rows = distributions.map((d) => [
      batch.batchNumber,
      batch.year,
      d.memberCode,
      `"${(d.memberName || '').replace(/"/g, '""')}"`,
      d.finalShares,
      (d.shareRatio * 100).toFixed(2) + '%',
      d.grossEntitlement.toFixed(2),
      d.shortfallDeduction.toFixed(2),
      d.advanceCredit.toFixed(2),
      d.netDistributionAmount.toFixed(2),
      d.status,
      d.paymentReference || '—',
      d.paidAt ? new Date(d.paidAt).toISOString().split('T')[0] : '—',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}
