import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/payment.service.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { GatewayRate } from '../models/GatewayRate.js';
import { Member } from '../models/Member.js';
import { IUser } from '../types/models.js';
import { createError } from '../middlewares/error.js';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export class PaymentController {
  /** Minimal active-member directory for payment collection. It deliberately
   * uses PAYMENTS permission instead of MEMBERS permission so an assistant
   * accountant can collect from every active member without receiving member
   * management access. */
  static async getCollectionMembers(_req: Request, res: Response, next: NextFunction) {
    try {
      const members = await Member.find({ status: 'ACTIVE' })
        .select('name memberId phone')
        .sort({ memberId: 1 })
        .limit(500)
        .lean();
      res.status(200).json({ success: true, data: members });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/payments/preview
   */
  static async previewPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { memberId, totalAmount, paymentDate, paymentMethod, custodyAccountId, cashoutChargePaid, penaltyWaiverAmount, cashoutWaiverAmount, waiverReason } = req.body;
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
        penaltyWaiverAmount: Number(penaltyWaiverAmount) || 0,
        cashoutWaiverAmount: Number(cashoutWaiverAmount) || 0,
        waiverReason,
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
        penaltyWaiverAmount,
        cashoutWaiverAmount,
        waiverReason,
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
          penaltyWaiverAmount: Number(penaltyWaiverAmount) || 0,
          cashoutWaiverAmount: Number(cashoutWaiverAmount) || 0,
          waiverReason,
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

  /** PATCH /api/payments/:id - non-financial correction only */
  static async updatePaymentMetadata(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.updatePaymentMetadata(req.params.id, {
        transactionReference: req.body.transactionReference,
        notes: req.body.notes,
      }, req.user!);
      res.status(200).json({ success: true, message: 'Payment reference and notes updated.', data: payment });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/payments/:id - audited financial receipt replacement */
  static async replacePayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.body.memberId || !req.body.custodyAccountId || !req.body.totalAmount || !req.body.paymentMethod) {
        return next(createError('memberId, custodyAccountId, totalAmount, and paymentMethod are required', 400));
      }
      const result = await PaymentService.replacePayment(req.params.id, {
        memberId: req.body.memberId,
        receiverId: req.body.receiverId || (req.user as any)._id,
        custodyAccountId: req.body.custodyAccountId,
        paymentDate: req.body.paymentDate,
        totalAmount: Number(req.body.totalAmount),
        paymentMethod: req.body.paymentMethod,
        cashoutChargePaid: Number(req.body.cashoutChargePaid) || 0,
        penaltyWaiverAmount: Number(req.body.penaltyWaiverAmount) || 0,
        cashoutWaiverAmount: Number(req.body.cashoutWaiverAmount) || 0,
        waiverReason: req.body.waiverReason,
        transactionReference: req.body.transactionReference,
        notes: req.body.notes,
      }, req.user!);
      res.status(200).json({ success: true, message: 'Receipt corrected and replaced successfully.', data: result });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/payments/:id - audited financial void, never a physical delete */
  static async voidPayment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const payment = await PaymentService.voidPayment(req.params.id, req.body.reason, req.user!);
      res.status(200).json({ success: true, message: 'Payment voided with a compensating custody reversal.', data: payment });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/payments
   */
  static async listPayments(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, receiverId, paymentMethod, year, month } = req.query;
      const result = await PaymentService.getPayments({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search ? String(search) : undefined,
        receiverId: receiverId ? String(receiverId) : undefined,
        paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
        year: year ? String(year) : undefined,
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
        timeframe: (timeframe as 'all' | 'daily' | 'monthly' | 'yearly') || 'all',
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

  /** GET /api/payments/dues */
  static async getOutstandingDues(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await PaymentService.getOutstandingDues({
        year: req.query.year ? String(req.query.year) : undefined,
        month: req.query.month ? String(req.query.month) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
      });
      res.status(200).json({ success: true, data: result });
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
