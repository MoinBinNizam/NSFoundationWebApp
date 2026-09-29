import { Router } from 'express';
import { InvestmentController } from '../controllers/investment.controller.js';
import {
  authenticate,
  requireInvestmentAccess,
  requireModuleAccess,
} from '../middlewares/auth.js';
import { financialIdempotency } from '../middlewares/security.js';

const router = Router();

// All investment routes require valid authentication
router.use(authenticate, requireModuleAccess('INVESTMENTS', 'view'), requireInvestmentAccess);

// Public / Read routes
router.get('/stats', InvestmentController.getStats);
router.get('/projects', InvestmentController.listProjects);
router.get('/projects/:id', InvestmentController.getProjectDetails);

// Investment access is restricted to administrators/primary accountant (Moin).
router.post(
  '/projects',
  requireModuleAccess('INVESTMENTS', 'edit'),
  InvestmentController.createProject
);

router.post(
  '/projects/:id/fund',
  requireModuleAccess('INVESTMENTS', 'edit'),
  financialIdempotency('INVESTMENT_FUND'),
  InvestmentController.fundProject
);

router.post(
  '/projects/:id/returns',
  requireModuleAccess('INVESTMENTS', 'edit'),
  financialIdempotency('INVESTMENT_RETURN'),
  InvestmentController.recordReturn
);

router.post(
  '/reinvest',
  requireModuleAccess('INVESTMENTS', 'edit'),
  financialIdempotency('INVESTMENT_REINVEST'),
  InvestmentController.reinvest
);

router.patch(
  '/projects/:id/status',
  requireModuleAccess('INVESTMENTS', 'edit'),
  InvestmentController.updateStatus
);

export default router;
