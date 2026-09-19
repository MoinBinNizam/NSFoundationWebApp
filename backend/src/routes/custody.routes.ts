import { Router } from 'express';
import { CustodyController } from '../controllers/custody.controller.js';
import {
  authenticate,
  requireAccountant,
  requireRole,
} from '../middlewares/auth.js';
import { UserRole, AccountantType } from '../types/models.js';

const router = Router();

// All custody routes require valid authentication
router.use(authenticate);

// Reading custody data & ledger movements
router.get('/accounts', CustodyController.listAccounts);
router.get('/accounts/:id/balance', CustodyController.getAccountBalance);
router.get('/summary', CustodyController.getCustodySummary);
router.get('/movements', CustodyController.listMovements);
router.get('/transfers', CustodyController.listTransfers);

// Inter-account & cross-channel fund transfers (Primary & Assistant Accountants)
router.post(
  '/transfer',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  CustodyController.executeTransfer
);

// Admin-only: create accounts and reconcile balances with physical/bank statement
router.post('/accounts', requireRole(UserRole.ADMIN), CustodyController.createAccount);
router.post('/reconcile', requireRole(UserRole.ADMIN), CustodyController.reconcileAccount);

export default router;
