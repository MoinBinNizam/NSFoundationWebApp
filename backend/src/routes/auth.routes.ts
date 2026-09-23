import { Router } from 'express';
import { login, getMe, register, listStaff, provisionStaff, offboardStaff, publicRegister, requestPasswordReset, resetPassword } from '../controllers/auth.controller.js';
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

// Admin-only route for creating new user accounts
router.post(
  '/register',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  register
);
router.get('/staff', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), listStaff);
router.post('/staff', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), provisionStaff);
router.post('/staff/:id/offboard', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), offboardStaff);

export default router;
