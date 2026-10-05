import { Router } from 'express';
import { login, getMe, register, listStaff, listStaffCandidates, appointMemberStaff, handoverStaff, provisionStaff, offboardStaff, publicRegister, requestPasswordReset, resetPassword, changePassword } from '../controllers/auth.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';
import { loginRateLimit } from '../middlewares/security.js';

const router = Router();

// Public routes
router.post('/login', loginRateLimit, login);
router.post('/public-register', publicRegister);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);

// Protected routes (Any authenticated active user)
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, changePassword);

// Admin-only route for creating new user accounts
router.post(
  '/register',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  register
);
router.get('/staff', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), listStaff);
router.get('/staff/candidates', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), listStaffCandidates);
router.post('/staff', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), provisionStaff);
router.post('/staff/appoint-member', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), appointMemberStaff);
router.post('/staff/handover', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), handoverStaff);
router.post('/staff/:id/offboard', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), offboardStaff);

export default router;
