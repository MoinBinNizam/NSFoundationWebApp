import { Router } from 'express';
import { InvestmentController } from '../controllers/investment.controller.js';
import {
  authenticate,
  requireAccountant,
} from '../middlewares/auth.js';
import { AccountantType } from '../types/models.js';

const router = Router();

// All investment routes require valid authentication
router.use(authenticate);

// Public / Read routes
router.get('/stats', InvestmentController.getStats);
router.get('/projects', InvestmentController.listProjects);
router.get('/projects/:id', InvestmentController.getProjectDetails);

// Accountant Operations (Primary & Assistant Accountants)
router.post(
  '/projects',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  InvestmentController.createProject
);

router.post(
  '/projects/:id/fund',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  InvestmentController.fundProject
);

router.post(
  '/projects/:id/returns',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  InvestmentController.recordReturn
);

router.post(
  '/reinvest',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  InvestmentController.reinvest
);

router.patch(
  '/projects/:id/status',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  InvestmentController.updateStatus
);

export default router;
