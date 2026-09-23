import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();
router.use(authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));
router.get('/', AuditController.list);
router.post('/verify-integrity', AuditController.verifyIntegrity);
export default router;
