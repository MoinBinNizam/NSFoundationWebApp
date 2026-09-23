import { Router } from 'express';
import { InvestmentController } from '../controllers/investment.controller.js';
import {
  authenticate,
  requireInvestmentAccess,
} from '../middlewares/auth.js';
import { financialIdempotency } from '../middlewares/security.js';

const router = Router();

// All investment routes require valid authentication
router.use(authenticate, requireInvestmentAccess);

// Public / Read routes
router.get('/stats', InvestmentController.getStats);
router.get('/projects', InvestmentController.listProjects);
router.get('/projects/:id', InvestmentController.getProjectDetails);

// Investment access is restricted to administrators/primary accountant (Moin).
router.post(
  '/projects',
  InvestmentController.createProject
);

router.post(
  '/projects/:id/fund',
  financialIdempotency('INVESTMENT_FUND'),
  InvestmentController.fundProject
);

router.post(
  '/projects/:id/returns',
  financialIdempotency('INVESTMENT_RETURN'),
  InvestmentController.recordReturn
);

router.post(
  '/reinvest',
  financialIdempotency('INVESTMENT_REINVEST'),
  InvestmentController.reinvest
);

router.patch(
  '/projects/:id/status',
  InvestmentController.updateStatus
);

export default router;
