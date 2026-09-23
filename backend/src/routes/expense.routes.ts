import { Router } from 'express';
import { ExpenseController } from '../controllers/expense.controller.js';
import { authenticate, requireAccountant } from '../middlewares/auth.js';
import { AccountantType } from '../types/models.js';
import { financialIdempotency } from '../middlewares/security.js';

const router = Router();
router.use(authenticate);
router.get('/stats', ExpenseController.getStats);
router.get('/', ExpenseController.list);
router.get('/:id', ExpenseController.getById);
router.post('/', requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT), financialIdempotency('EXPENSE_CREATE'), ExpenseController.create);
export default router;
