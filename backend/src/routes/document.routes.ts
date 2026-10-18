import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate);

// Member Statement
router.get('/members/:memberId/statement.pdf', DocumentController.statement);

// Annual Society Reports
router.get('/annual/:year/report.pdf', DocumentController.annual);
router.get('/annual/:year/data', DocumentController.annualData);

// Super Admin Audit Pack
router.get('/annual/:year/audit-pack.pdf', DocumentController.audit);
router.get('/annual/:year/audit-data', DocumentController.auditData);

export default router;
