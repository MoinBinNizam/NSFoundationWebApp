import { Router } from 'express';
import { MigrationController } from '../controllers/migration.controller.js';
import { authenticate, requireMigrationAccess } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate, requireMigrationAccess);

// One-Click Historical Data Sync Endpoints
router.get('/overview', MigrationController.overview);
router.post('/sync/2024', MigrationController.sync2024);
router.post('/sync/2025', MigrationController.sync2025);
router.post('/sync/expenses', MigrationController.syncExpenses);
router.post('/sync/investments', MigrationController.syncInvestments);

// Legacy CSV Batches and Reviews
router.get('/batches', MigrationController.batches);
router.post('/stage', MigrationController.stage);
router.get('/batches/:id/records', MigrationController.records);
router.get('/batches/:id/reconciliation', MigrationController.reconciliation);
router.post('/records/:id/review', MigrationController.review);

export default router;
