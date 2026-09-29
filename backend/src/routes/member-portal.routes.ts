import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getMyPortal, getOrganizationTransparency } from '../controllers/member-portal.controller.js';

const router = Router();
router.get('/me', authenticate, getMyPortal);
router.get('/organization-transparency', authenticate, getOrganizationTransparency);
export default router;
