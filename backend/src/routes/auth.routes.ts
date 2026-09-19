import { Router } from 'express';
import { login, getMe, register } from '../controllers/auth.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();

// Public routes
router.post('/login', login);

// Protected routes (Any authenticated active user)
router.get('/me', authenticate, getMe);

// Admin-only route for creating new user accounts
router.post(
  '/register',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  register
);

export default router;
