import { Request, Response, NextFunction } from 'express';
import { CustodyService } from '../services/custody.service.js';
import { IUser } from '../types/models.js';
import { createError } from '../middlewares/error.js';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export class CustodyController {
  /**
   * GET /api/custody/accounts
   * Returns list of custody accounts with real-time derived balances
   */
  static async listAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const { holderId, accountType, channel, isActive } = req.query;

      const accounts = await CustodyService.getCustodyAccounts({
        holderId: holderId ? String(holderId) : undefined,
        accountType: accountType ? String(accountType) : undefined,
        channel: channel ? String(channel) : undefined,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
      });

      res.status(200).json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/custody/accounts/:id/balance
   * Returns real-time derived balance for a specific account
   */
  static async getAccountBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const balance = await CustodyService.getDerivedAccountBalance(id);

      res.status(200).json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/custody/summary
   * Returns society-wide custody summary metrics
   */
  static async getCustodySummary(_req: Request, res: Response, next: NextFunction) {
    try {
      const summary = await CustodyService.getCustodySummary();

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/custody/movements
   * Searchable and filterable Custody Movement ledger
   */
  static async listMovements(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, accountId, movementType, sourceType, startDate, endDate } = req.query;

      const result = await CustodyService.getMovements({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        accountId: accountId ? String(accountId) : undefined,
        movementType: movementType ? String(movementType) : undefined,
        sourceType: sourceType ? String(sourceType) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.movements,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/custody/transfer
   * Execute atomic inter-account / cross-channel transfer
   */
  static async executeTransfer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { sourceAccountId, destinationAccountId, amount, date, purpose } = req.body;

      if (!sourceAccountId || !destinationAccountId || !amount) {
        return next(createError('sourceAccountId, destinationAccountId, and amount are required', 400));
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const result = await CustodyService.transferFunds(
        {
          sourceAccountId,
          destinationAccountId,
          amount: Number(amount),
          date,
          purpose,
        },
        req.user
      );

      res.status(201).json({
        success: true,
        message: `Transfer ${result.transferNumber} executed successfully`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/custody/transfers
   * List fund transfer vouchers history
   */
  static async listTransfers(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search } = req.query;

      const result = await CustodyService.getTransfers({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.transfers,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/custody/accounts
   * Create a new custody account (Admin only)
   */
  static async createAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { name, accountType, holderId, channel, accountNumber, notes } = req.body;

      if (!name || !accountType || !channel) {
        return next(createError('name, accountType, and channel are required', 400));
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const account = await CustodyService.createCustodyAccount(
        {
          name,
          accountType,
          holderId,
          channel,
          accountNumber,
          notes,
        },
        req.user
      );

      res.status(201).json({
        success: true,
        message: `Custody account '${account.name}' created successfully`,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/custody/reconcile
   * Reconcile custody account with physical/bank statement (Admin only)
   */
  static async reconcileAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { accountId, verifiedAmount, reason } = req.body;

      if (!accountId || verifiedAmount === undefined || !reason) {
        return next(createError('accountId, verifiedAmount, and reason are required', 400));
      }

      if (!req.user) {
        return next(createError('Authentication required', 401));
      }

      const result = await CustodyService.reconcileCustodyAccount(
        {
          accountId,
          verifiedAmount: Number(verifiedAmount),
          reason,
        },
        req.user
      );

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
