import { Router } from 'express';
import { MigrationController } from '../controllers/migration.controller.js';
import { authenticate, requireMigrationAccess } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate, requireMigrationAccess);

// One-Click Historical Data Sync Endpoints
router.get('/overview', MigrationController.overview);
router.get('/history', MigrationController.history);
router.get('/module-visibility', MigrationController.getModuleVisibility);
router.put('/module-visibility', MigrationController.setModuleVisibility);

router.post('/sync/members', MigrationController.syncMembers);
router.post('/sync/2024', MigrationController.sync2024);
router.post('/sync/2025', MigrationController.sync2025);
router.post('/sync/expenses', MigrationController.syncExpenses);
router.post('/sync/investments', MigrationController.syncInvestments);

// Safe Purge Endpoints (Selective Rollback / Delete)
router.post('/purge/members', MigrationController.purgeMembers);
router.post('/purge/2024', MigrationController.purge2024);
router.post('/purge/2025', MigrationController.purge2025);
router.post('/purge/expenses', MigrationController.purgeExpenses);
router.post('/purge/investments', MigrationController.purgeInvestments);

// Legacy CSV Batches and Reviews
router.get('/batches', MigrationController.batches);
router.post('/stage', MigrationController.stage);
router.get('/batches/:id/records', MigrationController.records);
router.get('/batches/:id/reconciliation', MigrationController.reconciliation);
router.post('/records/:id/review', MigrationController.review);

export default router;
