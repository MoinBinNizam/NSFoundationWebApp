import { Router } from 'express';
import { ReinvestmentController } from '../controllers/reinvestment.controller.js';
import { authenticate, requireInvestmentAccess } from '../middlewares/auth.js';

const router = Router();
router.use(authenticate, requireInvestmentAccess);
router.get('/stats', ReinvestmentController.getStats);
router.get('/wallets', ReinvestmentController.listWallets);
router.get('/wallets/:id/ledger', ReinvestmentController.getWalletLedger);
router.get('/chains', ReinvestmentController.listChains);
router.post('/execute', ReinvestmentController.execute);
router.post('/liquidate', ReinvestmentController.liquidate);
export default router;
