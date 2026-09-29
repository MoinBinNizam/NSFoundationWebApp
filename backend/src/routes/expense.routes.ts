import { Router } from 'express';
import { ExpenseController } from '../controllers/expense.controller.js';
import { authenticate, requireAccountant, requireModuleAccess } from '../middlewares/auth.js';
import { AccountantType } from '../types/models.js';
import { financialIdempotency } from '../middlewares/security.js';

const router = Router();
router.use(authenticate);
router.get('/stats', requireModuleAccess('EXPENSES', 'view'), ExpenseController.getStats);
router.get('/', requireModuleAccess('EXPENSES', 'view'), ExpenseController.list);
router.get('/:id', requireModuleAccess('EXPENSES', 'view'), ExpenseController.getById);
router.post('/', requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT), requireModuleAccess('EXPENSES', 'edit'), financialIdempotency('EXPENSE_CREATE'), ExpenseController.create);
export default router;
