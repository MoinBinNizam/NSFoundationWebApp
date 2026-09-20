import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { InvestmentFunding } from '../models/InvestmentFunding.js';
import { InvestmentProject } from '../models/InvestmentProject.js';
import { Reinvestment } from '../models/Reinvestment.js';
import { CustodyService } from './custody.service.js';
import {
  AccountType,
  CustodyChannel,
  MovementSourceType,
  MovementType,
  ProjectStatus,
  IUser,
} from '../types/models.js';
import { createError } from '../middlewares/error.js';

type ActingUser = IUser & { _id: Types.ObjectId };

function actorId(user: IUser): Types.ObjectId {
  return (user as ActingUser)._id;
}

function positiveAmount(value: unknown, fieldName: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError(`${fieldName} must be greater than 0`, 400);
  }
  return amount;
}

async function refreshBalance(account: { _id: Types.ObjectId; cachedBalance: number; save: () => Promise<unknown> }) {
  const balance = await CustodyService.getDerivedAccountBalance(account._id);
  account.cachedBalance = balance.currentBalance;
  await account.save();
  return balance;
}

/**
 * Dedicated Issue #9 domain service. External wallets are custody accounts, but
 * are intentionally segregated from accountant-held funds until liquidation.
 */
export class ReinvestmentService {
  static async getProjectWallets() {
    const wallets = await CustodyAccount.find({
      accountType: AccountType.EXTERNAL_WALLET,
      channel: CustodyChannel.WALLET,
    }).sort({ name: 1 });

    return Promise.all(
      wallets.map(async (wallet) => {
        const [balance, proceeds, reinvested, liquidated] = await Promise.all([
          CustodyService.getDerivedAccountBalance(wallet._id),
          CustodyMovement.aggregate([
            { $match: { custodyAccountId: wallet._id, movementType: MovementType.IN, sourceType: MovementSourceType.INVESTMENT_RETURN } },
            { $group: { _id: null, amount: { $sum: '$amount' } } },
          ]),
          CustodyMovement.aggregate([
            { $match: { custodyAccountId: wallet._id, movementType: MovementType.OUT, sourceType: MovementSourceType.INVESTMENT_FUNDING } },
            { $group: { _id: null, amount: { $sum: '$amount' } } },
          ]),
          CustodyMovement.aggregate([
            { $match: { custodyAccountId: wallet._id, movementType: MovementType.OUT, sourceType: MovementSourceType.INTERNAL_TRANSFER } },
            { $group: { _id: null, amount: { $sum: '$amount' } } },
          ]),
        ]);

        return {
          ...wallet.toObject(),
          derivedBalance: balance.currentBalance,
          totalInflow: balance.totalInflow,
          totalOutflow: balance.totalOutflow,
          totalProceedsReceived: proceeds[0]?.amount ?? 0,
          totalReinvested: reinvested[0]?.amount ?? 0,
          totalLiquidated: liquidated[0]?.amount ?? 0,
        };
      })
    );
  }

  static async getWalletTransactions(walletId: string, query: { page?: number; limit?: number; search?: string }) {
    const wallet = await this.requireWallet(walletId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const filter: Record<string, unknown> = { custodyAccountId: wallet._id };

    if (query.search?.trim()) {
      filter.description = { $regex: query.search.trim(), $options: 'i' };
    }

    const [movements, total] = await Promise.all([
      CustodyMovement.find(filter)
        .populate('performedBy', 'name email')
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      CustodyMovement.countDocuments(filter),
    ]);

    return { wallet, movements, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  static async executeReinvestment(
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
    const walletAmount = positiveAmount(input.reinvestedAmount, 'reinvestedAmount');
    const newAccountantFunds = Number(input.newAccountantFunds) || 0;
    if (newAccountantFunds < 0) throw createError('newAccountantFunds cannot be negative', 400);
    if (input.sourceProjectId === input.destinationProjectId) {
      throw createError('Source and destination projects must be different', 400);
    }

    const [sourceProject, destinationProject, wallet] = await Promise.all([
      InvestmentProject.findById(input.sourceProjectId),
      InvestmentProject.findById(input.destinationProjectId),
      this.requireWallet(input.walletAccountId),
    ]);
    if (!sourceProject) throw createError('Source investment project not found', 404);
    if (!destinationProject) throw createError('Destination investment project not found', 404);
    if ([ProjectStatus.CLOSED, ProjectStatus.DEFAULTED].includes(destinationProject.status)) {
      throw createError(`Cannot fund a project with status '${destinationProject.status}'`, 400);
    }

    const walletBalance = await CustodyService.getDerivedAccountBalance(wallet._id);
    if (walletBalance.currentBalance < walletAmount) {
      throw createError(`Insufficient wallet balance. Available: ৳${walletBalance.currentBalance.toLocaleString()}`, 400);
    }

    // Mongoose's query helper type is intentionally broad here; after this
    // lookup we validate the concrete document before using it.
    let accountantAccount: any = null;
    if (newAccountantFunds > 0) {
      if (!input.newAccountantCustodyAccountId) {
        throw createError('newAccountantCustodyAccountId is required when adding fresh funds', 400);
      }
      accountantAccount = await CustodyAccount.findById(input.newAccountantCustodyAccountId);
      if (!accountantAccount || !accountantAccount.isActive || accountantAccount.accountType !== AccountType.ACCOUNTANT_CUSTODY) {
        throw createError('A valid active accountant custody account is required for fresh funds', 400);
      }
      const accountBalance = await CustodyService.getDerivedAccountBalance(accountantAccount._id);
      if (accountBalance.currentBalance < newAccountantFunds) {
        throw createError(`Insufficient accountant custody balance. Available: ৳${accountBalance.currentBalance.toLocaleString()}`, 400);
      }
    }

    const date = input.date ? new Date(input.date) : new Date();
    if (Number.isNaN(date.getTime())) throw createError('date is invalid', 400);
    const performedBy = actorId(actingUser);

    // All validation precedes financial writes. Each immutable ledger entry is
    // linked to one Reinvestment record for a complete audit trail.
    const reinvestment = await Reinvestment.create({
      sourceProjectId: sourceProject._id,
      destinationProjectId: destinationProject._id,
      walletAccountId: wallet._id,
      reinvestedAmount: walletAmount,
      newAccountantFunds,
      newAccountantCustodyAccountId: accountantAccount?._id ?? null,
      date,
      notes: input.notes?.trim() || `Wallet reinvestment from ${sourceProject.projectId} to ${destinationProject.projectId}`,
      approvedBy: performedBy,
    });

    const walletMovement = await CustodyMovement.create({
      custodyAccountId: wallet._id,
      movementType: MovementType.OUT,
      amount: walletAmount,
      sourceType: MovementSourceType.INVESTMENT_FUNDING,
      sourceRefId: reinvestment._id,
      date,
      description: `Wallet reinvestment into ${destinationProject.name} (${destinationProject.projectId})`,
      performedBy,
    });
    const walletFunding = await InvestmentFunding.create({
      projectId: destinationProject._id,
      custodyAccountId: wallet._id,
      amount: walletAmount,
      date,
      custodyMovementId: walletMovement._id,
      fundedBy: performedBy,
      notes: `Reinvested proceeds from ${sourceProject.name} via ${wallet.name}`,
    });

    let accountantMovement = null;
    let accountantFunding = null;
    if (accountantAccount && newAccountantFunds > 0) {
      accountantMovement = await CustodyMovement.create({
        custodyAccountId: accountantAccount._id,
        movementType: MovementType.OUT,
        amount: newAccountantFunds,
        sourceType: MovementSourceType.INVESTMENT_FUNDING,
        sourceRefId: reinvestment._id,
        date,
        description: `Fresh reinvestment top-up into ${destinationProject.name} (${destinationProject.projectId})`,
        performedBy,
      });
      accountantFunding = await InvestmentFunding.create({
        projectId: destinationProject._id,
        custodyAccountId: accountantAccount._id,
        amount: newAccountantFunds,
        date,
        custodyMovementId: accountantMovement._id,
        fundedBy: performedBy,
        notes: `Fresh accountant top-up paired with wallet reinvestment ${reinvestment._id}`,
      });
    }

    const totalFunded = walletAmount + newAccountantFunds;
    destinationProject.totalFunded += totalFunded;
    if (destinationProject.status === ProjectStatus.PROPOSED) destinationProject.status = ProjectStatus.ACTIVE;
    await destinationProject.save();
    const walletBalanceAfter = await refreshBalance(wallet);
    const accountantBalanceAfter = accountantAccount ? await refreshBalance(accountantAccount) : null;

    await AuditLog.create({
      performedBy,
      action: 'EXECUTE_WALLET_REINVESTMENT',
      entityName: 'Reinvestment',
      entityId: reinvestment._id,
      afterState: {
        sourceProjectId: sourceProject._id,
        destinationProjectId: destinationProject._id,
        walletAccountId: wallet._id,
        walletAmount,
        newAccountantFunds,
        totalFunded,
      },
      reason: `Reinvested ৳${walletAmount.toLocaleString()} from ${wallet.name} into ${destinationProject.projectId}`,
    });

    return { reinvestment, walletMovement, walletFunding, accountantMovement, accountantFunding, destinationProject, totalFunded, walletBalanceAfter, accountantBalanceAfter };
  }

  static async liquidateWalletFunds(
    input: { walletAccountId: string; destinationAccountId: string; amount: number; date?: string | Date; notes?: string },
    actingUser: IUser
  ) {
    const wallet = await this.requireWallet(input.walletAccountId);
    const destination = await CustodyAccount.findById(input.destinationAccountId);
    if (!destination || !destination.isActive || destination.accountType !== AccountType.ACCOUNTANT_CUSTODY) {
      throw createError('Destination must be an active accountant custody account', 400);
    }
    const amount = positiveAmount(input.amount, 'amount');
    const result = await CustodyService.transferFunds({
      sourceAccountId: wallet._id.toString(),
      destinationAccountId: destination._id.toString(),
      amount,
      date: input.date,
      purpose: input.notes?.trim() || `Wallet liquidation from ${wallet.name}`,
    }, actingUser);

    await AuditLog.create({
      performedBy: actorId(actingUser),
      action: 'LIQUIDATE_PROJECT_WALLET',
      entityName: 'CustodyAccount',
      entityId: wallet._id,
      afterState: { destinationAccountId: destination._id, amount, transferNumber: result.transferNumber },
      reason: `Liquidated ৳${amount.toLocaleString()} from ${wallet.name} to ${destination.name}`,
    });
    return { ...result, wallet, destination };
  }

  static async getReinvestmentChains(projectId?: string) {
    const filter: Record<string, unknown> = {};
    if (projectId) filter.$or = [{ sourceProjectId: projectId }, { destinationProjectId: projectId }];
    const events = await Reinvestment.find(filter)
      .populate('sourceProjectId', 'projectId name externalEntity status')
      .populate('destinationProjectId', 'projectId name externalEntity status')
      .populate('walletAccountId', 'name channel')
      .populate('newAccountantCustodyAccountId', 'name channel')
      .populate('approvedBy', 'name email')
      .sort({ date: -1, createdAt: -1 });

    return events.map((event) => ({
      ...event.toObject(),
      totalCapitalToDestination: event.reinvestedAmount + event.newAccountantFunds,
    }));
  }

  static async getReinvestmentStats() {
    const [wallets, events] = await Promise.all([this.getProjectWallets(), Reinvestment.find()]);
    return {
      totalWalletHoldings: wallets.reduce((sum, wallet) => sum + wallet.derivedBalance, 0),
      totalReinvestedProceeds: wallets.reduce((sum, wallet) => sum + wallet.totalReinvested, 0),
      totalLiquidatedToAccountants: wallets.reduce((sum, wallet) => sum + wallet.totalLiquidated, 0),
      activeReinvestmentChains: new Set(events.map((event) => event.sourceProjectId.toString())).size,
      totalWallets: wallets.length,
      totalReinvestmentEvents: events.length,
    };
  }

  private static async requireWallet(walletId: string) {
    const wallet = await CustodyAccount.findById(walletId);
    if (!wallet || !wallet.isActive || wallet.accountType !== AccountType.EXTERNAL_WALLET || wallet.channel !== CustodyChannel.WALLET) {
      throw createError('An active external wallet account is required', 404);
    }
    return wallet;
  }
}
