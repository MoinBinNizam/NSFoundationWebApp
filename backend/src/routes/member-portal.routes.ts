import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { getMyPortal, getOrganizationTransparency, submitDepositRequest } from '../controllers/member-portal.controller.js';

const router = Router();
router.get('/me', authenticate, getMyPortal);
router.get('/organization-transparency', authenticate, getOrganizationTransparency);
router.post('/deposit-request', authenticate, submitDepositRequest);
export default router;
