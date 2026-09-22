import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/payment.service.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { GatewayRate } from '../models/GatewayRate.js';
import { IUser } from '../types/models.js';
import { createError } from '../middlewares/error.js';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export class PaymentController {
  /**
   * POST /api/payments/preview
   */
  static async previewPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { memberId, totalAmount, paymentDate, paymentMethod, custodyAccountId, cashoutChargePaid } = req.body;
      if (!memberId || totalAmount === undefined) {
        return next(createError('memberId and totalAmount are required', 400));
      }

      const preview = await PaymentService.calculatePaymentPreview({
        memberId,
        totalAmount: Number(totalAmount),
        paymentDate,
        paymentMethod,
        custodyAccountId,
        cashoutChargePaid: Number(cashoutChargePaid) || 0,
      });

      res.status(200).json({
        success: true,
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments
   */
  static async createPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const {
        memberId,
        receiverId,
        custodyAccountId,
        paymentDate,
        totalAmount,
        paymentMethod,
        cashoutChargePaid,
        transactionReference,
        notes,
      } = req.body;

      if (!memberId || !custodyAccountId || !totalAmount || !paymentMethod) {
        return next(createError('memberId, custodyAccountId, totalAmount, and paymentMethod are required', 400));
      }

      const actingUser = req.user!;
      // Receiver defaults to acting user if not specified by admin
      const finalReceiverId = receiverId || (actingUser as unknown as { _id: string })._id;

      const result = await PaymentService.recordPayment(
        {
          memberId,
          receiverId: finalReceiverId,
          custodyAccountId,
          paymentDate,
          totalAmount: Number(totalAmount),
          paymentMethod,
          cashoutChargePaid: Number(cashoutChargePaid) || 0,
          transactionReference,
          notes,
        },
        actingUser
      );

      res.status(201).json({
        success: true,
        message: 'Member payment recorded successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments
   */
  static async listPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, receiverId, paymentMethod, month } = req.query;
      const result = await PaymentService.getPayments({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        receiverId: receiverId ? String(receiverId) : undefined,
        paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
        month: month ? String(month) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.payments,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/stats
   */
  static async getContributionStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { timeframe, date, receiverId, paymentMethod } = req.query;
      const stats = await PaymentService.getPaymentStats({
        timeframe: (timeframe as 'daily' | 'monthly' | 'yearly') || 'monthly',
        date: date ? String(date) : undefined,
        receiverId: receiverId ? String(receiverId) : undefined,
        paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
      });

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/custody-accounts
   */
  static async getCustodyAccounts(req: Request, res: Response, next: NextFunction) {
    try {
      const { holderId } = req.query;
      const filter: Record<string, unknown> = { isActive: true };
      if (holderId) {
        filter.holderId = holderId;
      }
      const accounts = await CustodyAccount.find(filter)
        .populate('holderId', 'name email accountantType')
        .sort({ name: 1 });

      res.status(200).json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/gateway-rates
   */
  static async getGatewayRates(_req: Request, res: Response, next: NextFunction) {
    try {
      const rates = await GatewayRate.find().sort({ channel: 1 });
      res.status(200).json({
        success: true,
        data: rates,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/penalty-rules
   */
  static async getPenaltyRules(_req: Request, res: Response, next: NextFunction) {
    try {
      const rules = await PaymentService.getPenaltyRules();
      res.status(200).json({
        success: true,
        data: rules,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/penalty-rules
   */
  static async savePenaltyRule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { effectiveFrom, effectiveTo, ratePerShare, graceDayOfMonth, description } = req.body;
      if (!effectiveFrom || ratePerShare === undefined || graceDayOfMonth === undefined) {
        return next(createError('effectiveFrom, ratePerShare, and graceDayOfMonth are required', 400));
      }

      const rule = await PaymentService.savePenaltyRule(
        {
          effectiveFrom,
          effectiveTo,
          ratePerShare: Number(ratePerShare),
          graceDayOfMonth: Number(graceDayOfMonth),
          description,
        },
        req.user!
      );

      res.status(200).json({
        success: true,
        message: 'Penalty rule saved successfully',
        data: rule,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/penalty-waivers
   */
  static async getPenaltyWaivers(_req: Request, res: Response, next: NextFunction) {
    try {
      const waivers = await PaymentService.getPenaltyWaivers();
      res.status(200).json({
        success: true,
        data: waivers,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/penalty-waivers
   */
  static async createPenaltyWaiver(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { month, isGlobal, memberId, reason } = req.body;
      if (!month || !reason) {
        return next(createError('month and reason are required', 400));
      }

      const waiver = await PaymentService.createPenaltyWaiver(
        {
          month,
          isGlobal: isGlobal !== undefined ? Boolean(isGlobal) : true,
          memberId,
          reason,
        },
        req.user!
      );

      res.status(201).json({
        success: true,
        message: 'Penalty waiver created successfully',
        data: waiver,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments/:id
   */
  static async getPaymentDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const details = await PaymentService.getPaymentDetails(id);
      res.status(200).json({
        success: true,
        data: details,
      });
    } catch (error) {
      next(error);
    }
  }
}
