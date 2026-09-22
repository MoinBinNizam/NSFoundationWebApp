import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();

router.use(authenticate);

// Read access lets accountants apply the same organization rule in member and payment workflows.
router.get('/share-amount', SettingsController.getShareAmount);
router.get('/penalty-rules', SettingsController.getPenaltyRules);
router.get('/penalty-waivers', SettingsController.getPenaltyWaivers);
router.get('/gateway-rates', SettingsController.getGatewayRates);

// Rule changes are deliberately restricted to administrators and are audit logged.
router.post('/share-amount', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.saveShareAmount);
router.post('/penalty-rules', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.savePenaltyRule);
router.post('/penalty-waivers', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.createPenaltyWaiver);
router.post('/gateway-rates', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.saveGatewayRate);

export default router;
