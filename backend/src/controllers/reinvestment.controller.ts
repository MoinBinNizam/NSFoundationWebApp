import { NextFunction, Request, Response } from 'express';
import { createError } from '../middlewares/error.js';
import { IUser } from '../types/models.js';
import { ReinvestmentService } from '../services/reinvestment.service.js';

interface AuthenticatedRequest extends Request { user?: IUser }

export class ReinvestmentController {
  static async getStats(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ReinvestmentService.getReinvestmentStats() }); } catch (error) { next(error); }
  }

  static async listWallets(_req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ReinvestmentService.getProjectWallets() }); } catch (error) { next(error); }
  }

  static async getWalletLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await ReinvestmentService.getWalletTransactions(req.params.id, {
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
      });
      res.json({ success: true, data: result.movements, wallet: result.wallet, pagination: result.pagination });
    } catch (error) { next(error); }
  }

  static async listChains(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await ReinvestmentService.getReinvestmentChains(req.query.projectId ? String(req.query.projectId) : undefined) }); } catch (error) { next(error); }
  }

  static async execute(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { sourceProjectId, destinationProjectId, walletAccountId, reinvestedAmount, newAccountantFunds, newAccountantCustodyAccountId, date, notes } = req.body;
      if (!sourceProjectId || !destinationProjectId || !walletAccountId || reinvestedAmount === undefined) {
        return next(createError('sourceProjectId, destinationProjectId, walletAccountId, and reinvestedAmount are required', 400));
      }
      if (!req.user) return next(createError('Authentication required', 401));
      const result = await ReinvestmentService.executeReinvestment({ sourceProjectId, destinationProjectId, walletAccountId, reinvestedAmount: Number(reinvestedAmount), newAccountantFunds: Number(newAccountantFunds) || 0, newAccountantCustodyAccountId, date, notes }, req.user);
      res.status(201).json({ success: true, message: `Reinvested ৳${result.totalFunded.toLocaleString()} successfully`, data: result });
    } catch (error) { next(error); }
  }

  static async liquidate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { walletAccountId, destinationAccountId, amount, date, notes } = req.body;
      if (!walletAccountId || !destinationAccountId || amount === undefined) return next(createError('walletAccountId, destinationAccountId, and amount are required', 400));
      if (!req.user) return next(createError('Authentication required', 401));
      const result = await ReinvestmentService.liquidateWalletFunds({ walletAccountId, destinationAccountId, amount: Number(amount), date, notes }, req.user);
      res.status(201).json({ success: true, message: `Wallet liquidation ${result.transferNumber} completed`, data: result });
    } catch (error) { next(error); }
  }
}
