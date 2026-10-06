import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { UserRole } from '../types/models.js';

const router = Router();

// Login and registration must render the same organization mark before a user has a token.
router.get('/organization-logo', SettingsController.getOrganizationLogo);

router.use(authenticate);

// Read access lets accountants apply the same organization rule in member and payment workflows.
router.get('/share-amount', SettingsController.getShareAmount);
router.get('/penalty-rules', SettingsController.getPenaltyRules);
router.get('/penalty-waivers', SettingsController.getPenaltyWaivers);
router.get('/gateway-rates', SettingsController.getGatewayRates);
router.get('/operational-end-year', SettingsController.getOperationalEndYear);
router.get('/permissions/me', SettingsController.getMyPermissions);
router.get('/member-transparency', SettingsController.getMemberTransparency);
router.get('/permissions', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.getPermissions);

// Rule changes are deliberately restricted to administrators and are audit logged.
router.post('/share-amount', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.saveShareAmount);
router.post('/penalty-rules', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.savePenaltyRule);
router.post('/penalty-waivers', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.createPenaltyWaiver);
router.put('/penalty-rules/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.updatePenaltyRule);
router.delete('/penalty-rules/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.deletePenaltyRule);
router.put('/penalty-waivers/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.updatePenaltyWaiver);
router.delete('/penalty-waivers/:id', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.deletePenaltyWaiver);
router.post('/gateway-rates', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.saveGatewayRate);
router.post('/operational-end-year', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.saveOperationalEndYear);
router.put('/member-transparency', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.saveMemberTransparency);
router.put('/organization-logo', requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN), SettingsController.saveOrganizationLogo);
router.put('/permissions', requireRole(UserRole.SUPER_ADMIN), SettingsController.savePermissions);
// Retained temporarily for older browser sessions that still submit POST.
router.post('/permissions', requireRole(UserRole.SUPER_ADMIN), SettingsController.savePermissions);

export default router;
