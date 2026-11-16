import { Router } from 'express';
import { CustodyController } from '../controllers/custody.controller.js';
import {
  authenticate,
  requireAccountant,
  requireRole,
  requireModuleAccess,
} from '../middlewares/auth.js';
import { financialIdempotency } from '../middlewares/security.js';
import { UserRole, AccountantType } from '../types/models.js';
import multer from 'multer';
import { createError } from '../middlewares/error.js';

const router = Router();
const transferInvoiceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype.toLowerCase())) cb(null, true);
  else cb(createError('Only JPEG, PNG, WebP, or PDF evidence is allowed', 400) as unknown as Error);
}});

// All custody routes require valid authentication
router.use(authenticate);

// Reading custody data & ledger movements
router.get('/accounts', requireModuleAccess('CUSTODY', 'view'), CustodyController.listAccounts);
router.get('/accounts/:id/balance', requireModuleAccess('CUSTODY', 'view'), CustodyController.getAccountBalance);
router.get('/summary', requireModuleAccess('CUSTODY', 'view'), CustodyController.getCustodySummary);
router.get('/movements', requireModuleAccess('CUSTODY', 'view'), CustodyController.listMovements);
router.get('/transfers', requireModuleAccess('CUSTODY', 'view'), CustodyController.listTransfers);
router.get('/transfer-invoices/file', requireModuleAccess('CUSTODY', 'view'), CustodyController.streamTransferInvoice);
router.post('/transfer-invoices', requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT), requireModuleAccess('CUSTODY', 'edit'), transferInvoiceUpload.single('file'), CustodyController.uploadTransferInvoice);

// Inter-account & cross-channel fund transfers (Primary & Assistant Accountants)
router.post(
  '/transfer',
  requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT),
  requireModuleAccess('CUSTODY', 'edit'),
  financialIdempotency('CUSTODY_TRANSFER'),
  CustodyController.executeTransfer
);

// Admin-only: create accounts and reconcile balances with physical/bank statement
router.post('/accounts', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), requireModuleAccess('CUSTODY', 'edit'), CustodyController.createAccount);
router.post('/reconcile', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), requireModuleAccess('CUSTODY', 'edit'), financialIdempotency('CUSTODY_RECONCILIATION'), CustodyController.reconcileAccount);

export default router;
