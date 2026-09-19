import mongoose, { Types } from 'mongoose';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { FundTransfer } from '../models/FundTransfer.js';
import { AuditLog } from '../models/AuditLog.js';
import {
  AccountType,
  CustodyChannel,
  MovementType,
  MovementSourceType,
  IUser,
} from '../types/models.js';
import { createError } from '../middlewares/error.js';

function toYearMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export class CustodyService {
  /**
   * Derive real-time balance for a specific custody account:
   * Balance = sum(IN) - sum(OUT)
   */
  static async getDerivedAccountBalance(accountId: string | Types.ObjectId): Promise<{
    currentBalance: number;
    totalInflow: number;
    totalOutflow: number;
  }> {
    const accId = typeof accountId === 'string' ? new mongoose.Types.ObjectId(accountId) : accountId;

    const [inflowAgg, outflowAgg] = await Promise.all([
      CustodyMovement.aggregate([
        { $match: { custodyAccountId: accId, movementType: MovementType.IN } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      CustodyMovement.aggregate([
        { $match: { custodyAccountId: accId, movementType: MovementType.OUT } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const totalInflow = inflowAgg[0]?.total || 0;
    const totalOutflow = outflowAgg[0]?.total || 0;
    const currentBalance = totalInflow - totalOutflow;

    return { currentBalance, totalInflow, totalOutflow };
  }

  /**
   * List all custody accounts with real-time derived balances
   */
  static async getCustodyAccounts(filters?: {
    holderId?: string;
    accountType?: string;
    channel?: string;
    isActive?: boolean;
  }) {
    const matchQuery: Record<string, unknown> = {};

    if (filters?.holderId) {
      matchQuery.holderId = new mongoose.Types.ObjectId(filters.holderId);
    }
    if (filters?.accountType) {
      matchQuery.accountType = filters.accountType;
    }
    if (filters?.channel) {
      matchQuery.channel = filters.channel;
    }
    if (filters?.isActive !== undefined) {
      matchQuery.isActive = filters.isActive;
    }

    const accounts = await CustodyAccount.find(matchQuery)
      .populate('holderId', 'name email accountantType phone')
      .sort({ name: 1 });

    // Attach derived balance calculations to each account
    const accountsWithBalances = await Promise.all(
      accounts.map(async (acc) => {
        const { currentBalance, totalInflow, totalOutflow } = await this.getDerivedAccountBalance(acc._id);
        return {
          ...acc.toObject(),
          derivedBalance: currentBalance,
          totalInflow,
          totalOutflow,
        };
      })
    );

    return accountsWithBalances;
  }

  /**
   * Custody Summary Metrics for society-wide reporting
   */
  static async getCustodySummary() {
    const accounts = await this.getCustodyAccounts({ isActive: true });

    let totalLiquidFunds = 0;
    let totalMoinCustody = 0;
    let totalSamratCustody = 0;
    let totalExternalWallets = 0;

    const channelTotals: Record<string, number> = {
      CASH: 0,
      BANK: 0,
      BKASH: 0,
      NAGAD: 0,
      WALLET: 0,
      OTHER: 0,
    };

    for (const acc of accounts) {
      const balance = acc.derivedBalance;
      totalLiquidFunds += balance;

      // Channel grouping
      channelTotals[acc.channel] = (channelTotals[acc.channel] || 0) + balance;

      // Holder grouping (by accountantType or name)
      const holder = acc.holderId as unknown as { accountantType?: string; email?: string } | undefined;
      if (holder?.accountantType === 'PRIMARY' || holder?.email === 'admin@nsfoundation.org') {
        totalMoinCustody += balance;
      } else if (holder?.accountantType === 'ASSISTANT' || holder?.email === 'assistant@nsfoundation.org') {
        totalSamratCustody += balance;
      } else if (acc.accountType === AccountType.EXTERNAL_WALLET) {
        totalExternalWallets += balance;
      }
    }

    return {
      totalLiquidFunds,
      totalMoinCustody,
      totalSamratCustody,
      totalExternalWallets,
      channelTotals,
      totalAccountsCount: accounts.length,
    };
  }

  /**
   * Searchable & Filterable Custody Movements Ledger
   */
  static async getMovements(query: {
    page?: number;
    limit?: number;
    accountId?: string;
    movementType?: string;
    sourceType?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (query.accountId) {
      filter.custodyAccountId = new mongoose.Types.ObjectId(query.accountId);
    }
    if (query.movementType) {
      filter.movementType = query.movementType;
    }
    if (query.sourceType) {
      filter.sourceType = query.sourceType;
    }
    if (query.startDate || query.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.startDate) dateFilter.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      filter.date = dateFilter;
    }

    const [movements, total] = await Promise.all([
      CustodyMovement.find(filter)
        .populate({
          path: 'custodyAccountId',
          select: 'name channel accountNumber holderId',
          populate: { path: 'holderId', select: 'name email accountantType' },
        })
        .populate('performedBy', 'name email')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CustodyMovement.countDocuments(filter),
    ]);

    return {
      movements,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Atomic Cross-Channel & Inter-Accountant Fund Transfer:
   * E.g. Samrat Nagad -> Moin Islami Bank
   */
  static async transferFunds(
    input: {
      sourceAccountId: string;
      destinationAccountId: string;
      amount: number;
      date?: string | Date;
      purpose?: string;
    },
    actingUser: IUser
  ) {
    const { sourceAccountId, destinationAccountId, amount } = input;

    if (!amount || amount <= 0) {
      throw createError('Transfer amount must be greater than 0', 400);
    }

    if (sourceAccountId === destinationAccountId) {
      throw createError('Source and destination custody accounts cannot be identical', 400);
    }

    const [sourceAccount, destinationAccount] = await Promise.all([
      CustodyAccount.findById(sourceAccountId).populate('holderId', 'name email accountantType'),
      CustodyAccount.findById(destinationAccountId).populate('holderId', 'name email accountantType'),
    ]);

    if (!sourceAccount || !sourceAccount.isActive) {
      throw createError('Source custody account not found or inactive', 404);
    }
    if (!destinationAccount || !destinationAccount.isActive) {
      throw createError('Destination custody account not found or inactive', 404);
    }

    // Verify source account has sufficient derived balance
    const { currentBalance } = await this.getDerivedAccountBalance(sourceAccount._id);
    if (currentBalance < amount) {
      throw createError(
        `Insufficient funds in ${sourceAccount.name}. Available: ৳${currentBalance.toLocaleString()}, Requested: ৳${amount.toLocaleString()}`,
        400
      );
    }

    const transferDate = input.date ? new Date(input.date) : new Date();
    const currentYearMonth = toYearMonth(transferDate);

    // Generate unique sequential transfer number: TRF-YYYYMM-XXXX
    const prefix = `TRF-${currentYearMonth.replace('-', '')}`;
    const countThisMonth = await FundTransfer.countDocuments({
      transferNumber: { $regex: `^${prefix}` },
    });
    const transferNumber = `${prefix}-${String(countThisMonth + 1).padStart(4, '0')}`;

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;

    // 1. Log OUT movement from Source Account
    const outMovement = await CustodyMovement.create({
      custodyAccountId: sourceAccount._id,
      movementType: MovementType.OUT,
      amount,
      sourceType: MovementSourceType.INTERNAL_TRANSFER,
      date: transferDate,
      description: `Transfer Out (${transferNumber}) to ${destinationAccount.name}${input.purpose ? ` — ${input.purpose}` : ''}`,
      performedBy: actingUserId,
    });

    // 2. Log IN movement to Destination Account
    const inMovement = await CustodyMovement.create({
      custodyAccountId: destinationAccount._id,
      movementType: MovementType.IN,
      amount,
      sourceType: MovementSourceType.INTERNAL_TRANSFER,
      date: transferDate,
      description: `Transfer In (${transferNumber}) from ${sourceAccount.name}${input.purpose ? ` — ${input.purpose}` : ''}`,
      performedBy: actingUserId,
    });

    // 3. Create FundTransfer linking record
    const fundTransfer = await FundTransfer.create({
      transferNumber,
      sourceAccountId: sourceAccount._id,
      destinationAccountId: destinationAccount._id,
      amount,
      date: transferDate,
      purpose: input.purpose || '',
      outMovementId: outMovement._id,
      inMovementId: inMovement._id,
      transferredBy: actingUserId,
    });

    // Update outMovement and inMovement sourceRefId to fundTransfer._id
    outMovement.sourceRefId = fundTransfer._id;
    await outMovement.save();
    inMovement.sourceRefId = fundTransfer._id;
    await inMovement.save();

    // 4. Update cachedBalances on both accounts
    const [sourceBalances, destBalances] = await Promise.all([
      this.getDerivedAccountBalance(sourceAccount._id),
      this.getDerivedAccountBalance(destinationAccount._id),
    ]);

    sourceAccount.cachedBalance = sourceBalances.currentBalance;
    await sourceAccount.save();
    destinationAccount.cachedBalance = destBalances.currentBalance;
    await destinationAccount.save();

    // 5. Audit Log
    await AuditLog.create({
      performedBy: actingUserId,
      action: 'INTERNAL_FUND_TRANSFER',
      entityName: 'FundTransfer',
      entityId: fundTransfer._id,
      afterState: {
        transferNumber,
        fromAccount: sourceAccount.name,
        toAccount: destinationAccount.name,
        amount,
        purpose: input.purpose,
        date: transferDate,
      },
      reason: `Executed inter-account transfer ${transferNumber} from ${sourceAccount.name} to ${destinationAccount.name}`,
    });

    return {
      fundTransfer,
      outMovement,
      inMovement,
      transferNumber,
      sourceBalanceAfter: sourceBalances.currentBalance,
      destinationBalanceAfter: destBalances.currentBalance,
    };
  }

  /**
   * List all FundTransfer history records
   */
  static async getTransfers(query: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 15));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { transferNumber: { $regex: term, $options: 'i' } },
        { purpose: { $regex: term, $options: 'i' } },
      ];
    }

    const [transfers, total] = await Promise.all([
      FundTransfer.find(filter)
        .populate({
          path: 'sourceAccountId',
          select: 'name channel accountNumber holderId',
          populate: { path: 'holderId', select: 'name email accountantType' },
        })
        .populate({
          path: 'destinationAccountId',
          select: 'name channel accountNumber holderId',
          populate: { path: 'holderId', select: 'name email accountantType' },
        })
        .populate('transferredBy', 'name email')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      FundTransfer.countDocuments(filter),
    ]);

    return {
      transfers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Register a new Custody Account (Admin Only)
   */
  static async createCustodyAccount(
    input: {
      name: string;
      accountType: AccountType;
      holderId?: string | null;
      channel: CustodyChannel;
      accountNumber?: string;
      notes?: string;
    },
    actingUser: IUser
  ) {
    const existing = await CustodyAccount.findOne({ name: input.name });
    if (existing) {
      throw createError(`Custody account named '${input.name}' already exists`, 400);
    }

    const account = await CustodyAccount.create({
      name: input.name,
      accountType: input.accountType,
      holderId: input.holderId || null,
      channel: input.channel,
      accountNumber: input.accountNumber || '',
      cachedBalance: 0,
      isActive: true,
      notes: input.notes || '',
    });

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;
    await AuditLog.create({
      performedBy: actingUserId,
      action: 'CREATE_CUSTODY_ACCOUNT',
      entityName: 'CustodyAccount',
      entityId: account._id,
      afterState: account.toObject(),
      reason: `Created custody account '${account.name}' (${account.channel})`,
    });

    return account;
  }

  /**
   * Physical / Bank Count Reconciliation with Ledger:
   * Logs an ADJUSTMENT movement if variance exists (Admin Only)
   */
  static async reconcileCustodyAccount(
    input: {
      accountId: string;
      verifiedAmount: number;
      reason: string;
    },
    actingUser: IUser
  ) {
    const account = await CustodyAccount.findById(input.accountId);
    if (!account) {
      throw createError('Custody account not found', 404);
    }

    const { currentBalance } = await this.getDerivedAccountBalance(account._id);
    const variance = input.verifiedAmount - currentBalance;

    if (Math.abs(variance) < 0.01) {
      return {
        account,
        currentBalance,
        verifiedAmount: input.verifiedAmount,
        variance: 0,
        adjusted: false,
        message: 'Verified balance matches ledger perfectly. No adjustment needed.',
      };
    }

    const actingUserId = (actingUser as unknown as { _id: Types.ObjectId })._id;
    const movementType = variance > 0 ? MovementType.IN : MovementType.OUT;
    const absAmount = Math.abs(variance);

    const movement = await CustodyMovement.create({
      custodyAccountId: account._id,
      movementType,
      amount: absAmount,
      sourceType: MovementSourceType.ADJUSTMENT,
      date: new Date(),
      description: `Reconciliation Adjustment (${variance > 0 ? '+' : '-'}৳${absAmount}): ${input.reason}`,
      performedBy: actingUserId,
    });

    account.cachedBalance = input.verifiedAmount;
    await account.save();

    await AuditLog.create({
      performedBy: actingUserId,
      action: 'RECONCILE_CUSTODY_ACCOUNT',
      entityName: 'CustodyAccount',
      entityId: account._id,
      beforeState: { balance: currentBalance },
      afterState: { balance: input.verifiedAmount, variance, adjustmentMovementId: movement._id },
      reason: input.reason,
    });

    return {
      account,
      currentBalance: input.verifiedAmount,
      previousBalance: currentBalance,
      variance,
      adjusted: true,
      adjustmentMovement: movement,
      message: `Balance adjusted by ${variance > 0 ? '+' : '-'}৳${absAmount} to match verified statement.`,
    };
  }
}
