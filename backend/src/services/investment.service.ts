import { Types } from 'mongoose';
import { InvestmentProject } from '../models/InvestmentProject.js';
import { InvestmentFunding } from '../models/InvestmentFunding.js';
import { InvestmentReturn } from '../models/InvestmentReturn.js';
import { Reinvestment } from '../models/Reinvestment.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { AuditLog } from '../models/AuditLog.js';
import { CustodyService } from './custody.service.js';
import {
  ProjectStatus,
  ReturnDestinationType,
  MovementType,
  MovementSourceType,
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
      startDate: string | Date;
      maturityDate?: string | Date;
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

    const project = await InvestmentProject.create({
      projectId,
      name: input.name.trim(),
      description: input.description?.trim() || '',
      category: input.category?.trim() || 'General',
      externalEntity: input.externalEntity?.trim() || '',
      startDate,
      maturityDate: input.maturityDate ? new Date(input.maturityDate) : undefined,
      expectedROI: input.expectedROI !== undefined ? Number(input.expectedROI) : undefined,
      targetPrincipal: Number(input.targetPrincipal),
      totalFunded: 0,
      status: ProjectStatus.PROPOSED,
    });

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;

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
    },
    actingUser: IUser
  ) {
    const project = await InvestmentProject.findById(input.projectId);
    if (!project) {
      throw createError('Investment project not found', 404);
    }

    const principalReturned = Math.max(0, Number(input.principalReturned) || 0);
    const actualProfit = Math.max(0, Number(input.actualProfit) || 0);
    const actualLoss = Math.max(0, Number(input.actualLoss) || 0);
    const totalReturn = principalReturned + actualProfit - actualLoss;

    if (totalReturn <= 0 && principalReturned === 0 && actualLoss === 0) {
      throw createError('Return amount or loss must be specified', 400);
    }

    let destinationAccount = null;
    if (input.destinationCustodyAccountId) {
      destinationAccount = await CustodyAccount.findById(input.destinationCustodyAccountId);
      if (!destinationAccount || !destinationAccount.isActive) {
        throw createError('Destination custody account not found or inactive', 400);
      }
    }

    const maturityDate = input.maturityDate ? new Date(input.maturityDate) : new Date();
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
      recordedBy: actingUserId,
    });

    // 2. If funds deposited into an accountant custody account or external wallet, create CustodyMovement (IN)
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

    // 3. Update project status to MATURED
    project.status = ProjectStatus.MATURED;
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
      },
      reason: `Recorded return for ${project.name}: Principal ৳${principalReturned.toLocaleString()}, Profit ৳${actualProfit.toLocaleString()}`,
    });

    return {
      project,
      investmentReturn: returnDoc,
      inMovement,
      totalReturn,
    };
  }

  /**
   * Reinvest Wallet Custody Funds into a New Project
   * Uses organization wallet balance + optional fresh accountant custody top-up
   */
  static async reinvestProjectFunds(
    input: {
      sourceProjectId: string;
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

    const [sourceProject, destProject, walletAccount] = await Promise.all([
      InvestmentProject.findById(sourceProjectId),
      InvestmentProject.findById(destinationProjectId),
      CustodyAccount.findById(walletAccountId),
    ]);

    if (!sourceProject) throw createError('Source investment project not found', 404);
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

    // 1. Create Reinvestment record
    const reinvestment = await Reinvestment.create({
      sourceProjectId: sourceProject._id,
      destinationProjectId: destProject._id,
      walletAccountId: walletAccount._id,
      reinvestedAmount,
      newAccountantFunds,
      newAccountantCustodyAccountId: accountantAccount ? accountantAccount._id : null,
      date: reinvestDate,
      notes: input.notes || `Reinvestment from ${sourceProject.name} to ${destProject.name}`,
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
      notes: `Reinvested wallet proceeds from ${sourceProject.name}`,
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
        fromProject: sourceProject.name,
        toProject: destProject.name,
        reinvestedAmount,
        newAccountantFunds,
        total: totalInvestedInDest,
      },
      reason: `Reinvested ৳${reinvestedAmount.toLocaleString()} from ${sourceProject.name} to ${destProject.name}`,
    });

    return {
      reinvestment,
      destProject,
      totalInvestedInDest,
    };
  }

  /**
   * List projects with dynamic funding and return aggregates
   */
  static async getProjects(filters?: {
    status?: string;
    category?: string;
    externalEntity?: string;
    search?: string;
  }) {
    const query: Record<string, unknown> = {};

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.category) {
      query.category = filters.category;
    }
    if (filters?.externalEntity) {
      query.externalEntity = { $regex: filters.externalEntity, $options: 'i' };
    }
    if (filters?.search && filters.search.trim()) {
      const term = filters.search.trim();
      query.$or = [
        { projectId: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { externalEntity: { $regex: term, $options: 'i' } },
        { category: { $regex: term, $options: 'i' } },
      ];
    }

    const projects = await InvestmentProject.find(query).sort({ startDate: -1, createdAt: -1 });

    // Attach computed returns and financial aggregates for each project
    const projectsWithMetrics = await Promise.all(
      projects.map(async (prj) => {
        const returns = await InvestmentReturn.find({ projectId: prj._id });

        const totalPrincipalReturned = returns.reduce((sum, r) => sum + r.principalReturned, 0);
        const totalProfitRealized = returns.reduce((sum, r) => sum + r.actualProfit, 0);
        const totalLosses = returns.reduce((sum, r) => sum + r.actualLoss, 0);
        const totalReturnReceived = returns.reduce((sum, r) => sum + r.totalReturn, 0);

        const netOutstandingCapital = Math.max(0, prj.totalFunded - totalPrincipalReturned);
        const netRealizedProfit = totalProfitRealized - totalLosses;
        const actualROI = prj.totalFunded > 0 ? (netRealizedProfit / prj.totalFunded) * 100 : 0;

        return {
          ...prj.toObject(),
          metrics: {
            totalPrincipalReturned,
            totalProfitRealized,
            totalLosses,
            totalReturnReceived,
            netOutstandingCapital,
            netRealizedProfit,
            actualROI: Math.round(actualROI * 100) / 100,
          },
        };
      })
    );

    return projectsWithMetrics;
  }

  /**
   * Get single project detail with complete funding & return breakdowns
   */
  static async getProjectById(projectId: string | Types.ObjectId) {
    const project = await InvestmentProject.findById(projectId);
    if (!project) {
      throw createError('Investment project not found', 404);
    }

    const [fundings, returns, reinvestments] = await Promise.all([
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
        .sort({ maturityDate: -1, createdAt: -1 }),
      Reinvestment.find({
        $or: [{ sourceProjectId: project._id }, { destinationProjectId: project._id }],
      })
        .populate('sourceProjectId', 'name projectId')
        .populate('destinationProjectId', 'name projectId')
        .populate('walletAccountId', 'name channel')
        .populate('approvedBy', 'name email')
        .sort({ date: -1 }),
    ]);

    const totalPrincipalReturned = returns.reduce((sum, r) => sum + r.principalReturned, 0);
    const totalProfitRealized = returns.reduce((sum, r) => sum + r.actualProfit, 0);
    const totalLosses = returns.reduce((sum, r) => sum + r.actualLoss, 0);
    const totalReturnReceived = returns.reduce((sum, r) => sum + r.totalReturn, 0);

    const netOutstandingCapital = Math.max(0, project.totalFunded - totalPrincipalReturned);
    const netRealizedProfit = totalProfitRealized - totalLosses;
    const actualROI = project.totalFunded > 0 ? (netRealizedProfit / project.totalFunded) * 100 : 0;

    return {
      project: {
        ...project.toObject(),
        metrics: {
          totalPrincipalReturned,
          totalProfitRealized,
          totalLosses,
          totalReturnReceived,
          netOutstandingCapital,
          netRealizedProfit,
          actualROI: Math.round(actualROI * 100) / 100,
        },
      },
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
}
