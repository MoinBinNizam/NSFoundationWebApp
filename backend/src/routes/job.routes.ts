import { Router } from 'express';
import { JobController } from '../controllers/job.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();

// All background job endpoints require authentication
router.use(authenticate);

// Staff access: Admin, Super Admin, and Accountant can list and view jobs
router.get('/', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT), JobController.list);
router.get('/stats', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT), JobController.stats);
router.get('/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.ACCOUNTANT), JobController.getById);

// Admin-only mutation actions (trigger, retry, cancel)
router.post('/trigger', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), JobController.trigger);
router.post('/:id/retry', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), JobController.retry);
router.post('/:id/cancel', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), JobController.cancel);

export default router;
