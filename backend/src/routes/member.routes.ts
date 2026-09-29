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
import { authenticate, requireRole, requireModuleAccess } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';
import multer from 'multer';
import { previewCsvImportHandler, saveCsvImportHandler } from '../controllers/member.controller.js';

const router = Router();
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (_req, file, callback) => callback(null, file.mimetype.includes('csv') || file.originalname.toLowerCase().endsWith('.csv')) });

// Stats and sequence helper (defined before /:id parameterized routes)
router.get('/stats', authenticate, getMemberStatsHandler);
router.get('/next-id', authenticate, getNextIdHandler);
router.post('/import/preview', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), requireModuleAccess('MEMBERS', 'edit'), csvUpload.single('file'), previewCsvImportHandler);
router.post('/import/save', authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), requireModuleAccess('MEMBERS', 'edit'), saveCsvImportHandler);

// CRUD routes
router.get('/', authenticate, requireModuleAccess('MEMBERS', 'view'), getMembersHandler);
router.get('/:id', authenticate, requireModuleAccess('MEMBERS', 'view'), getMemberByIdHandler);

router.post(
  '/',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  requireModuleAccess('MEMBERS', 'edit'),
  createMemberHandler
);

router.put(
  '/:id',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SUPER_ADMIN),
  requireModuleAccess('MEMBERS', 'edit'),
  updateMemberHandler
);

router.delete(
  '/:id',
  authenticate,
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  requireModuleAccess('MEMBERS', 'edit'),
  deleteMemberHandler
);

export default router;
