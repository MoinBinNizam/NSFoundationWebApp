import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { AuditLog } from '../models/AuditLog.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { Expense } from '../models/Expense.js';
import { User } from '../models/User.js';
import { CustodyService } from '../services/custody.service.js';
import { ExpenseService } from '../services/expense.service.js';
import { AccountType } from '../types/models.js';

dotenv.config();

async function run() {
  try {
    console.log('--- Issue #10 Expense Management integration test ---');
    await connectDatabase();
    const user = await User.findOne({ email: 'admin@nsfoundation.org' });
    const account = await CustodyAccount.findOne({ accountType: AccountType.ACCOUNTANT_CUSTODY, isActive: true });
    if (!user || !account) throw new Error('Seeded accountant user or active accountant custody account is required.');

    const before = await CustodyService.getDerivedAccountBalance(account._id);
    const amount = Math.min(25, Math.max(1, Math.floor(before.currentBalance / 10)));
    if (before.currentBalance < amount) throw new Error(`Account ${account.name} does not have enough balance for the test.`);
    const result = await ExpenseService.createExpense({
      custodyAccountId: account._id.toString(), amount, category: 'Testing',
      description: `Issue #10 integration test ${Date.now()}`, notes: 'Development database verification only',
    }, user as any);
    const after = await CustodyService.getDerivedAccountBalance(account._id);
    const [expense, audit] = await Promise.all([
      Expense.findById(result.expense._id),
      AuditLog.findOne({ entityName: 'Expense', entityId: result.expense._id, action: 'CREATE_EXPENSE' }),
    ]);
    if (before.currentBalance - after.currentBalance !== amount) throw new Error('Custody balance was not reduced by the exact expense amount.');
    if (!expense?.custodyMovementId || !result.movement || !audit) throw new Error('Expense, linked movement, or audit log is missing.');
    const stats = await ExpenseService.getExpenseStats({ category: 'Testing' });
    if (stats.count < 1) throw new Error('Expense statistics do not include the posted expense.');
    console.log(`✓ ${expense.expenseNumber}: ৳${amount.toLocaleString()} deducted from ${account.name}`);
    console.log('✓ Linked ledger movement, audit log, and statistics verified.');
  } catch (error) {
    console.error('Issue #10 test failed:', error);
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
}

run();
