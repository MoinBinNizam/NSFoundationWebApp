import { Router } from 'express';
import multer from 'multer';
import { GovernanceController } from '../controllers/governance.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { financialIdempotency } from '../middlewares/security.js';
import { UserRole } from '../types/models.js';
import { createError } from '../middlewares/error.js';

const exitDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(createError('Invalid file type. Allowed: JPEG, PNG, WebP, PDF', 400));
    }
  },
});

const router = Router();
router.use(authenticate);
router.get('/annual/:year/summary', GovernanceController.annualSummary); router.get('/annual', GovernanceController.annualList); router.post('/annual', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), financialIdempotency('ANNUAL_CLOSING_CREATE'), GovernanceController.createAnnual); router.post('/annual/:id/:action', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), financialIdempotency('ANNUAL_CLOSING_ACTION'), GovernanceController.annualAction);
router.get('/policies/document', GovernanceController.policyDocumentGet);
router.post('/policies/document', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), GovernanceController.policyDocumentSave);
router.get('/policies', GovernanceController.policyList);
router.get('/policies/:id/versions', GovernanceController.policyVersions);
router.post('/policies', requireRole(UserRole.SUPER_ADMIN), financialIdempotency('POLICY_CREATE'), GovernanceController.policyCreate);
router.put('/policies/:id', requireRole(UserRole.SUPER_ADMIN), financialIdempotency('POLICY_AMEND'), GovernanceController.policyAmend);

router.get('/exits', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), GovernanceController.exitList);
router.get('/exits/file', GovernanceController.streamExitReceiptFile);
router.post('/exits/upload-receipt', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), exitDocUpload.single('file'), GovernanceController.uploadExitReceipt);
router.get('/exits/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), GovernanceController.exitGet);
router.post('/exits', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), financialIdempotency('MEMBER_EXIT_PROPOSE'), GovernanceController.exitPropose);
router.put('/exits/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), financialIdempotency('MEMBER_EXIT_EDIT'), GovernanceController.exitUpdate);
router.delete('/exits/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), GovernanceController.exitDelete);
router.post('/exits/:id/approve', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), financialIdempotency('MEMBER_EXIT_APPROVE'), GovernanceController.exitApprove);
router.post('/exits/:id/pay', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), financialIdempotency('MEMBER_EXIT_PAY'), GovernanceController.exitPay);
router.post('/exits/:id/settle', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), financialIdempotency('MEMBER_EXIT_SETTLE'), GovernanceController.exitSettle);
export default router;
