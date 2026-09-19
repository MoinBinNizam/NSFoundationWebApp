import { Router } from 'express';
import {
  createMemberHandler,
  getMembersHandler,
  getMemberByIdHandler,
  updateMemberHandler,
  deleteMemberHandler,
  getMemberStatsHandler,
  getNextIdHandler,
} from '../controllers/member.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();

// Stats and sequence helper (defined before /:id parameterized routes)
router.get('/stats', authenticate, getMemberStatsHandler);
router.get('/next-id', authenticate, getNextIdHandler);

// CRUD routes
router.get('/', authenticate, getMembersHandler);
router.get('/:id', authenticate, getMemberByIdHandler);

router.post(
  '/',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  createMemberHandler
);

router.put(
  '/:id',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  updateMemberHandler
);

router.delete(
  '/:id',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  deleteMemberHandler
);

export default router;
