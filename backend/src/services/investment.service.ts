import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { Types } from 'mongoose';
import { InvestmentProject } from '../models/InvestmentProject.js';
import { InvestmentFunding } from '../models/InvestmentFunding.js';
import { InvestmentReturn } from '../models/InvestmentReturn.js';
import { Reinvestment } from '../models/Reinvestment.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { AuditLog } from '../models/AuditLog.js';
import { MigrationBatch } from '../models/MigrationBatch.js';
import { MigrationRecord } from '../models/MigrationRecord.js';
import { User } from '../models/User.js';
import { CustodyService } from './custody.service.js';
import { InvestmentCalculationService } from './investment-calculation.service.js';
import {
  ProjectStatus,
  ReturnDestinationType,
  MovementType,
  MovementSourceType,
  AccountType,
  CustodyChannel,
  PaymentMethod,
  MigrationRecordStatus,
  IUser,
} from '../types/models.js';
import { createError } from '../middlewares/error.js';

function toYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

export class InvestmentService {
  /**
   * Create a new investment project (Initial Stage)
   */
  static async createProject(
    input: {
      projectId?: string;
      name: string;
      description?: string;
      category?: string;
      externalEntity?: string;
      invoiceNo?: string;
      invoiceTo?: string;
      plannedDuration?: string;
      startDate: string | Date;
      maturityDate?: string | Date;
      expectedAnnualRoiPercent?: number;
      expectedROI?: number;
      targetPrincipal: number;
      initialFundings?: Array<{
        custodyAccountId: string;
        amount: number;
        transactionRef?: string;
        notes?: string;
      }>;
    },
    actingUser: IUser
  ) {
    const startDate = new Date(input.startDate);
    let projectId = input.projectId?.trim().toUpperCase();

    // Auto-generate sequential PRJ-YYYYMM-XXXX if not provided
    if (!projectId) {
      const yearMonth = toYearMonth(startDate);
      const prefix = `PRJ-${yearMonth}`;
      const countThisMonth = await InvestmentProject.countDocuments({
        projectId: { $regex: `^${prefix}` },
      });
      projectId = `${prefix}-${String(countThisMonth + 1).padStart(4, '0')}`;
    } else {
      const existing = await InvestmentProject.findOne({ projectId });
      if (existing) {
        throw createError(`Project ID '${projectId}' is already in use`, 400);
      }
    }

    const roi =
      input.expectedAnnualRoiPercent !== undefined
        ? Number(input.expectedAnnualRoiPercent)
        : input.expectedROI !== undefined
        ? Number(input.expectedROI)
        : undefined;

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;

    const project = await InvestmentProject.create({
      projectId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      category: input.category?.trim() || 'General',
      externalEntity: input.externalEntity?.trim() || '',
      invoiceNo: input.invoiceNo?.trim() || undefined,
      invoiceTo: input.invoiceTo?.trim() || undefined,
      plannedDuration: input.plannedDuration?.trim() || undefined,
      startDate,
      maturityDate: input.maturityDate ? new Date(input.maturityDate) : undefined,
      expectedAnnualRoiPercent: roi,
      expectedROI: roi,
      targetPrincipal: Number(input.targetPrincipal),
      totalFunded: 0,
      status: ProjectStatus.PROPOSED,
      createdBy: actingUserId,
    });
    // Log project creation audit
    await AuditLog.create({
      performedBy: actingUserId,
      action: 'CREATE_INVESTMENT_PROJECT',
      entityName: 'InvestmentProject',
      entityId: project._id,
      afterState: project.toObject(),
      reason: `Created investment project ${project.name} (${project.projectId})`,
    });

    // If initial funding items are provided (e.g. Moin gives ৳20k, Samrat gives ৳10k at setup)
    if (input.initialFundings && input.initialFundings.length > 0) {
      await this.fundProject(
        {
          projectId: project._id.toString(),
          fundings: input.initialFundings,
          date: startDate,
        },
        actingUser
      );
    }

    return InvestmentProject.findById(project._id);
  }

  /**
   * Multi-Accountant Project Investment
   * Supports one or multiple custody accounts supplying funds simultaneously
   */
  static async fundProject(
    input: {
      projectId: string;
      fundings: Array<{
        custodyAccountId: string;
        amount: number;
        transactionRef?: string;
        notes?: string;
      }>;
      date?: string | Date;
    },
    actingUser: IUser
  ) {
    const { projectId, fundings } = input;
    if (!fundings || fundings.length === 0) {
      throw createError('At least one funding source is required', 400);
    }

    const project = await InvestmentProject.findById(projectId);
    if (!project) {
      throw createError('Investment project not found', 404);
    }

    if (project.status === ProjectStatus.CLOSED || project.status === ProjectStatus.DEFAULTED) {
      throw createError(`Cannot fund a project with status '${project.status}'`, 400);
    }

    const fundingDate = input.date ? new Date(input.date) : new Date();
    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;

    let totalNewFunding = 0;
    let walletFunding = 0;
    let accountantFunding = 0;
    const createdFundings = [];

    // Process each supplying custody account
    for (const item of fundings) {
      const amount = Number(item.amount);
      if (!amount || amount <= 0) {
        throw createError('Funding amount must be greater than 0', 400);
      }

      const custodyAccount = await CustodyAccount.findById(item.custodyAccountId).populate(
        'holderId',
        'name email accountantType'
      );
      if (!custodyAccount || !custodyAccount.isActive) {
        throw createError(`Custody account not found or inactive`, 404);
      }

      // Verify sufficient derived balance
      const { currentBalance } = await CustodyService.getDerivedAccountBalance(custodyAccount._id);
      if (currentBalance < amount) {
        throw createError(
          `Insufficient funds in ${custodyAccount.name}. Available: ৳${currentBalance.toLocaleString()}, Requested: ৳${amount.toLocaleString()}`,
          400
        );
      }

      // 1. Create InvestmentFunding record
      const fundingDoc = await InvestmentFunding.create({
        projectId: project._id,
        custodyAccountId: custodyAccount._id,
        amount,
        date: fundingDate,
        transactionRef: item.transactionRef || '',
        fundedBy: actingUserId,
        notes: item.notes || `Funding contribution for ${project.name} (${project.projectId})`,
      });

      // 2. Atomically create synchronized CustodyMovement (OUT)
      const outMovement = await CustodyMovement.create({
        custodyAccountId: custodyAccount._id,
        movementType: MovementType.OUT,
        amount,
        sourceType: MovementSourceType.INVESTMENT_FUNDING,
        sourceRefId: fundingDoc._id,
        date: fundingDate,
        description: `Investment funding into ${project.name} (${project.projectId})${item.notes ? ` — ${item.notes}` : ''}`,
        performedBy: actingUserId,
      });

      fundingDoc.custodyMovementId = outMovement._id;
      await fundingDoc.save();

      // 3. Update cachedBalance on the custody account
      const { currentBalance: newBal } = await CustodyService.getDerivedAccountBalance(custodyAccount._id);
      custodyAccount.cachedBalance = newBal;
      await custodyAccount.save();

      totalNewFunding += amount;
      if (custodyAccount.accountType === AccountType.EXTERNAL_WALLET) walletFunding += amount;
      else if (custodyAccount.accountType === AccountType.ACCOUNTANT_CUSTODY) accountantFunding += amount;
      createdFundings.push({
        funding: fundingDoc,
        movement: outMovement,
        accountName: custodyAccount.name,
        channel: custodyAccount.channel,
        amount,
      });

      // Audit log
      await AuditLog.create({
        performedBy: actingUserId,
        action: 'INVESTMENT_FUNDING',
        entityName: 'InvestmentFunding',
        entityId: fundingDoc._id,
        afterState: {
          projectId: project.projectId,
          projectName: project.name,
          custodyAccount: custodyAccount.name,
          amount,
          date: fundingDate,
        },
        reason: `Invested ৳${amount.toLocaleString()} into ${project.name} from ${custodyAccount.name}`,
      });
    }

    // Update project total funded & status to ACTIVE
    project.totalFunded += totalNewFunding;
    project.walletReinvestedAmount = Number(project.walletReinvestedAmount || 0) + walletFunding;
    project.accountantFundedAmount = Number(project.accountantFundedAmount || 0) + accountantFunding;
    if (project.status === ProjectStatus.PROPOSED) {
      project.status = ProjectStatus.ACTIVE;
    }
    await project.save();

    return {
      project,
      totalNewFunding,
      createdFundings,
    };
  }

  /**
   * Record Investment Maturity Return
   * Returns can flow to a single accountant custody account (Bank/Cash/Nagad/bKash)
   * or stay in an organization external wallet (e.g. GrowUp Wallet) for reinvestment.
   */
  static async recordProjectReturn(
    input: {
      projectId: string;
      maturityDate?: string | Date;
      principalReturned: number;
      actualProfit?: number;
      actualLoss?: number;
      destinationType: ReturnDestinationType;
      destinationCustodyAccountId?: string;
      notes?: string;
      transactionRef?: string;
      idempotencyKey?: string;
    },
    actingUser: IUser
  ) {
    const project = await InvestmentProject.findById(input.projectId);
    if (!project) {
      throw createError('Investment project not found', 404);
    }

    // Validation 1: Negative returns rejected
    if (input.principalReturned !== undefined && Number(input.principalReturned) < 0) {
      throw createError('Principal return amount cannot be negative', 400);
    }
    if (input.actualProfit !== undefined && Number(input.actualProfit) < 0) {
      throw createError('Profit return amount cannot be negative', 400);
    }
    if (input.actualLoss !== undefined && Number(input.actualLoss) < 0) {
      throw createError('Loss return amount cannot be negative', 400);
    }

    // Validation 2: Idempotency check to prevent duplicate submissions
    if (input.idempotencyKey && input.idempotencyKey.trim()) {
      const existing = await InvestmentReturn.findOne({ idempotencyKey: input.idempotencyKey.trim() });
      if (existing) {
        return {
          project,
          investmentReturn: existing,
          inMovement: null,
          totalReturn: existing.totalReturn,
          isDuplicate: true,
        };
      }
    }

    const principalReturned = Math.max(0, Number(input.principalReturned) || 0);
    const actualProfit = Math.max(0, Number(input.actualProfit) || 0);
    const actualLoss = Math.max(0, Number(input.actualLoss) || 0);
    const totalReturn = principalReturned + actualProfit - actualLoss;

    // Validation 3: Non-zero return required
    if (totalReturn <= 0 && principalReturned === 0 && actualLoss === 0) {
      throw createError('Return amount or loss must be specified and greater than 0', 400);
    }

    const maturityDate = input.maturityDate ? new Date(input.maturityDate) : new Date();

    // Validation 4: Return date earlier than project start date rejected
    if (project.startDate && maturityDate < new Date(project.startDate)) {
      throw createError('Return date cannot be earlier than project start date', 400);
    }

    // Validation 5: Principal returned cannot exceed outstanding principal
    const existingReturns = await InvestmentReturn.find({ projectId: project._id });
    const totalPreviousPrincipalReturned = existingReturns.reduce(
      (sum, r) => sum + (Number(r.principalReturned) || 0),
      0
    );
    const originalPrincipal = project.totalFunded > 0 ? project.totalFunded : project.targetPrincipal;
    const currentOutstandingPrincipal = Math.max(0, originalPrincipal - totalPreviousPrincipalReturned);

    if (principalReturned > currentOutstandingPrincipal) {
      throw createError(
        `Principal return amount (৳${principalReturned.toLocaleString()}) cannot exceed outstanding principal (৳${currentOutstandingPrincipal.toLocaleString()})`,
        400
      );
    }

    let destinationAccount = null;
    if (input.destinationCustodyAccountId) {
      destinationAccount = await CustodyAccount.findById(input.destinationCustodyAccountId);
      if (!destinationAccount || !destinationAccount.isActive) {
        throw createError('Destination custody account not found or inactive', 400);
      }
    }
    if (!destinationAccount) throw createError('A destination custody or wallet account is required for every investment return', 400);
    const expectsAccountantCustody = input.destinationType === ReturnDestinationType.ACCOUNTANT_CUSTODY;
    const expectsWallet = input.destinationType === ReturnDestinationType.PROJECT_WALLET || input.destinationType === ReturnDestinationType.EXTERNAL_WALLET;
    if (expectsAccountantCustody && destinationAccount.accountType !== AccountType.ACCOUNTANT_CUSTODY) {
      throw createError('Accountant custody returns must be deposited into an active accountant custody account', 400);
    }
    if (expectsWallet && destinationAccount.accountType !== AccountType.EXTERNAL_WALLET) {
      throw createError('Wallet returns must be deposited into an active project or partner wallet', 400);
    }

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;

    // 1. Create InvestmentReturn record
    const returnDoc = await InvestmentReturn.create({
      projectId: project._id,
      maturityDate,
      principalReturned,
      actualProfit,
      actualLoss,
      totalReturn,
      destinationType: input.destinationType,
      destinationCustodyAccountId: destinationAccount ? destinationAccount._id : null,
      notes: input.notes || '',
      transactionRef: input.transactionRef?.trim() || undefined,
      idempotencyKey: input.idempotencyKey?.trim() || undefined,
      recordedBy: actingUserId,
    });

    // 2. Every positive return is an IN movement: accountant custody and
    // external/project wallets are both auditable custody ledgers.
    let inMovement = null;
    if (destinationAccount && totalReturn > 0) {
      inMovement = await CustodyMovement.create({
        custodyAccountId: destinationAccount._id,
        movementType: MovementType.IN,
        amount: totalReturn,
        sourceType: MovementSourceType.INVESTMENT_RETURN,
        sourceRefId: returnDoc._id,
        date: maturityDate,
        description: `Investment Return from ${project.name} (${project.projectId}) [Principal: ৳${principalReturned.toLocaleString()}, Profit: ৳${actualProfit.toLocaleString()}${actualLoss > 0 ? `, Loss: -৳${actualLoss.toLocaleString()}` : ''}]${input.notes ? ` — ${input.notes}` : ''}`,
        performedBy: actingUserId,
      });

      returnDoc.custodyMovementId = inMovement._id;
      await returnDoc.save();

      // Update cachedBalance
      const { currentBalance } = await CustodyService.getDerivedAccountBalance(destinationAccount._id);
      destinationAccount.cachedBalance = currentBalance;
      await destinationAccount.save();
    }

    // 3. Recalculate derived status and update project
    const calculation = await InvestmentCalculationService.calculateExpectedProfit(project._id, maturityDate);
    project.status = calculation.derivedStatus;
    if (!project.maturityDate) {
      project.maturityDate = maturityDate;
    }
    await project.save();

    // 4. Audit Log
    await AuditLog.create({
      performedBy: actingUserId,
      action: 'RECORD_INVESTMENT_RETURN',
      entityName: 'InvestmentReturn',
      entityId: returnDoc._id,
      afterState: {
        projectId: project.projectId,
        projectName: project.name,
        principalReturned,
        actualProfit,
        actualLoss,
        totalReturn,
        destination: destinationAccount?.name || input.destinationType,
        derivedStatus: calculation.derivedStatus,
      },
      reason: `Recorded return for ${project.name}: Principal ৳${principalReturned.toLocaleString()}, Profit ৳${actualProfit.toLocaleString()}`,
    });

    return {
      project,
      investmentReturn: returnDoc,
      inMovement,
      totalReturn,
      calculation,
    };
  }

  /**
   * Reinvest Wallet Custody Funds into a New Project
   * Uses organization wallet balance + optional fresh accountant custody top-up
   */
  static async reinvestProjectFunds(
    input: {
      sourceProjectId?: string | null;
      destinationProjectId: string;
      walletAccountId: string;
      reinvestedAmount: number;
      newAccountantFunds?: number;
      newAccountantCustodyAccountId?: string;
      date?: string | Date;
      notes?: string;
    },
    actingUser: IUser
  ) {
    const { sourceProjectId, destinationProjectId, walletAccountId, reinvestedAmount } = input;

    if (!reinvestedAmount || reinvestedAmount <= 0) {
      throw createError('Reinvested amount must be greater than 0', 400);
    }

    if (sourceProjectId && sourceProjectId === destinationProjectId) {
      throw createError('Source and destination projects must be different', 400);
    }

    const [sourceProject, destProject, walletAccount] = await Promise.all([
      sourceProjectId ? InvestmentProject.findById(sourceProjectId) : Promise.resolve(null),
      InvestmentProject.findById(destinationProjectId),
      CustodyAccount.findById(walletAccountId),
    ]);

    if (sourceProjectId && !sourceProject) throw createError('Source investment project not found', 404);
    if (!destProject) throw createError('Destination investment project not found', 404);
    if (!walletAccount || !walletAccount.isActive) throw createError('Wallet custody account not found', 404);

    // Verify wallet has sufficient derived balance
    const { currentBalance: walletBal } = await CustodyService.getDerivedAccountBalance(walletAccount._id);
    if (walletBal < reinvestedAmount) {
      throw createError(
        `Insufficient balance in ${walletAccount.name}. Available: ৳${walletBal.toLocaleString()}, Requested: ৳${reinvestedAmount.toLocaleString()}`,
        400
      );
    }

    const newAccountantFunds = Number(input.newAccountantFunds) || 0;
    let accountantAccount = null;

    if (newAccountantFunds > 0) {
      if (!input.newAccountantCustodyAccountId) {
        throw createError('New accountant custody account ID required when adding fresh funds', 400);
      }
      accountantAccount = await CustodyAccount.findById(input.newAccountantCustodyAccountId);
      if (!accountantAccount || !accountantAccount.isActive) {
        throw createError('New accountant custody account not found or inactive', 404);
      }

      const { currentBalance: accBal } = await CustodyService.getDerivedAccountBalance(accountantAccount._id);
      if (accBal < newAccountantFunds) {
        throw createError(
          `Insufficient funds in ${accountantAccount.name}. Available: ৳${accBal.toLocaleString()}, Requested: ৳${newAccountantFunds.toLocaleString()}`,
          400
        );
      }
    }

    const reinvestDate = input.date ? new Date(input.date) : new Date();
    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;
    const sourceLabel = sourceProject ? sourceProject.name : `${walletAccount.name} (Pooled Returns)`;

    // 1. Create Reinvestment record
    const reinvestment = await Reinvestment.create({
      sourceProjectId: sourceProject ? sourceProject._id : null,
      destinationProjectId: destProject._id,
      walletAccountId: walletAccount._id,
      reinvestedAmount,
      newAccountantFunds,
      newAccountantCustodyAccountId: accountantAccount ? accountantAccount._id : null,
      date: reinvestDate,
      notes: input.notes || `Reinvestment from ${sourceLabel} to ${destProject.name}`,
      approvedBy: actingUserId,
    });

    // 2. OUT movement from Wallet Account
    const walletMovement = await CustodyMovement.create({
      custodyAccountId: walletAccount._id,
      movementType: MovementType.OUT,
      amount: reinvestedAmount,
      sourceType: MovementSourceType.INVESTMENT_FUNDING,
      sourceRefId: reinvestment._id,
      date: reinvestDate,
      description: `Reinvestment Out to ${destProject.name} (${destProject.projectId})`,
      performedBy: actingUserId,
    });

    // 3. InvestmentFunding on Destination Project from Wallet
    await InvestmentFunding.create({
      projectId: destProject._id,
      custodyAccountId: walletAccount._id,
      amount: reinvestedAmount,
      date: reinvestDate,
      custodyMovementId: walletMovement._id,
      fundedBy: actingUserId,
      notes: `Reinvested wallet proceeds from ${sourceLabel}`,
    });

    // 4. If new accountant funds added, deduct from accountant custody
    let accountantMovement = null;
    if (accountantAccount && newAccountantFunds > 0) {
      accountantMovement = await CustodyMovement.create({
        custodyAccountId: accountantAccount._id,
        movementType: MovementType.OUT,
        amount: newAccountantFunds,
        sourceType: MovementSourceType.INVESTMENT_FUNDING,
        sourceRefId: reinvestment._id,
        date: reinvestDate,
        description: `New top-up funding for reinvestment in ${destProject.name} (${destProject.projectId})`,
        performedBy: actingUserId,
      });

      await InvestmentFunding.create({
        projectId: destProject._id,
        custodyAccountId: accountantAccount._id,
        amount: newAccountantFunds,
        date: reinvestDate,
        custodyMovementId: accountantMovement._id,
        fundedBy: actingUserId,
        notes: `New top-up funds for ${destProject.name}`,
      });

      const { currentBalance: newAccBal } = await CustodyService.getDerivedAccountBalance(accountantAccount._id);
      accountantAccount.cachedBalance = newAccBal;
      await accountantAccount.save();
    }

    // Update wallet cachedBalance
    const { currentBalance: newWalletBal } = await CustodyService.getDerivedAccountBalance(walletAccount._id);
    walletAccount.cachedBalance = newWalletBal;
    await walletAccount.save();

    // Increment destination project totalFunded & set ACTIVE
    const totalInvestedInDest = reinvestedAmount + newAccountantFunds;
    destProject.totalFunded += totalInvestedInDest;
    if (destProject.status === ProjectStatus.PROPOSED) {
      destProject.status = ProjectStatus.ACTIVE;
    }
    await destProject.save();

    // Audit Log
    await AuditLog.create({
      performedBy: actingUserId,
      action: 'REINVEST_FUNDS',
      entityName: 'Reinvestment',
      entityId: reinvestment._id,
      afterState: {
        fromProject: sourceLabel,
        toProject: destProject.name,
        reinvestedAmount,
        newAccountantFunds,
        total: totalInvestedInDest,
      },
      reason: `Reinvested ৳${reinvestedAmount.toLocaleString()} from ${sourceLabel} to ${destProject.name}`,
    });

    return {
      reinvestment,
      destProject,
      totalInvestedInDest,
    };
  }

  /**
   * List projects with dynamic funding, segmented profit calculations, search, and pagination
   */
  static async getProjects(filters?: {
    status?: string;
    category?: string;
    externalEntity?: string;
    org?: string;
    search?: string;
    page?: number;
    limit?: number;
    asOfDate?: string | Date;
  }) {
    const query: Record<string, unknown> = {};

    if (filters?.status && filters.status.trim()) {
      const s = filters.status.trim().toUpperCase();
      if (s === 'RUNNING' || s === 'ACTIVE') {
        query.status = { $in: [ProjectStatus.ACTIVE, ProjectStatus.PROPOSED] };
      } else if (s === 'MATURED') {
        query.status = { $in: [ProjectStatus.MATURED, ProjectStatus.FULLY_SETTLED] };
      } else if (s === 'WITHDRAWAL_REQUESTED') {
        query.status = ProjectStatus.WITHDRAWAL_REQUESTED;
      } else {
        query.status = filters.status;
      }
    }
    if (filters?.category) {
      query.category = filters.category;
    }
    const orgTarget = filters?.org || filters?.externalEntity;
    if (orgTarget && orgTarget.trim()) {
      query.externalEntity = { $regex: orgTarget.trim(), $options: 'i' };
    }
    if (filters?.search && filters.search.trim()) {
      const term = filters.search.trim();
      query.$or = [
        { invoiceNo: { $regex: term, $options: 'i' } },
        { projectId: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { externalEntity: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } },
      ];
    }

    const total = await InvestmentProject.countDocuments(query);
    const page = Math.max(1, Number(filters?.page) || 1);
    const limit = filters?.limit !== undefined ? Math.max(0, Number(filters.limit)) : 0;

    let projectQuery = InvestmentProject.find(query).sort({ startDate: -1, createdAt: -1 });
    if (limit > 0) {
      const skip = (page - 1) * limit;
      projectQuery = projectQuery.skip(skip).limit(limit);
    }

    const projects = await projectQuery.exec();

    // Attach computed segmented calculation & metrics for each project
    const items = await Promise.all(
      projects.map(async (prj) => {
        const calculation = await InvestmentCalculationService.calculateExpectedProfit(
          prj._id,
          filters?.asOfDate
        );
        const originalPrincipal = prj.totalFunded > 0 ? prj.totalFunded : prj.targetPrincipal;
        const netRealizedProfit = calculation.netRealizedProfit;
        const actualROI = originalPrincipal > 0 ? (netRealizedProfit / originalPrincipal) * 100 : 0;

        const hasWallet = (prj.walletReinvestedAmount || 0) > 0;
        const hasAccountant = (prj.accountantFundedAmount || 0) > 0;
        const fundingSourceType = hasWallet && hasAccountant ? 'MIXED' : hasWallet ? 'REINVESTMENT' : 'ACCOUNTANT';
        const totalExpectedReturn = Math.round((originalPrincipal + (calculation.expectedProfitAccrued || 0)) * 100) / 100;
        const remainingDue = Math.max(0, Math.round((totalExpectedReturn - calculation.totalReturnReceived) * 100) / 100);

        return {
          ...prj.toObject(),
          status: prj.status === ProjectStatus.WITHDRAWAL_REQUESTED && calculation.outstandingPrincipal > 0
            ? ProjectStatus.WITHDRAWAL_REQUESTED
            : calculation.derivedStatus,
          calculation,
          metrics: {
            totalPrincipalReturned: calculation.totalPrincipalReturned,
            outstandingPrincipal: calculation.outstandingPrincipal,
            expectedProfitAccrued: calculation.expectedProfitAccrued,
            actualProfitReturned: calculation.actualProfitReturned,
            expectedProfitOutstanding: calculation.expectedProfitOutstanding,
            totalReturnReceived: calculation.totalReturnReceived,
            netOutstandingCapital: calculation.outstandingPrincipal,
            totalProfitRealized: calculation.actualProfitReturned,
            totalLosses: calculation.actualLosses,
            netRealizedProfit,
            actualROI: Math.round(actualROI * 100) / 100,
            isOverdue: calculation.isOverdue,
            overdueDays: calculation.overdueDays,
            walletReinvestedAmount: prj.walletReinvestedAmount || 0,
            accountantFundedAmount: prj.accountantFundedAmount || 0,
            withdrawalRequestedAmount: prj.withdrawalRequestedAmount,
            withdrawalRequestedDate: prj.withdrawalRequestedDate,
            withdrawalNotes: prj.withdrawalNotes,
            fundingSourceType,
            totalExpectedReturn,
            remainingDue,
          },
        };
      })
    );

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

    return {
      items,
      total,
      page,
      limit: limit > 0 ? limit : total,
      totalPages,
    };
  }

  /**
   * Get single project detail with complete funding & return breakdowns and calculation
   */
  static async getProjectById(projectId: string | Types.ObjectId, asOfDate?: string | Date) {
    const project = await InvestmentProject.findById(projectId);
    if (!project) {
      throw createError('Investment project not found', 404);
    }

    const [fundings, returns, reinvestments, calculation] = await Promise.all([
      InvestmentFunding.find({ projectId: project._id })
        .populate({
          path: 'custodyAccountId',
          select: 'name channel accountNumber holderId',
          populate: { path: 'holderId', select: 'name email accountantType' },
        })
        .populate('fundedBy', 'name email')
        .sort({ date: -1, createdAt: -1 }),
      InvestmentReturn.find({ projectId: project._id })
        .populate({
          path: 'destinationCustodyAccountId',
          select: 'name channel accountNumber holderId',
          populate: { path: 'holderId', select: 'name email accountantType' },
        })
        .populate('recordedBy', 'name email')
        .populate('receiverId', 'name email role accountantType')
        .sort({ maturityDate: 1, installmentNumber: 1 }),
      Reinvestment.find({
        $or: [{ sourceProjectId: project._id }, { destinationProjectId: project._id }],
      })
        .populate('sourceProjectId', 'name projectId')
        .populate('destinationProjectId', 'name projectId')
        .populate('walletAccountId', 'name channel')
        .populate('approvedBy', 'name email')
        .sort({ date: -1 }),
      InvestmentCalculationService.calculateExpectedProfit(project._id, asOfDate),
    ]);

    const originalPrincipal = project.totalFunded > 0 ? project.totalFunded : project.targetPrincipal;
    const actualROI = originalPrincipal > 0 ? (calculation.netRealizedProfit / originalPrincipal) * 100 : 0;
    const hasWallet = (project.walletReinvestedAmount || 0) > 0;
    const hasAccountant = (project.accountantFundedAmount || 0) > 0;
    const fundingSourceType = hasWallet && hasAccountant ? 'MIXED' : hasWallet ? 'REINVESTMENT' : 'ACCOUNTANT';
    const totalExpectedReturn = Math.round((originalPrincipal + (calculation.expectedProfitAccrued || 0)) * 100) / 100;
    const remainingDue = Math.max(0, Math.round((totalExpectedReturn - calculation.totalReturnReceived) * 100) / 100);

    return {
      project: {
        ...project.toObject(),
        status: project.status === ProjectStatus.WITHDRAWAL_REQUESTED && calculation.outstandingPrincipal > 0
          ? ProjectStatus.WITHDRAWAL_REQUESTED
          : calculation.derivedStatus,
        calculation,
        metrics: {
          totalPrincipalReturned: calculation.totalPrincipalReturned,
          outstandingPrincipal: calculation.outstandingPrincipal,
          expectedProfitAccrued: calculation.expectedProfitAccrued,
          actualProfitReturned: calculation.actualProfitReturned,
          expectedProfitOutstanding: calculation.expectedProfitOutstanding,
          totalReturnReceived: calculation.totalReturnReceived,
          netOutstandingCapital: calculation.outstandingPrincipal,
          totalProfitRealized: calculation.actualProfitReturned,
          totalLosses: calculation.actualLosses,
          netRealizedProfit: calculation.netRealizedProfit,
          actualROI: Math.round(actualROI * 100) / 100,
          isOverdue: calculation.isOverdue,
          overdueDays: calculation.overdueDays,
          walletReinvestedAmount: project.walletReinvestedAmount || 0,
          accountantFundedAmount: project.accountantFundedAmount || 0,
          withdrawalRequestedAmount: project.withdrawalRequestedAmount,
          withdrawalRequestedDate: project.withdrawalRequestedDate,
          withdrawalNotes: project.withdrawalNotes,
          fundingSourceType,
          totalExpectedReturn,
          remainingDue,
        },
      },
      calculation,
      fundings,
      returns,
      reinvestments,
    };
  }

  /**
   * Update Project Status (e.g. from ACTIVE to CLOSED or DEFAULTED)
   */
  static async updateProjectStatus(
    projectId: string,
    status: ProjectStatus,
    notes: string,
    actingUser: IUser
  ) {
    const project = await InvestmentProject.findById(projectId);
    if (!project) {
      throw createError('Investment project not found', 404);
    }

    if (status === ProjectStatus.CLOSED) {
      const calculation = await InvestmentCalculationService.calculateExpectedProfit(project._id);
      if (calculation.outstandingPrincipal > 0) {
        throw createError(`Project cannot be closed while ৳${calculation.outstandingPrincipal.toLocaleString()} principal remains outstanding. Record the return, mark it defaulted, or keep the project open.`, 400);
      }
    }

    const previousStatus = project.status;
    project.status = status;
    await project.save();

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;
    await AuditLog.create({
      performedBy: actingUserId,
      action: 'UPDATE_PROJECT_STATUS',
      entityName: 'InvestmentProject',
      entityId: project._id,
      beforeState: { status: previousStatus },
      afterState: { status, notes },
      reason: `Changed project ${project.projectId} status to ${status}`,
    });

    return project;
  }

  /**
   * Portfolio-Wide Investment Metrics
   */
  static async getInvestmentStats() {
    const [projects, returns, fundings] = await Promise.all([
      InvestmentProject.find(),
      InvestmentReturn.find(),
      InvestmentFunding.find(),
    ]);

    let totalCapitalInvested = 0;
    let totalTargetPrincipal = 0;
    let activeProjectsCount = 0;
    let maturedProjectsCount = 0;
    let proposedProjectsCount = 0;

    for (const prj of projects) {
      totalCapitalInvested += prj.totalFunded;
      totalTargetPrincipal += prj.targetPrincipal;

      if (prj.status === ProjectStatus.ACTIVE) activeProjectsCount++;
      else if (prj.status === ProjectStatus.MATURED) maturedProjectsCount++;
      else if (prj.status === ProjectStatus.PROPOSED) proposedProjectsCount++;
    }

    let totalPrincipalReturned = 0;
    let totalProfitRealized = 0;
    let totalLosses = 0;

    for (const ret of returns) {
      totalPrincipalReturned += ret.principalReturned;
      totalProfitRealized += ret.actualProfit;
      totalLosses += ret.actualLoss;
    }

    const activeDeployedCapital = Math.max(0, totalCapitalInvested - totalPrincipalReturned);
    const netRealizedProfit = totalProfitRealized - totalLosses;
    const overallROI = totalCapitalInvested > 0 ? (netRealizedProfit / totalCapitalInvested) * 100 : 0;

    return {
      totalProjectsCount: projects.length,
      activeProjectsCount,
      maturedProjectsCount,
      proposedProjectsCount,
      totalCapitalInvested,
      totalTargetPrincipal,
      activeDeployedCapital,
      totalPrincipalReturned,
      totalProfitRealized,
      totalLosses,
      netRealizedProfit,
      overallROI: Math.round(overallROI * 100) / 100,
      totalFundingEventsCount: fundings.length,
      totalReturnEventsCount: returns.length,
    };
  }

  /** Portfolio reconciliation for management review; every amount is derived
   * from immutable funding, return, and custody records. */
  static async getPortfolioReconciliation() {
    const projects = await this.getProjects({ limit: 0 });
    const rows = projects.items.map((project: any) => ({
      projectId: project.projectId,
      name: project.name,
      status: project.status,
      invested: Number(project.totalFunded || 0),
      principalReturned: Number(project.metrics?.totalPrincipalReturned || 0),
      profit: Number(project.metrics?.actualProfitReturned || 0),
      loss: Number(project.metrics?.totalLosses || 0),
      netProfit: Number(project.metrics?.netRealizedProfit || 0),
      outstandingPrincipal: Number(project.metrics?.outstandingPrincipal || 0),
      walletReinvested: Number(project.metrics?.walletReinvestedAmount || 0),
      accountantFunded: Number(project.metrics?.accountantFundedAmount || 0),
      totalReturned: Number(project.metrics?.totalReturnReceived || 0),
    }));
    const totals = rows.reduce((sum, row) => ({
      invested: sum.invested + row.invested, principalReturned: sum.principalReturned + row.principalReturned,
      profit: sum.profit + row.profit, loss: sum.loss + row.loss, netProfit: sum.netProfit + row.netProfit,
      outstandingPrincipal: sum.outstandingPrincipal + row.outstandingPrincipal, walletReinvested: sum.walletReinvested + row.walletReinvested,
      accountantFunded: sum.accountantFunded + row.accountantFunded, totalReturned: sum.totalReturned + row.totalReturned,
    }), { invested: 0, principalReturned: 0, profit: 0, loss: 0, netProfit: 0, outstandingPrincipal: 0, walletReinvested: 0, accountantFunded: 0, totalReturned: 0 });
    return { rows, totals };
  }

  /**
   * Record a Random / Partial Installment Return to an Accountant
   * Supports random batch returns with sender, payment method, responsible accountant,
   * custody account deposit, and dynamic remaining due calculation.
   */
  static async recordInstallmentReturn(
    input: {
      projectId: string;
      installmentNumber?: number;
      batchTitle?: string;
      date?: string | Date;
      amount: number;
      principalReturned?: number;
      actualProfit?: number;
      actualLoss?: number;
      paymentMethod?: PaymentMethod;
      senderName?: string;
      receiverId?: string;
      destinationCustodyAccountId?: string;
      notes?: string;
      transactionRef?: string;
      idempotencyKey?: string;
    },
    actingUser: IUser
  ) {
    const project = await InvestmentProject.findById(input.projectId);
    if (!project) {
      throw createError('Investment project not found', 404);
    }

    const totalAmount = Math.max(0, Number(input.amount) || 0);
    if (totalAmount <= 0) {
      throw createError('Installment amount must be greater than 0', 400);
    }

    const returnDate = input.date ? new Date(input.date) : new Date();

    // Check existing returns for this project
    const existingReturns = await InvestmentReturn.find({ projectId: project._id }).sort({
      maturityDate: 1,
      installmentNumber: 1,
    });
    const existingPrincipalReturned = existingReturns.reduce(
      (sum, r) => sum + (Number(r.principalReturned) || 0),
      0
    );
    const existingProfitReturned = existingReturns.reduce(
      (sum, r) => sum + (Number(r.actualProfit) || 0),
      0
    );
    const existingTotalReturned = existingReturns.reduce(
      (sum, r) => sum + (Number(r.totalReturn) || 0),
      0
    );

    const originalPrincipal = project.totalFunded > 0 ? project.totalFunded : project.targetPrincipal;
    const roiPercent = project.expectedAnnualRoiPercent ?? project.expectedROI ?? 0;
    const calculation = await InvestmentCalculationService.calculateExpectedProfit(project._id, returnDate);
    const totalExpectedProfit =
      calculation.expectedProfitAccrued || Math.round(originalPrincipal * (roiPercent / 100) * 100) / 100;
    const totalExpectedReturn = originalPrincipal + totalExpectedProfit;

    let pReturned = input.principalReturned !== undefined ? Number(input.principalReturned) : undefined;
    let profitReturned = input.actualProfit !== undefined ? Number(input.actualProfit) : undefined;
    const actualLoss = Math.max(0, Number(input.actualLoss) || 0);

    if (pReturned === undefined && profitReturned === undefined) {
      // Allocate to unpaid accrued profit first, then to principal
      const remainingProfitAccrued = Math.max(0, totalExpectedProfit - existingProfitReturned);
      if (totalAmount <= remainingProfitAccrued) {
        profitReturned = totalAmount;
        pReturned = 0;
      } else {
        profitReturned = remainingProfitAccrued;
        pReturned = totalAmount - remainingProfitAccrued;
      }
    } else {
      pReturned = Math.max(0, pReturned || 0);
      profitReturned = Math.max(0, profitReturned || 0);
      if (pReturned + profitReturned - actualLoss !== totalAmount) {
        throw createError(
          `Sum of principal (৳${pReturned}) + profit (৳${profitReturned}) - loss (৳${actualLoss}) must equal total installment amount (৳${totalAmount})`,
          400
        );
      }
    }

    const installmentNumber = input.installmentNumber || existingReturns.length + 1;
    const suffix =
      installmentNumber === 1
        ? 'st'
        : installmentNumber === 2
        ? 'nd'
        : installmentNumber === 3
        ? 'rd'
        : 'th';
    const batchTitle = input.batchTitle?.trim() || `Investment return ${installmentNumber}${suffix} batch`;

    const newTotalReturned = existingTotalReturned + totalAmount;
    const remainingDueAfter = Math.max(
      0,
      Math.round((totalExpectedReturn - newTotalReturned) * 100) / 100
    );

    let destinationAccount = null;
    if (input.destinationCustodyAccountId) {
      destinationAccount = await CustodyAccount.findById(input.destinationCustodyAccountId);
      if (!destinationAccount || !destinationAccount.isActive) {
        throw createError('Destination custody account not found or inactive', 400);
      }
    }

    let receiverUser = null;
    if (input.receiverId) {
      receiverUser = await User.findById(input.receiverId);
    }

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;

    // 1. Create InvestmentReturn record
    const returnDoc = await InvestmentReturn.create({
      projectId: project._id,
      installmentNumber,
      batchTitle,
      maturityDate: returnDate,
      principalReturned: pReturned,
      actualProfit: profitReturned,
      actualLoss,
      totalReturn: totalAmount,
      senderName: input.senderName?.trim() || undefined,
      paymentMethod: input.paymentMethod || PaymentMethod.BANK_TRANSFER,
      receiverId: receiverUser ? receiverUser._id : undefined,
      remainingDueAfter,
      destinationType: destinationAccount
        ? destinationAccount.accountType === AccountType.EXTERNAL_WALLET
          ? ReturnDestinationType.EXTERNAL_WALLET
          : ReturnDestinationType.ACCOUNTANT_CUSTODY
        : ReturnDestinationType.ACCOUNTANT_CUSTODY,
      destinationCustodyAccountId: destinationAccount ? destinationAccount._id : null,
      notes:
        input.notes ||
        `${batchTitle}: ৳${totalAmount.toLocaleString()} received via ${input.paymentMethod || 'Bank'}`,
      transactionRef: input.transactionRef?.trim() || undefined,
      idempotencyKey: input.idempotencyKey?.trim() || undefined,
      recordedBy: actingUserId,
    });

    // 2. If deposited into custody account, create synchronized CustodyMovement (IN)
    if (destinationAccount && totalAmount > 0) {
      const inMovement = await CustodyMovement.create({
        custodyAccountId: destinationAccount._id,
        movementType: MovementType.IN,
        amount: totalAmount,
        sourceType: MovementSourceType.INVESTMENT_RETURN,
        sourceRefId: returnDoc._id,
        date: returnDate,
        description: `[${batchTitle}] Return from ${project.name} (${project.projectId}) [Principal: ৳${pReturned.toLocaleString()}, Profit: ৳${profitReturned.toLocaleString()}] - Receiver: ${receiverUser ? receiverUser.name : 'Accountant'} via ${input.paymentMethod || 'Bank'}${input.senderName ? ` (Sender: ${input.senderName})` : ''}`,
        performedBy: actingUserId,
      });

      returnDoc.custodyMovementId = inMovement._id;
      await returnDoc.save();

      // Update cached balance
      const { currentBalance } = await CustodyService.getDerivedAccountBalance(destinationAccount._id);
      destinationAccount.cachedBalance = currentBalance;
      await destinationAccount.save();
    }

    // 3. Update project status dynamically
    const updatedCalculation = await InvestmentCalculationService.calculateExpectedProfit(
      project._id,
      returnDate
    );
    if (updatedCalculation.outstandingPrincipal === 0) {
      project.status = ProjectStatus.FULLY_SETTLED;
    } else if (
      existingPrincipalReturned + pReturned > 0 &&
      project.status !== ProjectStatus.WITHDRAWAL_REQUESTED
    ) {
      project.status = ProjectStatus.PRINCIPAL_PARTIALLY_RETURNED;
    }
    await project.save();

    // 4. Audit Log
    await AuditLog.create({
      performedBy: actingUserId,
      action: 'RECORD_INVESTMENT_INSTALLMENT',
      entityName: 'InvestmentReturn',
      entityId: returnDoc._id,
      afterState: {
        projectId: project.projectId,
        projectName: project.name,
        installmentNumber,
        batchTitle,
        amount: totalAmount,
        principalReturned: pReturned,
        actualProfit: profitReturned,
        remainingDueAfter,
        senderName: input.senderName,
        paymentMethod: input.paymentMethod,
        receiver: receiverUser?.name,
        destinationAccount: destinationAccount?.name,
      },
      reason: `Recorded ${batchTitle} of ৳${totalAmount.toLocaleString()} for ${project.name}. Remaining due: ৳${remainingDueAfter.toLocaleString()}`,
    });

    return {
      success: true,
      project,
      returnDoc,
      installmentNumber,
      batchTitle,
      amount: totalAmount,
      principalReturned: pReturned,
      actualProfit: profitReturned,
      remainingDueAfter,
      totalExpectedReturn,
      newTotalReturned,
    };
  }

  /**
   * Request Full / Partial Withdrawal from an Organization or Project (e.g. Zayn Farm)
   */
  static async requestWithdrawal(
    input: {
      projectId?: string;
      orgName?: string;
      amount: number;
      date?: string | Date;
      notes?: string;
    },
    actingUser: IUser
  ) {
    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;
    const reqDate = input.date ? new Date(input.date) : new Date();
    const amount = Math.max(0, Number(input.amount) || 0);

    if (input.projectId) {
      const project = await InvestmentProject.findById(input.projectId);
      if (!project) throw createError('Project not found', 404);

      project.status = ProjectStatus.WITHDRAWAL_REQUESTED;
      project.withdrawalRequestedAmount = amount;
      project.withdrawalRequestedDate = reqDate;
      project.withdrawalNotes =
        input.notes || `Requested withdrawal of ৳${amount.toLocaleString()}`;
      await project.save();

      await AuditLog.create({
        performedBy: actingUserId,
        action: 'REQUEST_WITHDRAWAL',
        entityName: 'InvestmentProject',
        entityId: project._id,
        afterState: { status: project.status, amount },
        reason: project.withdrawalNotes,
      });

      return { success: true, count: 1, amount, projects: [project] };
    }

    if (input.orgName) {
      const projects = await InvestmentProject.find({
        externalEntity: { $regex: input.orgName.trim(), $options: 'i' },
      });

      for (const p of projects) {
        p.status = ProjectStatus.WITHDRAWAL_REQUESTED;
        p.withdrawalRequestedAmount = amount;
        p.withdrawalRequestedDate = reqDate;
        p.withdrawalNotes =
          input.notes ||
          `Full withdrawal requested from ${input.orgName}: ৳${amount.toLocaleString()} (Principal + Profit)`;
        await p.save();

        await AuditLog.create({
          performedBy: actingUserId,
          action: 'REQUEST_WITHDRAWAL',
          entityName: 'InvestmentProject',
          entityId: p._id,
          afterState: { status: p.status, amount },
          reason: p.withdrawalNotes,
        });
      }

      return { success: true, count: projects.length, amount, projects };
    }

    throw createError('Either projectId or orgName must be provided', 400);
  }

  /**
   * Financial returns are immutable. A correction first reverses the custody
   * receipt, then a new replacement return can be recorded with the right
   * amount or destination.
   */
  static async reverseProjectReturn(returnId: string, reason: string, actingUser: IUser) {
    if (!reason?.trim()) throw createError('A reversal reason is required.', 400);
    const returnDoc = await InvestmentReturn.findById(returnId);
    if (!returnDoc) throw createError('Investment return not found.', 404);
    if (returnDoc.reversedAt) throw createError('This investment return has already been reversed.', 409);
    if (!returnDoc.destinationCustodyAccountId) throw createError('The return has no destination account to reverse.', 400);

    const account = await CustodyAccount.findById(returnDoc.destinationCustodyAccountId);
    if (!account || !account.isActive) throw createError('Return destination account is unavailable for reversal.', 400);
    const balance = await CustodyService.getDerivedAccountBalance(account._id);
    if (balance.currentBalance < returnDoc.totalReturn) throw createError(`Cannot reverse: ${account.name} has insufficient available balance.`, 400);

    const performedBy = (actingUser as unknown as { _id: Types.ObjectId })._id;
    const reversalMovement = await CustodyMovement.create({
      custodyAccountId: account._id,
      movementType: MovementType.OUT,
      amount: returnDoc.totalReturn,
      sourceType: MovementSourceType.ADJUSTMENT,
      sourceRefId: returnDoc._id,
      date: new Date(),
      description: `Reversal of investment return ${returnDoc._id}: ${reason.trim()}`,
      performedBy,
    });
    returnDoc.reversedAt = new Date();
    returnDoc.reversedBy = performedBy;
    returnDoc.reversalReason = reason.trim();
    returnDoc.reversalMovementId = reversalMovement._id;
    await returnDoc.save();
    const refreshed = await CustodyService.getDerivedAccountBalance(account._id);
    account.cachedBalance = refreshed.currentBalance;
    await account.save();
    await AuditLog.create({ performedBy, action: 'REVERSE_INVESTMENT_RETURN', entityName: 'InvestmentReturn', entityId: returnDoc._id, beforeState: { totalReturn: returnDoc.totalReturn, destinationCustodyAccountId: account._id }, afterState: { reversedAt: returnDoc.reversedAt, reversalMovementId: reversalMovement._id }, reason: reason.trim() });
    return { returnDoc, reversalMovement, accountBalance: refreshed.currentBalance };
  }

  /**
   * Distinct Organizations and their portfolio metrics
   */
  static async getOrganizations() {
    const projects = await InvestmentProject.find().lean();
    const allReturns = await InvestmentReturn.find().lean();
    const orgMap = new Map<string, any>();

    for (const prj of projects) {
      const orgName = (prj.externalEntity || 'Unassigned').trim();
      let entry = orgMap.get(orgName);
      if (!entry) {
        entry = {
          name: orgName,
          projectCount: 0,
          activeCount: 0,
          maturedCount: 0,
          withdrawalRequestedCount: 0,
          totalInvested: 0,
          walletReinvested: 0,
          accountantFunded: 0,
          totalReturned: 0,
          actualProfitReturned: 0,
          remainingDue: 0,
          withdrawalRequestedAmount: 0,
        };
        orgMap.set(orgName, entry);
      }

      entry.projectCount++;
      entry.totalInvested += prj.totalFunded;
      entry.walletReinvested += prj.walletReinvestedAmount || 0;
      entry.accountantFunded += prj.accountantFundedAmount || 0;

      if (prj.status === ProjectStatus.WITHDRAWAL_REQUESTED) {
        entry.withdrawalRequestedCount++;
        if (prj.withdrawalRequestedAmount) {
          entry.withdrawalRequestedAmount = Math.max(
            entry.withdrawalRequestedAmount,
            prj.withdrawalRequestedAmount
          );
        }
      } else if (
        prj.status === ProjectStatus.ACTIVE ||
        prj.status === ProjectStatus.PROPOSED
      ) {
        entry.activeCount++;
      } else {
        entry.maturedCount++;
      }

      const prjReturns = allReturns.filter(
        (r) => String(r.projectId) === String(prj._id)
      );
      const pTotalReturn = prjReturns.reduce((s, r) => s + (r.totalReturn || 0), 0);
      const pProfitReturn = prjReturns.reduce((s, r) => s + (r.actualProfit || 0), 0);

      entry.totalReturned += pTotalReturn;
      entry.actualProfitReturned += pProfitReturn;
    }

    for (const entry of orgMap.values()) {
      entry.activeDeployedCapital = Math.max(
        0,
        entry.totalInvested - (entry.totalReturned - entry.actualProfitReturned)
      );
      entry.remainingDue = Math.max(0, entry.totalInvested - entry.totalReturned);
    }

    return Array.from(orgMap.values());
  }

  /**
   * Synchronize Authoritative Historical Investments from Excel Workbook
   * docs/updated-payments-files/NS Foundation Investments.xlsx
   */
  static async syncAuthoritativeInvestments(dryRun = false, actor: IUser) {
    const possiblePaths = [
      path.resolve(process.cwd(), 'docs', 'updated-payments-files', 'NS Foundation Investments.xlsx'),
      path.resolve(process.cwd(), '..', 'docs', 'updated-payments-files', 'NS Foundation Investments.xlsx'),
    ];
    const excelPath = possiblePaths.find((p) => fs.existsSync(p));
    if (!excelPath) {
      throw createError(
        `Authoritative investment workbook not found at ${possiblePaths[0]}`,
        404
      );
    }

    // Locate core actors
    let moinUser = await User.findOne({ email: 'admin@nsfoundation.org' });
    if (!moinUser) moinUser = await User.findOne({ name: { $regex: 'Moin', $options: 'i' } });
    let samratUser = await User.findOne({ email: 'assistant@nsfoundation.org' });
    if (!samratUser) samratUser = await User.findOne({ name: { $regex: 'Samrat', $options: 'i' } });

    if (!moinUser) {
      throw createError('Primary accountant Moin Uddin not found in database', 404);
    }

    // Locate or create Core Custody Accounts
    const getOrCreateAccount = async (
      name: string,
      channel: CustodyChannel,
      type: AccountType,
      holderId: any
    ) => {
      let acc = await CustodyAccount.findOne({ name });
      if (!acc && !dryRun) {
        acc = await CustodyAccount.create({
          name,
          channel,
          accountType: type,
          holderId: holderId ? holderId._id : null,
          accountNumber: `HIST-${channel}-${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase()}`,
          isActive: true,
          cachedBalance: 0,
        });
      }
      return acc;
    };

    let bankCustody = await CustodyAccount.findOne({ channel: CustodyChannel.BANK });
    if (!bankCustody && !dryRun) {
      bankCustody = await getOrCreateAccount(
        'Islami Bank Bangladesh Ltd (IBBL)',
        CustodyChannel.BANK,
        AccountType.ACCOUNTANT_CUSTODY,
        moinUser
      );
    }

    let moinBkashCustody = await CustodyAccount.findOne({
      channel: CustodyChannel.BKASH,
      holderId: moinUser._id,
    });
    if (!moinBkashCustody)
      moinBkashCustody = await CustodyAccount.findOne({ name: { $regex: 'Moin.*bKash', $options: 'i' } });
    if (!moinBkashCustody && !dryRun) {
      moinBkashCustody = await getOrCreateAccount(
        'Moin Uddin Personal bKash',
        CustodyChannel.BKASH,
        AccountType.ACCOUNTANT_CUSTODY,
        moinUser
      );
    }

    let samratNagadCustody = await CustodyAccount.findOne({ channel: CustodyChannel.NAGAD });
    if (!samratNagadCustody && !dryRun) {
      samratNagadCustody = await getOrCreateAccount(
        'Samrat Nagad Wallet',
        CustodyChannel.NAGAD,
        AccountType.ACCOUNTANT_CUSTODY,
        samratUser
      );
    }

    let samratBkashCustody = await CustodyAccount.findOne({
      channel: CustodyChannel.BKASH,
      holderId: samratUser?._id,
    });
    if (!samratBkashCustody)
      samratBkashCustody = await CustodyAccount.findOne({
        name: { $regex: 'Samrat.*bKash', $options: 'i' },
      });
    if (!samratBkashCustody && !dryRun) {
      samratBkashCustody = await getOrCreateAccount(
        'Samrat Personal bKash',
        CustodyChannel.BKASH,
        AccountType.ACCOUNTANT_CUSTODY,
        samratUser
      );
    }

    let moinCashCustody = await CustodyAccount.findOne({
      channel: CustodyChannel.CASH,
      name: { $not: /Samrat/i },
    });
    if (!moinCashCustody && !dryRun) {
      moinCashCustody = await getOrCreateAccount(
        'Physical Petty Cash',
        CustodyChannel.CASH,
        AccountType.ACCOUNTANT_CUSTODY,
        moinUser
      );
    }

    let growUpWallet = await CustodyAccount.findOne({ name: 'GrowUp Partner Wallet' });
    if (!growUpWallet && !dryRun) {
      growUpWallet = await getOrCreateAccount(
        'GrowUp Partner Wallet',
        CustodyChannel.WALLET,
        AccountType.EXTERNAL_WALLET,
        null
      );
    }

    let zaynWallet = await CustodyAccount.findOne({ name: 'Zayn Farm Partner Wallet' });
    if (!zaynWallet && !dryRun) {
      zaynWallet = await getOrCreateAccount(
        'Zayn Farm Partner Wallet',
        CustodyChannel.WALLET,
        AccountType.EXTERNAL_WALLET,
        null
      );
    }

    let hungryBirdsWallet = await CustodyAccount.findOne({
      name: 'Hungry Birds Barisal Partner Wallet',
    });
    if (!hungryBirdsWallet && !dryRun) {
      hungryBirdsWallet = await getOrCreateAccount(
        'Hungry Birds Barisal Partner Wallet',
        CustodyChannel.WALLET,
        AccountType.EXTERNAL_WALLET,
        null
      );
    }

    const wb = XLSX.readFile(excelPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    const parseExcelDate = (serial: any): Date => {
      if (!serial) return new Date();
      if (typeof serial === 'number') {
        const utcDays = Math.floor(serial - 25569);
        return new Date(utcDays * 86400 * 1000);
      }
      return new Date(serial);
    };

    let totalFunded = 0;
    let totalWallet = 0;
    let totalMoin = 0;
    let totalSamrat = 0;
    let totalProfitRealized = 0;
    const syncedProjects: any[] = [];

    for (let i = 2; i <= 21; i++) {
      const r = rawData[i];
      if (!r || !r[0]) continue;
      const sl = Number(r[0]);
      const invTo = String(r[1] || '').trim();
      const invNo = String(r[2] || '').trim();
      const amount = Number(r[4] || 0);
      const startDate = parseExcelDate(r[5]);
      const endDate = parseExcelDate(r[6]);
      const name = String(r[7] || '').trim();
      const duration = String(r[8] || '').trim();
      const annualRoiPercent = r[9] ? Number(r[9]) * 100 : 0;
      const org = String(r[12] || '').trim();
      const actualRoi = r[13] ? Number(r[13]) : 0;
      const walletAmount =
        r[16] && r[16] !== '-' && !isNaN(Number(r[16])) ? Number(r[16]) : 0;
      const moinAmount =
        r[17] && r[17] !== '-' && !isNaN(Number(r[17])) ? Number(r[17]) : 0;
      const samratAmount =
        r[18] && r[18] !== '-' && !isNaN(Number(r[18])) ? Number(r[18]) : 0;

      totalFunded += amount;
      totalWallet += walletAmount;
      totalMoin += moinAmount;
      totalSamrat += samratAmount;
      totalProfitRealized += actualRoi;

      const projectId =
        sl <= 11
          ? `PRJ-2024-${sl}`
          : sl <= 15
          ? `PRJ-2025-${sl}`
          : `PRJ-2026-${sl}`;

      let projectStatus: ProjectStatus = ProjectStatus.ACTIVE;
      if (org.toLowerCase().includes('zayn')) {
        projectStatus = ProjectStatus.WITHDRAWAL_REQUESTED;
      } else if (sl === 5 || sl === 19 || sl === 20) {
        projectStatus = ProjectStatus.ACTIVE;
      } else {
        projectStatus = ProjectStatus.MATURED;
      }

      syncedProjects.push({
        sl,
        projectId,
        name,
        org,
        amount,
        walletAmount,
        moinAmount,
        samratAmount,
        status: projectStatus,
        startDate,
        endDate,
        duration,
        annualRoiPercent,
        actualRoi,
      });

      if (!dryRun) {
        // Upsert InvestmentProject
        let project = await InvestmentProject.findOne({
          $or: [
            { projectId },
            { name, externalEntity: org },
            ...(invNo ? [{ invoiceNo: invNo }] : []),
          ],
        });

        const isZayn = org.toLowerCase().includes('zayn');

        if (!project) {
          project = await InvestmentProject.create({
            projectId,
            name,
            invoiceNo: invNo || undefined,
            invoiceTo: invTo || undefined,
            category: org.toLowerCase().includes('hungry')
              ? 'Restaurant / Trade'
              : org.toLowerCase().includes('zayn')
              ? 'Agro / Land Trading'
              : 'Agriculture',
            externalEntity: org,
            startDate,
            plannedDuration: duration || undefined,
            maturityDate: endDate,
            expectedAnnualRoiPercent: annualRoiPercent,
            expectedROI: annualRoiPercent,
            targetPrincipal: amount,
            totalFunded: amount,
            walletReinvestedAmount: walletAmount,
            accountantFundedAmount: moinAmount + samratAmount,
            withdrawalRequestedAmount: isZayn ? 256490 : undefined,
            withdrawalRequestedDate: isZayn ? new Date('2026-10-01') : undefined,
            withdrawalNotes: isZayn
              ? 'Requested full withdrawal of BDT 256,490 (past principal + profit) from Zayn Farm for reinvestment into new opportunities.'
              : undefined,
            status: projectStatus,
            createdBy: moinUser._id,
          });
        } else {
          project.name = name;
          project.targetPrincipal = amount;
          project.totalFunded = amount;
          project.startDate = startDate;
          project.maturityDate = endDate;
          project.plannedDuration = duration || project.plannedDuration;
          project.expectedAnnualRoiPercent = annualRoiPercent;
          project.expectedROI = annualRoiPercent;
          project.walletReinvestedAmount = walletAmount;
          project.accountantFundedAmount = moinAmount + samratAmount;
          project.externalEntity = org;
          if (invNo) project.invoiceNo = invNo;
          if (invTo) project.invoiceTo = invTo;
          project.status = projectStatus;
          if (isZayn) {
            project.withdrawalRequestedAmount = 256490;
            project.withdrawalRequestedDate = new Date('2026-10-01');
            project.withdrawalNotes =
              'Requested full withdrawal of BDT 256,490 (past principal + profit) from Zayn Farm for reinvestment into new opportunities.';
          }
          await project.save();
        }

        // Clean fundings for this project before re-inserting
        await InvestmentFunding.deleteMany({ projectId: project._id });
        await CustodyMovement.deleteMany({
          sourceRefId: project._id,
          sourceType: MovementSourceType.INVESTMENT_FUNDING,
        });

        // 1. Wallet funding
        if (walletAmount > 0) {
          const walletCustody =
            org.toLowerCase().includes('zayn') && sl === 18
              ? zaynWallet!
              : growUpWallet!;

          const fWallet = await InvestmentFunding.create({
            projectId: project._id,
            custodyAccountId: walletCustody._id,
            amount: walletAmount,
            date: startDate,
            transactionRef: invNo || '',
            fundedBy: moinUser._id,
            notes: `Wallet re-investment proceeds for ${name}`,
          });

          const movW = await CustodyMovement.create({
            custodyAccountId: walletCustody._id,
            movementType: MovementType.OUT,
            amount: walletAmount,
            sourceType: MovementSourceType.INVESTMENT_FUNDING,
            sourceRefId: project._id,
            date: startDate,
            description: `Wallet re-investment out to ${name} (${projectId})`,
            performedBy: moinUser._id,
          });

          fWallet.custodyMovementId = movW._id;
          await fWallet.save();
        }

        // 2. Moin funding
        if (moinAmount > 0) {
          let moinAcc = bankCustody!;
          if (sl === 4 || sl === 7 || sl === 8) {
            moinAcc = moinBkashCustody!;
          }

          const fMoin = await InvestmentFunding.create({
            projectId: project._id,
            custodyAccountId: moinAcc._id,
            amount: moinAmount,
            date: startDate,
            transactionRef: invNo || '',
            fundedBy: moinUser._id,
            notes: `Accountant contribution by Moin Uddin for ${name}`,
          });

          const movM = await CustodyMovement.create({
            custodyAccountId: moinAcc._id,
            movementType: MovementType.OUT,
            amount: moinAmount,
            sourceType: MovementSourceType.INVESTMENT_FUNDING,
            sourceRefId: project._id,
            date: startDate,
            description: `Investment funding into ${name} (${projectId}) by Moin Uddin`,
            performedBy: moinUser._id,
          });

          fMoin.custodyMovementId = movM._id;
          await fMoin.save();
        }

        // 3. Samrat funding
        if (samratAmount > 0) {
          let samratAcc = samratNagadCustody!;
          if (sl === 5) {
            samratAcc = moinCashCustody!;
          } else if (sl === 7 || sl === 8) {
            samratAcc = samratBkashCustody!;
          }

          const fSamrat = await InvestmentFunding.create({
            projectId: project._id,
            custodyAccountId: samratAcc._id,
            amount: samratAmount,
            date: startDate,
            transactionRef: invNo || '',
            fundedBy: samratUser ? samratUser._id : moinUser._id,
            notes: `Accountant contribution by Nurul Amin Samrat for ${name}`,
          });

          const movS = await CustodyMovement.create({
            custodyAccountId: samratAcc._id,
            movementType: MovementType.OUT,
            amount: samratAmount,
            sourceType: MovementSourceType.INVESTMENT_FUNDING,
            sourceRefId: project._id,
            date: startDate,
            description: `Investment funding into ${name} (${projectId}) by Samrat`,
            performedBy: samratUser ? samratUser._id : moinUser._id,
          });

          fSamrat.custodyMovementId = movS._id;
          await fSamrat.save();
        }

        // Returns synchronization
        // Clean existing returns and their movements
        const oldReturns = await InvestmentReturn.find({ projectId: project._id });
        const oldReturnIds = oldReturns.map((o) => o._id);
        await CustodyMovement.deleteMany({
          sourceRefId: { $in: oldReturnIds },
          sourceType: MovementSourceType.INVESTMENT_RETURN,
        });
        await InvestmentReturn.deleteMany({ projectId: project._id });

        if (sl === 5) {
          // Hungry Birds 5 installment batches
          const hbInstallments = [
            {
              installmentNumber: 1,
              batchTitle: 'Investment return 1st batch',
              maturityDate: new Date('2025-01-15'),
              amount: 2500,
              principal: 0,
              profit: 2500,
              remainingDueAfter: 68300,
              notes: 'Investment return 1st batch: 2500/= tk',
            },
            {
              installmentNumber: 2,
              batchTitle: 'Investment return 2nd batch',
              maturityDate: new Date('2025-10-01'),
              amount: 6000,
              principal: 0,
              profit: 6000,
              remainingDueAfter: 62300,
              notes: 'Investment return 2nd batch: 6000/= tk date: 1/10/25',
            },
            {
              installmentNumber: 3,
              batchTitle: 'Investment return 3rd batch',
              maturityDate: new Date('2026-04-23'),
              amount: 1500,
              principal: 0,
              profit: 1500,
              remainingDueAfter: 60800,
              notes: 'Investment return 3rd batch: 1500/= tk date: 23/04/26',
            },
            {
              installmentNumber: 4,
              batchTitle: 'Investment return 4th batch',
              maturityDate: new Date('2026-04-25'),
              amount: 2500,
              principal: 1700,
              profit: 800,
              remainingDueAfter: 58300,
              notes: 'Investment return 4th batch: 2500/= tk date: 25/04/26',
            },
            {
              installmentNumber: 5,
              batchTitle: 'Investment return 5th batch',
              maturityDate: new Date('2026-08-05'),
              amount: 5600,
              principal: 5600,
              profit: 0,
              remainingDueAfter: 52700,
              notes: 'Investment return 5th batch: 5600/= tk date: 5/08/26',
            },
          ];

          for (const item of hbInstallments) {
            const rDoc = await InvestmentReturn.create({
              projectId: project._id,
              installmentNumber: item.installmentNumber,
              batchTitle: item.batchTitle,
              maturityDate: item.maturityDate,
              principalReturned: item.principal,
              actualProfit: item.profit,
              actualLoss: 0,
              totalReturn: item.amount,
              senderName: 'Abu Bakar Rohan',
              paymentMethod: PaymentMethod.BANK_TRANSFER,
              receiverId: moinUser._id,
              remainingDueAfter: item.remainingDueAfter,
              destinationType: ReturnDestinationType.ACCOUNTANT_CUSTODY,
              destinationCustodyAccountId: bankCustody!._id,
              notes: item.notes,
              recordedBy: moinUser._id,
            });

            const inMov = await CustodyMovement.create({
              custodyAccountId: bankCustody!._id,
              movementType: MovementType.IN,
              amount: item.amount,
              sourceType: MovementSourceType.INVESTMENT_RETURN,
              sourceRefId: rDoc._id,
              date: item.maturityDate,
              description: `[${item.batchTitle}] Return from Hungry Birds Restaurant (TK ${item.amount}/-) - Received by Moin via Bank (Sender: Abu Bakar Rohan)`,
              performedBy: moinUser._id,
            });

            rDoc.custodyMovementId = inMov._id;
            await rDoc.save();
          }
        } else if (
          org.toLowerCase().includes('growup') &&
          projectStatus === ProjectStatus.MATURED
        ) {
          // Matured GrowUp project return into GrowUp Partner Wallet
          const rDoc = await InvestmentReturn.create({
            projectId: project._id,
            maturityDate: endDate,
            principalReturned: amount,
            actualProfit: actualRoi,
            actualLoss: 0,
            totalReturn: amount + actualRoi,
            destinationType: ReturnDestinationType.EXTERNAL_WALLET,
            destinationCustodyAccountId: growUpWallet!._id,
            notes: `Matured return for ${name} into GrowUp Partner Wallet`,
            recordedBy: moinUser._id,
          });

          const inMov = await CustodyMovement.create({
            custodyAccountId: growUpWallet!._id,
            movementType: MovementType.IN,
            amount: amount + actualRoi,
            sourceType: MovementSourceType.INVESTMENT_RETURN,
            sourceRefId: rDoc._id,
            date: endDate,
            description: `Matured return inflow for ${name} into GrowUp Partner Wallet (Principal: ৳${amount.toLocaleString()}, Profit: ৳${actualRoi.toLocaleString()})`,
            performedBy: moinUser._id,
          });

          rDoc.custodyMovementId = inMov._id;
          await rDoc.save();
        } else if (sl === 15) {
          // Land Trading -4 matured return into Zayn Farm Wallet (which partially funded Project 18)
          const rDoc = await InvestmentReturn.create({
            projectId: project._id,
            maturityDate: endDate,
            principalReturned: 100000,
            actualProfit: 20000,
            actualLoss: 0,
            totalReturn: 120000,
            destinationType: ReturnDestinationType.EXTERNAL_WALLET,
            destinationCustodyAccountId: zaynWallet!._id,
            notes: `Matured proceeds for Land Trading -4 into Zayn Farm Partner Wallet`,
            recordedBy: moinUser._id,
          });

          const inMov = await CustodyMovement.create({
            custodyAccountId: zaynWallet!._id,
            movementType: MovementType.IN,
            amount: 120000,
            sourceType: MovementSourceType.INVESTMENT_RETURN,
            sourceRefId: rDoc._id,
            date: endDate,
            description: `Matured return inflow for Land Trading -4 into Zayn Farm Wallet (Principal: ৳100,000, Profit: ৳20,000)`,
            performedBy: moinUser._id,
          });

          rDoc.custodyMovementId = inMov._id;
          await rDoc.save();
        }
      }
    }

    // Persist into Staged Migration Database (MigrationBatch & MigrationRecord)
    try {
      let batch = await MigrationBatch.findOne({ sourceReference: 'NS Foundation Investments.xlsx' });
      if (!batch) {
        batch = await MigrationBatch.create({
          name: 'Authoritative Historical Investments & Returns (20 Projects)',
          sourceYear: 2024,
          sourceSheet: wb.SheetNames[0] || 'Investments',
          sourceReference: 'NS Foundation Investments.xlsx',
          totalRows: syncedProjects.length,
          verifiedRows: syncedProjects.length,
          reviewRows: 0,
          unresolvedRows: 0,
          createdBy: moinUser._id,
        });
      } else {
        batch.totalRows = syncedProjects.length;
        batch.verifiedRows = syncedProjects.length;
        await batch.save();
      }

      await MigrationRecord.deleteMany({ batchId: batch._id });
      const migrationRecords = syncedProjects.map((p, idx) => ({
        batchId: batch!._id,
        rowNumber: idx + 1,
        recordType: 'INVESTMENT_RETURN' as const,
        status: MigrationRecordStatus.VERIFIED,
        sourceYear: p.startDate.getFullYear(),
        sourceSheet: wb.SheetNames[0] || 'Investments',
        sourceRow: p.sl + 2,
        sourceReference: p.projectId,
        rawData: {
          sl: String(p.sl),
          projectId: p.projectId,
          name: p.name,
          org: p.org,
          amount: String(p.amount),
          walletAmount: String(p.walletAmount),
          moinAmount: String(p.moinAmount),
          samratAmount: String(p.samratAmount),
          status: p.status,
          duration: p.duration,
          roi: String(p.annualRoiPercent),
        },
        normalizedData: {
          projectId: p.projectId,
          name: p.name,
          category: p.org.toLowerCase().includes('hungry')
            ? 'Restaurant / Trade'
            : p.org.toLowerCase().includes('zayn')
            ? 'Agro / Land Trading'
            : 'Agriculture',
          externalEntity: p.org,
          totalFunded: p.amount,
          walletReinvestedAmount: p.walletAmount,
          accountantFundedAmount: p.moinAmount + p.samratAmount,
          startDate: p.startDate,
          maturityDate: p.endDate,
          plannedDuration: p.duration,
          expectedAnnualRoiPercent: p.annualRoiPercent,
          status: p.status,
          profitRealized: p.actualRoi,
        },
        validationErrors: [],
        reviewedBy: moinUser._id,
        reviewedAt: new Date(),
      }));
      await MigrationRecord.insertMany(migrationRecords);
    } catch (stageErr) {
      console.error('Failed to update staged migration database:', stageErr);
    }

    if (!dryRun) {
      // Rebalance all custody accounts
      const allAccounts = await CustodyAccount.find();
      for (const acc of allAccounts) {
        const { currentBalance } = await CustodyService.getDerivedAccountBalance(acc._id);
        acc.cachedBalance = currentBalance;
        await acc.save();
      }

      await AuditLog.create({
        performedBy: (actor as any)._id,
        action: 'SYNC_AUTHORITATIVE_INVESTMENTS',
        entityName: 'InvestmentProject',
        reason:
          'Synchronized 20 authoritative historical investment projects, 5 Hungry Birds installments, and Zayn Farm withdrawal request from NS Foundation Investments.xlsx.',
        afterState: {
          totalProjects: syncedProjects.length,
          totalFunded,
          totalWallet,
          totalMoin,
          totalSamrat,
          totalProfitRealized,
        },
      });
    }

    return {
      dryRun,
      totalProjects: syncedProjects.length,
      totalFunded,
      totalWallet,
      totalMoin,
      totalSamrat,
      accountantsTotal: totalMoin + totalSamrat,
      totalProfitRealized,
      syncedProjects,
      status: 'SUCCESS',
      message: dryRun
        ? `Preview: Found 20 authoritative investment projects (Total: ৳${totalFunded.toLocaleString()}: Wallet: ৳${totalWallet.toLocaleString()}, Moin: ৳${totalMoin.toLocaleString()}, Samrat: ৳${totalSamrat.toLocaleString()}). Ready to sync.`
        : `Successfully synchronized 20 investment projects, 5 Hungry Birds installments (Due: ৳52,700), and Zayn Farm withdrawal request (৳256,490) with balanced custody.`,
    };
  }
}
