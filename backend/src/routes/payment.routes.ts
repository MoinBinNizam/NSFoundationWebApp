import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import {
  authenticate,
  requireAccountant,
  requireRole,
  requireModuleAccess,
} from '../middlewares/auth.js';
import { financialIdempotency } from '../middlewares/security.js';
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
router.get('/', requireModuleAccess('PAYMENTS', 'view'), PaymentController.listPayments);
router.get('/:id', requireModuleAccess('PAYMENTS', 'view'), PaymentController.getPaymentDetails);

// Accountant collection routes (Accessible by both Primary and Assistant Accountants)
router.post(
  '/preview',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  requireModuleAccess('PAYMENTS', 'edit'),
  PaymentController.previewPayment
);
router.post(
  '/',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  requireModuleAccess('PAYMENTS', 'edit'),
  financialIdempotency('PAYMENT_CREATE'),
  PaymentController.createPayment
);

// Admin-only penalty rules & waiver configurations
router.post('/penalty-rules', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), requireModuleAccess('PAYMENTS', 'edit'), PaymentController.savePenaltyRule);
router.post('/penalty-waivers', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), requireModuleAccess('PAYMENTS', 'edit'), PaymentController.createPenaltyWaiver);

export default router;
