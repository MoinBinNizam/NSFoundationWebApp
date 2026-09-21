import { Router } from 'express';
import { DistributionController } from '../controllers/distribution.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();

// All distribution endpoints require authentication
router.use(authenticate);

// 1. Preview calculation (Admin & Accountant)
router.get(
  '/preview',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  DistributionController.preview
);

// 2. List batches (Admin & Accountant)
router.get(
  '/batches',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  DistributionController.listBatches
);

// 3. Create Draft Batch (Admin & Accountant)
router.post(
  '/batches',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  DistributionController.createBatch
);

// 4. Batch Detail (Admin & Accountant)
router.get(
  '/batches/:id',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  DistributionController.getBatch
);

// 5. Export Batch Allocations CSV (Admin & Accountant)
router.get(
  '/batches/:id/export',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  DistributionController.exportCsv
);

// 6. Review Batch (Admin & Accountant)
router.post(
  '/batches/:id/review',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT),
  DistributionController.reviewBatch
);

// 7. Approve Batch (Strictly Super Admin)
router.post(
  '/batches/:id/approve',
  requireRole(UserRole.SUPER_ADMIN),
  DistributionController.approveBatch
);

// 8. Execute Settlement Payout (Strictly Super Admin)
router.post(
  '/batches/:id/pay',
  requireRole(UserRole.SUPER_ADMIN),
  DistributionController.executePayment
);

export default router;
