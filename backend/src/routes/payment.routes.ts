import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import {
  authenticate,
  requireAccountant,
  requireRole,
} from '../middlewares/auth.js';
import { UserRole, AccountantType } from '../types/models.js';

const router = Router();

// All payment routes require valid authentication
router.use(authenticate);

// Public/Staff reading routes
router.get('/stats', PaymentController.getContributionStats);
router.get('/custody-accounts', PaymentController.getCustodyAccounts);
router.get('/gateway-rates', PaymentController.getGatewayRates);
router.get('/penalty-rules', PaymentController.getPenaltyRules);
router.get('/penalty-waivers', PaymentController.getPenaltyWaivers);
router.get('/', PaymentController.listPayments);
router.get('/:id', PaymentController.getPaymentDetails);

// Accountant collection routes (Accessible by both Primary and Assistant Accountants)
router.post(
  '/preview',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  PaymentController.previewPayment
);
router.post(
  '/',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  PaymentController.createPayment
);

// Admin-only penalty rules & waiver configurations
router.post('/penalty-rules', requireRole(UserRole.ADMIN), PaymentController.savePenaltyRule);
router.post('/penalty-waivers', requireRole(UserRole.ADMIN), PaymentController.createPenaltyWaiver);

export default router;
