import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { Expense } from '../models/Expense.js';
import { User } from '../models/User.js';
import { ExpenseService } from '../services/expense.service.js';
import { AccountType } from '../types/models.js';

dotenv.config();

const demoExpenses = [
  { category: 'Office & Supplies', amount: 850, description: 'Demo: stationery and printing supplies' },
  { category: 'Utilities', amount: 1500, description: 'Demo: monthly internet and communications bill' },
  { category: 'Meeting & Events', amount: 1200, description: 'Demo: member meeting refreshments' },
  { category: 'Banking & Fees', amount: 300, description: 'Demo: account service and transfer charges' },
];

async function run() {
  try {
    await connectDatabase();
    const [user, account, existingCount] = await Promise.all([
      User.findOne({ email: 'admin@nsfoundation.org' }),
      CustodyAccount.findOne({ accountType: AccountType.ACCOUNTANT_CUSTODY, name: 'Moin Islami Bank', isActive: true }),
      Expense.countDocuments({ notes: 'Demo seed data for Issue #10 UI preview' }),
    ]);
    if (!user || !account) throw new Error('Seeded admin user or Moin Islami Bank custody account was not found.');
    if (existingCount > 0) {
      console.log('Demo expenses already exist; no duplicate records were created.');
      return;
    }

    for (const [index, demo] of demoExpenses.entries()) {
      const date = new Date();
      date.setDate(date.getDate() - index * 3);
      const result = await ExpenseService.createExpense({
        custodyAccountId: account._id.toString(),
        ...demo,
        date,
        notes: 'Demo seed data for Issue #10 UI preview',
      }, user as any);
      console.log(`Created ${result.expense.expenseNumber}: ${demo.description}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('Unable to seed demo expenses:', error);
  process.exitCode = 1;
});
