import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  getMyPortal,
  getOrganizationTransparency,
  submitDepositRequest,
  getMyDeposits,
  getMyDepositSlip,
  getMyPaymentReceipt,
} from '../controllers/member-portal.controller.js';

const router = Router();
router.get('/me', authenticate, getMyPortal);
router.get('/organization-transparency', authenticate, getOrganizationTransparency);
router.post('/deposit-request', authenticate, submitDepositRequest);
router.get('/my-deposits', authenticate, getMyDeposits);
router.get('/my-deposits/:receiptId/slip', authenticate, getMyDepositSlip);
router.get('/payments/:paymentId/receipt', authenticate, getMyPaymentReceipt);

export default router;

