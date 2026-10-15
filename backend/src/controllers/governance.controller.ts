import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import { createError } from '../middlewares/error.js';
import { GovernanceService } from '../services/governance.service.js';
export class GovernanceController {
  static async annualSummary(req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await GovernanceService.annualSummary(Number(req.params.year)) }); } catch (error) { next(error); } }
  static async createAnnual(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); res.status(201).json({ success: true, data: await GovernanceService.createAnnualClosing(Number(req.body.year), req.body.notes, req.user) }); } catch (error) { next(error); } }
  static async annualAction(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); const action = req.params.action as 'review' | 'approve' | 'lock' | 'unlock'; if (!['review', 'approve', 'lock', 'unlock'].includes(action)) return next(createError('Invalid annual-closing action.', 400)); res.json({ success: true, data: await GovernanceService.transitionAnnualClosing(req.params.id, action, req.user) }); } catch (error) { next(error); } }
  static async annualList(_req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await GovernanceService.listAnnualClosings() }); } catch (error) { next(error); } }
  static async policyList(_req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await GovernanceService.listPolicies() }); } catch (error) { next(error); } }
  static async policyDocumentGet(_req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await GovernanceService.getPolicyDocument() }); } catch (error) { next(error); } }
  static async policyDocumentSave(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); const { content } = req.body; if (typeof content !== 'string') return next(createError('content is required.', 400)); res.json({ success: true, data: await GovernanceService.savePolicyDocument(content, req.user) }); } catch (error) { next(error); } }
  static async policyCreate(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); const { serialNumber, title, category, content } = req.body; if (!serialNumber || !title || !category || !content) return next(createError('serialNumber, title, category, and content are required.', 400)); res.status(201).json({ success: true, data: await GovernanceService.createPolicy({ serialNumber: Number(serialNumber), title, category, content }, req.user) }); } catch (error) { next(error); } }
  static async policyAmend(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); res.json({ success: true, data: await GovernanceService.amendPolicy(req.params.id, req.body, req.user) }); } catch (error) { next(error); } }
  static async policyVersions(req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await GovernanceService.policyVersions(req.params.id) }); } catch (error) { next(error); } }
  static async exitList(_req: AuthRequest, res: Response, next: NextFunction) { try { res.json({ success: true, data: await GovernanceService.listExits() }); } catch (error) { next(error); } }
  static async exitPropose(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const { memberId, eligibleAmount, notes, custodyAccountId, autoSettle, deductionRate, netAmount, paymentMethod, transactionRef, authorizerName } = req.body;
      const settlement = await GovernanceService.proposeExit(
        memberId,
        Number(eligibleAmount),
        notes,
        req.user,
        {
          custodyAccountId,
          autoSettle: Boolean(autoSettle),
          deductionRate: deductionRate !== undefined ? Number(deductionRate) : undefined,
          netAmount: netAmount !== undefined ? Number(netAmount) : undefined,
          paymentMethod,
          transactionRef,
          authorizerName,
        }
      );
      res.status(201).json({ success: true, data: settlement });
    } catch (error) { next(error); }
  }
  static async exitApprove(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); res.json({ success: true, data: await GovernanceService.approveExit(req.params.id, req.user) }); } catch (error) { next(error); } }
  static async exitPay(req: AuthRequest, res: Response, next: NextFunction) { try { if (!req.user) return next(createError('Authentication required.', 401)); res.json({ success: true, data: await GovernanceService.payExitInstallment(req.params.id, Number(req.body.index), req.body.custodyAccountId, req.user) }); } catch (error) { next(error); } }
  static async exitSettle(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      const { custodyAccountId } = req.body;
      if (!custodyAccountId) return next(createError('custodyAccountId is required.', 400));
      res.json({ success: true, data: await GovernanceService.settleExitInFull(req.params.id, custodyAccountId, req.user) });
    } catch (error) { next(error); }
  }
  static async exitGet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await GovernanceService.getExit(req.params.id) });
    } catch (error) { next(error); }
  }
  static async exitUpdate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      res.json({ success: true, data: await GovernanceService.updateExit(req.params.id, req.body, req.user) });
    } catch (error) { next(error); }
  }
  static async exitDelete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(createError('Authentication required.', 401));
      res.json(await GovernanceService.deleteExit(req.params.id, req.user));
    } catch (error) { next(error); }
  }
}
