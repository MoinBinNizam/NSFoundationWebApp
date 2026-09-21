import { Router } from 'express';
import { InvestmentController } from '../controllers/investment.controller.js';
import {
  authenticate,
  requireInvestmentAccess,
} from '../middlewares/auth.js';

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
  InvestmentController.fundProject
);

router.post(
  '/projects/:id/returns',
  InvestmentController.recordReturn
);

router.post(
  '/reinvest',
  InvestmentController.reinvest
);

router.patch(
  '/projects/:id/status',
  InvestmentController.updateStatus
);

export default router;
