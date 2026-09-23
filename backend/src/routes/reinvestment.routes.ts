import { Router } from 'express';
import { ReinvestmentController } from '../controllers/reinvestment.controller.js';
import { authenticate, requireInvestmentAccess } from '../middlewares/auth.js';
import { financialIdempotency } from '../middlewares/security.js';

const router = Router();
router.use(authenticate, requireInvestmentAccess);
router.get('/stats', ReinvestmentController.getStats);
router.get('/wallets', ReinvestmentController.listWallets);
router.get('/wallets/:id/ledger', ReinvestmentController.getWalletLedger);
router.get('/chains', ReinvestmentController.listChains);
router.post('/execute', financialIdempotency('WALLET_REINVESTMENT'), ReinvestmentController.execute);
router.post('/liquidate', financialIdempotency('WALLET_LIQUIDATION'), ReinvestmentController.liquidate);
export default router;
