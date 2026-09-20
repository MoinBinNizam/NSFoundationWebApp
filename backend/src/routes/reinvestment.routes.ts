import { Router } from 'express';
import { ReinvestmentController } from '../controllers/reinvestment.controller.js';
import { authenticate, requireAccountant } from '../middlewares/auth.js';
import { AccountantType } from '../types/models.js';

const router = Router();
router.use(authenticate);
router.get('/stats', ReinvestmentController.getStats);
router.get('/wallets', ReinvestmentController.listWallets);
router.get('/wallets/:id/ledger', ReinvestmentController.getWalletLedger);
router.get('/chains', ReinvestmentController.listChains);
router.post('/execute', requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT), ReinvestmentController.execute);
router.post('/liquidate', requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT), ReinvestmentController.liquidate);
export default router;
