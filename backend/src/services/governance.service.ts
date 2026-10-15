import { Types } from 'mongoose';
import { AnnualClosing, AuditLog, CustodyAccount, CustodyMovement, Expense, InvestmentReturn, Member, MemberExitSettlement, MonthlyLedger, Payment, Policy, PolicyVersion, SystemConfig } from '../models/index.js';
import { AnnualClosingStatus, IUser, MemberExitStatus, MovementSourceType, MovementType, UserRole } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { CustodyService } from './custody.service.js';

const actor = (user: IUser) => (user as IUser & { _id: Types.ObjectId })._id;
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export class GovernanceService {
  static async annualSummary(year: number) {
    const start = new Date(year, 0, 1); const end = new Date(year, 11, 31, 23, 59, 59, 999);
    const [payments, expenses, returns, ledgers, members] = await Promise.all([
      Payment.aggregate([{ $match: { paymentDate: { $gte: start, $lte: end }, status: { $ne: 'CANCELLED' } } }, { $group: { _id: null, collections: { $sum: '$totalAmount' }, principal: { $sum: '$principalAmount' }, penalties: { $sum: '$penaltyAmount' }, cashout: { $sum: '$cashoutCharge' } } }]),
      Expense.aggregate([{ $match: { date: { $gte: start, $lte: end } } }, { $group: { _id: null, expenses: { $sum: '$amount' } } }]),
      InvestmentReturn.aggregate([{ $match: { maturityDate: { $gte: start, $lte: end } } }, { $group: { _id: null, returns: { $sum: '$totalReturn' }, profit: { $sum: '$actualProfit' }, loss: { $sum: '$actualLoss' } } }]),
      MonthlyLedger.aggregate([{ $match: { month: { $gte: `${year}-01`, $lte: `${year}-12` } } }, { $group: { _id: null, dues: { $sum: { $subtract: ['$principalDue', '$principalPaid'] } }, advance: { $sum: '$excessAdvance' } } }]),
      Member.countDocuments(),
    ]);
    const custody = await CustodyService.getCustodySummary(); const payment = payments[0] || {}; const expense = expenses[0] || {}; const investmentReturn = returns[0] || {}; const ledger = ledgers[0] || {};
    return { year, members, collections: round(payment.collections || 0), principal: round(payment.principal || 0), penalties: round(payment.penalties || 0), cashoutCharges: round(payment.cashout || 0), expenses: round(expense.expenses || 0), investmentReturns: round(investmentReturn.returns || 0), realizedProfit: round(investmentReturn.profit || 0), realizedLoss: round(investmentReturn.loss || 0), outstandingDues: round(ledger.dues || 0), advances: round(ledger.advance || 0), custodyBalance: round(custody.totalLiquidFunds) };
  }
  static async createAnnualClosing(year: number, notes: string | undefined, user: IUser) { if (await AnnualClosing.exists({ year })) throw createError('An annual closing already exists for this year.', 409); const summary = await this.annualSummary(year); const closing = await AnnualClosing.create({ year, summary, preparedBy: actor(user), notes, status: AnnualClosingStatus.DRAFT }); await this.audit(user, 'CREATE_ANNUAL_CLOSING', 'AnnualClosing', closing._id, `Created annual closing draft for ${year}.`); return closing; }
  static async transitionAnnualClosing(id: string, action: 'review' | 'approve' | 'lock' | 'unlock', user: IUser) {
    const closing = await AnnualClosing.findById(id);
    if (!closing) throw createError('Annual closing not found.', 404);

    if (action === 'unlock') {
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
        throw createError('Only Admin or Super Admin can unlock an annual closing.', 403);
      }
      closing.status = AnnualClosingStatus.DRAFT;
      closing.lockedBy = undefined;
      await closing.save();
      await this.audit(user, 'ANNUAL_CLOSING_UNLOCK', 'AnnualClosing', closing._id, `Unlocked annual closing for year ${closing.year} to allow payment updates.`);
      return closing;
    }

    if (action === 'lock') {
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
        throw createError('Only Admin or Super Admin can lock an annual closing.', 403);
      }
      closing.status = AnnualClosingStatus.LOCKED;
      closing.lockedBy = actor(user);
      closing.summary = await this.annualSummary(closing.year);
      await closing.save();
      await this.audit(user, 'ANNUAL_CLOSING_LOCK', 'AnnualClosing', closing._id, `Locked annual closing for year ${closing.year}.`);
      return closing;
    }

    const expected = action === 'review' ? AnnualClosingStatus.DRAFT : AnnualClosingStatus.REVIEWED;
    if (closing.status !== expected) throw createError(`Annual closing must be ${expected} before ${action}.`, 400);

    if (action === 'approve' && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw createError('Only Admin or Super Admin can approve an annual closing.', 403);
    }

    closing.status = action === 'review' ? AnnualClosingStatus.REVIEWED : AnnualClosingStatus.APPROVED;
    if (action === 'review') closing.reviewedBy = actor(user);
    if (action === 'approve') closing.approvedBy = actor(user);
    await closing.save();
    await this.audit(user, `ANNUAL_CLOSING_${action.toUpperCase()}`, 'AnnualClosing', closing._id, `${action} annual closing ${closing.year}.`);
    return closing;
  }
  static async listAnnualClosings() { return AnnualClosing.find().sort({ year: -1 }).populate('preparedBy reviewedBy approvedBy lockedBy', 'name email').lean(); }

  static async listPolicies() { return Policy.find().sort({ serialNumber: 1 }).lean(); }
  static async createPolicy(input: { serialNumber: number; title: string; category: string; content: string }, user: IUser) { const policy = await Policy.create({ ...input, createdBy: actor(user), updatedBy: actor(user), currentVersion: 1, isActive: true }); await PolicyVersion.create({ policyId: policy._id, versionNumber: 1, content: policy.content, changeReason: 'Initial version', modifiedBy: actor(user) }); await this.audit(user, 'CREATE_POLICY', 'Policy', policy._id, `Created policy ${policy.serialNumber}.`); return policy; }
  static async amendPolicy(id: string, input: { title?: string; category?: string; content: string; changeReason: string }, user: IUser) { if (!input.changeReason?.trim()) throw createError('A policy amendment reason is required.', 400); const policy = await Policy.findById(id); if (!policy) throw createError('Policy not found.', 404); policy.title = input.title || policy.title; policy.category = input.category || policy.category; policy.content = input.content; policy.currentVersion += 1; policy.updatedBy = actor(user); await policy.save(); await PolicyVersion.create({ policyId: policy._id, versionNumber: policy.currentVersion, content: input.content, changeReason: input.changeReason, modifiedBy: actor(user) }); await this.audit(user, 'AMEND_POLICY', 'Policy', policy._id, input.changeReason); return policy; }
  static async policyVersions(id: string) { return PolicyVersion.find({ policyId: id }).sort({ versionNumber: -1 }).populate('modifiedBy', 'name email').lean(); }

  static async getPolicyDocument() {
    const config = await SystemConfig.findOne({ key: 'FOUNDATION_FULL_POLICY' }).lean();
    return {
      content: (config?.value as string) || '',
      lastUpdated: config?.updatedAt || null,
    };
  }

  static formatPolicyDocument(rawText: string): string {
    if (!rawText) return '';
    // Normalize accidental splits of percentages or decimals
    let formatted = rawText
      .replace(/([০-৯\d]+)[।.]\s*([০-৯\d]+%)/g, '$1.$2')
      .replace(/থেকে\s*\n+\s*([০-৯\d.]+)/g, 'থেকে $1');

    // Format policies so that each numbered rule starts on a new line
    return formatted
      .replace(/(^|[^\d০-৯.])([০-৯\d]{1,3})[।.)]\s*/g, (match, prefix, num, offset, fullStr) => {
        // If immediately preceded by a dot or digit, it's a decimal like 9.99, don't split
        if (offset > 0 && /[\d০-৯.]/.test(fullStr[offset - 1])) {
          return match;
        }
        // If followed by digits (decimal part), don't split
        const rest = fullStr.slice(offset + match.length);
        if (/^[০-৯\d]/.test(rest)) {
          return match;
        }
        const isStart = offset === 0 || prefix === '' || prefix === '\n';
        const cleanPrefix = prefix.replace(/\n+$/, '');
        return (isStart ? '' : cleanPrefix + '\n\n') + num + '। ';
      })
      .replace(/([ক-হa-zA-Z])[)\]]\s*/g, '\n   $1) ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  static async savePolicyDocument(content: string, user: IUser) {
    const formattedContent = this.formatPolicyDocument(content);
    const config = await SystemConfig.findOneAndUpdate(
      { key: 'FOUNDATION_FULL_POLICY' },
      {
        key: 'FOUNDATION_FULL_POLICY',
        value: formattedContent,
        description: 'Full NS Foundation Policy Document',
        updatedBy: actor(user),
      },
      { upsert: true, new: true }
    );
    await this.audit(user, 'SAVE_POLICY_DOCUMENT', 'SystemConfig', config._id, 'Full foundation policy document updated.');
    return { content: config.value, lastUpdated: config.updatedAt };
  }

  static async proposeExit(
    memberId: string,
    eligibleAmount: number,
    notes: string | undefined,
    user: IUser,
    options?: {
      custodyAccountId?: string;
      autoSettle?: boolean;
      deductionRate?: number;
      netAmount?: number;
      paymentMethod?: string;
      transactionRef?: string;
      authorizerName?: string;
    }
  ) {
    const member = await Member.findById(memberId);
    if (!member) throw createError('Member not found.', 404);
    if (member.status !== 'ACTIVE' && member.status !== 'DROPPED') {
      throw createError('Only active or dropped members can have an exit settlement.', 400);
    }
    if (await MemberExitSettlement.exists({ memberId: member._id })) {
      throw createError('An exit settlement already exists for this member.', 409);
    }
    if (!Number.isFinite(eligibleAmount) || eligibleAmount < 0) {
      throw createError('Eligible amount must be a non-negative number.', 400);
    }

    const deductionRate = options?.deductionRate !== undefined ? Math.max(0, Number(options.deductionRate)) : 9.99;
    let netAmount: number;
    let deductionAmount: number;

    if (options?.netAmount !== undefined && Number.isFinite(options.netAmount) && options.netAmount >= 0) {
      netAmount = round(options.netAmount);
      deductionAmount = round(Math.max(0, eligibleAmount - netAmount));
    } else {
      deductionAmount = deductionRate === 0 ? 0 : round((eligibleAmount * deductionRate) / 100);
      netAmount = round(eligibleAmount - deductionAmount);
    }

    const installmentAmount = round(netAmount / 4);
    const today = new Date();
    const installments = Array.from({ length: 4 }, (_, index) => ({
      dueDate: new Date(today.getFullYear(), today.getMonth() + index + 1, today.getDate()),
      amount: index === 3 ? round(netAmount - installmentAmount * 3) : installmentAmount,
      paidAmount: 0,
    }));

    const settlement = await MemberExitSettlement.create({
      memberId: member._id,
      eligibleAmount,
      deductionRate,
      deductionAmount,
      netAmount,
      installmentAmount,
      installments,
      requestedBy: actor(user),
      paymentMethod: options?.paymentMethod,
      transactionRef: options?.transactionRef,
      authorizerName: options?.authorizerName,
      notes,
      status: MemberExitStatus.PROPOSED,
    });

    await this.audit(
      user,
      'PROPOSE_MEMBER_EXIT',
      'MemberExitSettlement',
      settlement._id,
      `Proposed exit settlement for ${member.memberId}; eligible: ৳${eligibleAmount}, deduction: ৳${deductionAmount} (${deductionRate}%), net: ৳${netAmount}.${options?.authorizerName ? ` Authorized by: ${options.authorizerName}` : ''}`
    );

    if (options?.autoSettle && options?.custodyAccountId) {
      settlement.status = MemberExitStatus.APPROVED;
      settlement.approvedBy = actor(user);
      await settlement.save();
      return await this.settleExitInFull(String(settlement._id), options.custodyAccountId, user);
    }

    return settlement;
  }

  static async approveExit(id: string, user: IUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw createError('Only Admin or Super Admin can approve an exit settlement.', 403);
    }
    const settlement = await MemberExitSettlement.findById(id);
    if (!settlement) throw createError('Exit settlement not found.', 404);
    if (settlement.status !== MemberExitStatus.PROPOSED) {
      throw createError('Only proposed settlements can be approved.', 400);
    }
    settlement.status = MemberExitStatus.APPROVED;
    settlement.approvedBy = actor(user);
    await settlement.save();
    await this.audit(user, 'APPROVE_MEMBER_EXIT', 'MemberExitSettlement', settlement._id, 'Approved member exit settlement.');
    return settlement;
  }

  static async payExitInstallment(id: string, index: number, custodyAccountId: string, user: IUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw createError('Only Admin or Super Admin can release exit installments.', 403);
    }
    const settlement = await MemberExitSettlement.findById(id);
    if (!settlement || ![MemberExitStatus.APPROVED, MemberExitStatus.PARTIALLY_PAID].includes(settlement.status)) {
      throw createError('Approved exit settlement not found.', 404);
    }
    const installment = settlement.installments[index];
    if (!installment || installment.paidAmount > 0) {
      throw createError('This installment is unavailable or already paid.', 400);
    }
    const account = await CustodyAccount.findById(custodyAccountId);
    if (!account?.isActive) throw createError('An active custody account is required.', 400);
    const balance = await CustodyService.getDerivedAccountBalance(account._id);
    if (balance.currentBalance < installment.amount) {
      throw createError('Insufficient custody balance for this installment.', 400);
    }

    const movement = await CustodyMovement.create({
      custodyAccountId: account._id,
      movementType: MovementType.OUT,
      amount: installment.amount,
      sourceType: MovementSourceType.FINAL_DISTRIBUTION,
      sourceRefId: settlement._id,
      date: new Date(),
      description: `Member exit installment ${index + 1}/4`,
      performedBy: actor(user),
    });

    const newBal = await CustodyService.getDerivedAccountBalance(account._id);
    account.cachedBalance = newBal.currentBalance;
    await account.save();

    installment.paidAmount = installment.amount;
    installment.paidAt = new Date();
    installment.custodyMovementId = movement._id;
    const done = settlement.installments.every((item) => item.paidAmount >= item.amount);
    settlement.status = done ? MemberExitStatus.SETTLED : MemberExitStatus.PARTIALLY_PAID;
    await settlement.save();

    if (done) await Member.findByIdAndUpdate(settlement.memberId, { status: 'DROPPED' });
    await this.audit(user, 'PAY_MEMBER_EXIT_INSTALLMENT', 'MemberExitSettlement', settlement._id, `Paid installment ${index + 1}/4.`);
    return settlement;
  }

  static async settleExitInFull(id: string, custodyAccountId: string, user: IUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw createError('Only Admin or Super Admin can settle exit payments.', 403);
    }
    const settlement = await MemberExitSettlement.findById(id);
    if (!settlement) throw createError('Exit settlement not found.', 404);

    const paidSoFar = settlement.installments.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
    const remainingAmount = round(settlement.netAmount - paidSoFar);
    if (remainingAmount <= 0) throw createError('Settlement is already fully paid.', 400);

    const account = await CustodyAccount.findById(custodyAccountId);
    if (!account?.isActive) throw createError('An active custody account is required.', 400);

    const balance = await CustodyService.getDerivedAccountBalance(account._id);
    if (balance.currentBalance < remainingAmount) {
      throw createError(
        `Insufficient custody balance in ${account.name}. Available: ৳${balance.currentBalance.toFixed(2)}, Required: ৳${remainingAmount.toFixed(2)}.`,
        400
      );
    }

    const paymentDesc = [
      `Member exit refund payout (৳${remainingAmount})`,
      settlement.deductionRate === 0 ? `[100% Full Refund - 0% Deduction]` : `[${settlement.deductionRate}% Deduction]`,
      settlement.paymentMethod ? `via ${settlement.paymentMethod}` : null,
      settlement.transactionRef ? `Ref: ${settlement.transactionRef}` : null,
      settlement.authorizerName ? `Auth: ${settlement.authorizerName}` : null,
    ].filter(Boolean).join(' • ');

    const movement = await CustodyMovement.create({
      custodyAccountId: account._id,
      movementType: MovementType.OUT,
      amount: remainingAmount,
      sourceType: MovementSourceType.FINAL_DISTRIBUTION,
      sourceRefId: settlement._id,
      date: new Date(),
      description: paymentDesc,
      performedBy: actor(user),
    });

    const newBal = await CustodyService.getDerivedAccountBalance(account._id);
    account.cachedBalance = newBal.currentBalance;
    await account.save();

    for (const inst of settlement.installments) {
      inst.paidAmount = inst.amount;
      inst.paidAt = new Date();
      inst.custodyMovementId = movement._id;
    }
    settlement.status = MemberExitStatus.SETTLED;
    if (!settlement.approvedBy) settlement.approvedBy = actor(user);
    await settlement.save();

    await Member.findByIdAndUpdate(settlement.memberId, { status: 'DROPPED', currentShares: 0 });
    await this.audit(
      user,
      'SETTLE_MEMBER_EXIT_FULL',
      'MemberExitSettlement',
      settlement._id,
      `Settled member exit in full (৳${remainingAmount}) deducted from ${account.name}.${settlement.authorizerName ? ` Authorized by: ${settlement.authorizerName}` : ''}`
    );
    return settlement;
  }

  static async getExit(id: string) {
    const settlement = await MemberExitSettlement.findById(id)
      .populate('memberId', 'memberId name phone status currentShares')
      .populate('approvedBy', 'name email')
      .populate('requestedBy', 'name email')
      .populate({
        path: 'installments.custodyMovementId',
        select: 'amount custodyAccountId date movementType description',
        populate: { path: 'custodyAccountId', select: 'name channel accountNumber' },
      })
      .lean();
    if (!settlement) throw createError('Exit settlement not found.', 404);
    return settlement;
  }

  static async updateExit(
    id: string,
    input: {
      eligibleAmount?: number;
      deductionRate?: number;
      deductionAmount?: number;
      netAmount?: number;
      status?: MemberExitStatus;
      notes?: string;
      custodyAccountId?: string;
      paymentMethod?: string;
      transactionRef?: string;
      authorizerName?: string;
    },
    user: IUser
  ) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw createError('Only Admin or Super Admin can edit exit settlements.', 403);
    }
    const settlement = await MemberExitSettlement.findById(id);
    if (!settlement) throw createError('Exit settlement not found.', 404);

    if (input.eligibleAmount !== undefined && Number(input.eligibleAmount) >= 0) {
      settlement.eligibleAmount = Number(input.eligibleAmount);
    }
    if (input.deductionRate !== undefined && Number(input.deductionRate) >= 0) {
      settlement.deductionRate = Number(input.deductionRate);
    }

    if (input.deductionAmount !== undefined && Number(input.deductionAmount) >= 0) {
      settlement.deductionAmount = Number(input.deductionAmount);
    } else if (input.eligibleAmount !== undefined || input.deductionRate !== undefined) {
      settlement.deductionAmount = settlement.deductionRate === 0 ? 0 : round(settlement.eligibleAmount * (settlement.deductionRate / 100));
    }

    if (input.netAmount !== undefined && Number(input.netAmount) >= 0) {
      settlement.netAmount = Number(input.netAmount);
    } else if (input.eligibleAmount !== undefined || input.deductionAmount !== undefined) {
      settlement.netAmount = round(settlement.eligibleAmount - settlement.deductionAmount);
    }

    settlement.installmentAmount = round(settlement.netAmount / 4);

    if (input.paymentMethod !== undefined) settlement.paymentMethod = input.paymentMethod;
    if (input.transactionRef !== undefined) settlement.transactionRef = input.transactionRef;
    if (input.authorizerName !== undefined) settlement.authorizerName = input.authorizerName;
    if (input.notes !== undefined) settlement.notes = input.notes;

    if (input.status && Object.values(MemberExitStatus).includes(input.status)) {
      settlement.status = input.status;
    }

    // Check linked custody movements if already settled
    const linkedMovements = await CustodyMovement.find({
      $or: [
        { sourceRefId: settlement._id },
        { _id: { $in: settlement.installments.map((i) => i.custodyMovementId).filter(Boolean) } },
      ],
    });

    if (linkedMovements.length > 0) {
      const primaryMovement = linkedMovements[0];
      const targetAccountId = input.custodyAccountId || primaryMovement.custodyAccountId;
      const account = await CustodyAccount.findById(targetAccountId);
      if (account) {
        primaryMovement.amount = settlement.netAmount;
        if (input.custodyAccountId && String(account._id) !== String(primaryMovement.custodyAccountId)) {
          const oldAccount = await CustodyAccount.findById(primaryMovement.custodyAccountId);
          primaryMovement.custodyAccountId = account._id;
          await primaryMovement.save();
          if (oldAccount) {
            const oldBal = await CustodyService.getDerivedAccountBalance(oldAccount._id);
            oldAccount.cachedBalance = oldBal.currentBalance;
            await oldAccount.save();
          }
        } else {
          await primaryMovement.save();
        }
        const newBal = await CustodyService.getDerivedAccountBalance(account._id);
        account.cachedBalance = newBal.currentBalance;
        await account.save();
      }
    }

    // Update installments
    const quarter = round(settlement.netAmount / 4);
    for (let i = 0; i < settlement.installments.length; i++) {
      settlement.installments[i].amount = quarter;
      if (settlement.status === MemberExitStatus.SETTLED) {
        settlement.installments[i].paidAmount = quarter;
        if (!settlement.installments[i].paidAt) {
          settlement.installments[i].paidAt = new Date();
        }
      }
    }

    await settlement.save();

    await this.audit(
      user,
      'UPDATE_MEMBER_EXIT',
      'MemberExitSettlement',
      settlement._id,
      `Updated member exit settlement: eligible=${settlement.eligibleAmount}, deduction=${settlement.deductionAmount}, net=${settlement.netAmount}, status=${settlement.status}.`
    );

    return settlement;
  }

  static async deleteExit(id: string, user: IUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw createError('Only Admin or Super Admin can delete exit settlements.', 403);
    }
    const settlement = await MemberExitSettlement.findById(id);
    if (!settlement) throw createError('Exit settlement not found.', 404);

    const linkedMovements = await CustodyMovement.find({
      $or: [
        { sourceRefId: settlement._id },
        { _id: { $in: settlement.installments.map((i) => i.custodyMovementId).filter(Boolean) } },
      ],
    });

    const affectedAccountIds = new Set<string>();
    for (const mov of linkedMovements) {
      affectedAccountIds.add(String(mov.custodyAccountId));
      await CustodyMovement.findByIdAndDelete(mov._id);
    }

    for (const accId of affectedAccountIds) {
      const account = await CustodyAccount.findById(accId);
      if (account) {
        const derived = await CustodyService.getDerivedAccountBalance(account._id);
        account.cachedBalance = derived.currentBalance;
        await account.save();
      }
    }

    await MemberExitSettlement.findByIdAndDelete(id);

    await this.audit(
      user,
      'DELETE_MEMBER_EXIT',
      'MemberExitSettlement',
      settlement._id,
      `Deleted exit settlement for member ${settlement.memberId} and reversed ${linkedMovements.length} custody deduction movement(s).`
    );

    return { success: true, message: 'Exit settlement deleted and custody balance restored.' };
  }

  static async listExits() {
    return MemberExitSettlement.find()
      .populate('memberId', 'memberId name phone status currentShares')
      .populate('approvedBy', 'name email')
      .populate('requestedBy', 'name email')
      .populate({
        path: 'installments.custodyMovementId',
        select: 'amount custodyAccountId date movementType description',
        populate: { path: 'custodyAccountId', select: 'name channel accountNumber' },
      })
      .sort({ createdAt: -1 })
      .lean();
  }
  private static async audit(user: IUser, action: string, entityName: string, entityId: Types.ObjectId, reason: string) { await AuditLog.create({ performedBy: actor(user), action, entityName, entityId, reason }); }
}
