import { Router } from 'express';
import { MigrationController } from '../controllers/migration.controller.js';
import { authenticate, requireMigrationAccess } from '../middlewares/auth.js';
const router = Router();
router.use(authenticate, requireMigrationAccess);
router.get('/batches', MigrationController.batches); router.post('/stage', MigrationController.stage); router.get('/batches/:id/records', MigrationController.records); router.get('/batches/:id/reconciliation', MigrationController.reconciliation); router.post('/records/:id/review', MigrationController.review);
export default router;
