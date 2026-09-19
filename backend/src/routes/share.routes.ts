import { Router } from 'express';
import {
  getShareStatsHandler,
  getShareHistoryHandler,
  getMembersWithSharesHandler,
  getMemberShareDetailHandler,
  recordShareChangeHandler,
  recordShareTransferHandler,
  reconcileYearAccountHandler,
  getYearAccountsHandler,
} from '../controllers/share.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();

// Stats and queries
router.get('/stats', authenticate, getShareStatsHandler);
router.get('/history', authenticate, getShareHistoryHandler);
router.get('/members-shares', authenticate, getMembersWithSharesHandler);
router.get('/annual-accounts', authenticate, getYearAccountsHandler);
router.get('/member/:memberId', authenticate, getMemberShareDetailHandler);

// Modifications & Actions (Admin & Accountant)
router.post(
  '/change',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  recordShareChangeHandler
);

router.post(
  '/transfer',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  recordShareTransferHandler
);

router.post(
  '/reconcile-year',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  reconcileYearAccountHandler
);

export default router;
