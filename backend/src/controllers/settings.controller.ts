import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { createError } from '../middlewares/error.js';
import { PaymentService } from '../services/payment.service.js';
import { getGatewayRateSettings, getMonthlyShareSetting, getOperationalEndYear, saveGatewayRate, saveMonthlyShareValue, saveOperationalEndYear } from '../services/settings.service.js';
import { CustodyChannel } from '../types/models.js';

export class SettingsController {
  static async getShareAmount(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await getMonthlyShareSetting() });
    } catch (error) {
      next(error);
    }
  }

  static async saveShareAmount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const value = Number(req.body.value);
      const setting = await saveMonthlyShareValue(value, req.user, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      res.status(200).json({ success: true, message: 'Organization share amount updated.', data: setting });
    } catch (error) {
      next(error);
    }
  }

  static async getPenaltyRules(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await PaymentService.getPenaltyRules() });
    } catch (error) {
      next(error);
    }
  }

  static async savePenaltyRule(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const { effectiveFrom, effectiveTo, ratePerShare, graceDayOfMonth, description } = req.body;
      if (!effectiveFrom || ratePerShare === undefined || graceDayOfMonth === undefined) {
        return next(createError('effectiveFrom, ratePerShare, and graceDayOfMonth are required.', 400));
      }
      const rule = await PaymentService.savePenaltyRule(
        { effectiveFrom, effectiveTo, ratePerShare: Number(ratePerShare), graceDayOfMonth: Number(graceDayOfMonth), description },
        req.user
      );
      res.status(200).json({ success: true, message: 'Penalty rule saved.', data: rule });
    } catch (error) {
      next(error);
    }
  }

  static async getPenaltyWaivers(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await PaymentService.getPenaltyWaivers() });
    } catch (error) {
      next(error);
    }
  }

  static async createPenaltyWaiver(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const { month, isGlobal, memberId, reason } = req.body;
      if (!month || !reason) return next(createError('month and reason are required.', 400));
      const waiver = await PaymentService.createPenaltyWaiver(
        { month, isGlobal: isGlobal !== undefined ? Boolean(isGlobal) : true, memberId, reason },
        req.user
      );
      res.status(201).json({ success: true, message: 'Penalty waiver created.', data: waiver });
    } catch (error) {
      next(error);
    }
  }

  static async getGatewayRates(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await getGatewayRateSettings() });
    } catch (error) { next(error); }
  }

  static async saveGatewayRate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const { channel, cashoutRatePercentage, fixedFee, roundingIncrement, description } = req.body;
      const rate = await saveGatewayRate({ channel: channel as CustodyChannel, cashoutRatePercentage: Number(cashoutRatePercentage), fixedFee: Number(fixedFee || 0), roundingIncrement: Number(roundingIncrement || 1), description }, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
      res.status(200).json({ success: true, message: 'Gateway cash-out rule updated.', data: rate });
    } catch (error) { next(error); }
  }

  static async getOperationalEndYear(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try { res.status(200).json({ success: true, data: await getOperationalEndYear() }); } catch (error) { next(error); }
  }

  static async saveOperationalEndYear(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const config = await saveOperationalEndYear(Number(req.body.value), req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
      res.status(200).json({ success: true, message: 'Operational end year updated.', data: config });
    } catch (error) { next(error); }
  }
}
