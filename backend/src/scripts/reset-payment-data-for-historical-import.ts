/**
 * Development/staging-only reset before posting approved historical manifests.
 * It intentionally preserves members, users, shares, custody accounts,
 * investments, expenses, settings, and unrelated audit records.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectDatabase } from '../config/db.js';
import { AuditLog, CustodyAccount, CustodyMovement, Expense, InvestmentProject, Member, MonthlyLedger, Payment, PaymentAllocation, PaymentReceipt, ShareHistory, User } from '../models/index.js';
import { MovementSourceType, MovementType } from '../types/models.js';

dotenv.config();

async function counts() {
  const payments = await Payment.find().select('_id').lean();
  const paymentIds = payments.map((payment) => payment._id);
  const [allocations, ledgers, movements, receipts, audits, memberCashoutDues] = await Promise.all([
    PaymentAllocation.countDocuments({}),
    MonthlyLedger.countDocuments({}),
    CustodyMovement.countDocuments({ sourceType: MovementSourceType.MEMBER_PAYMENT }),
    PaymentReceipt.countDocuments({}),
    paymentIds.length ? AuditLog.collection.countDocuments({ entityId: { $in: paymentIds } }) : 0,
    Member.countDocuments({ cashoutDue: { $gt: 0 } }),
  ]);
  return { paymentIds, payments: paymentIds.length, allocations, ledgers, movements, receipts, audits, memberCashoutDues };
}

async function preservedCounts() {
  const [members, users, shares, custodyAccounts, investments, expenses] = await Promise.all([
    Member.countDocuments(), User.countDocuments(), ShareHistory.countDocuments(), CustodyAccount.countDocuments(), InvestmentProject.countDocuments(), Expense.countDocuments(),
  ]);
  return { members, users, shares, custodyAccounts, investments, expenses };
}

async function refreshCachedBalances(): Promise<void> {
  for (const account of await CustodyAccount.find().select('_id')) {
    const totals = await CustodyMovement.aggregate<{ _id: MovementType; total: number }>([
      { $match: { custodyAccountId: account._id } },
      { $group: { _id: '$movementType', total: { $sum: '$amount' } } },
    ]);
    const balance = totals.reduce((sum, item) => sum + (item._id === MovementType.IN ? item.total : -item.total), 0);
    await CustodyAccount.updateOne({ _id: account._id }, { $set: { cachedBalance: balance } });
  }
}

async function snapshot(paymentIds: mongoose.Types.ObjectId[]): Promise<string> {
  const outputDir = join(process.cwd(), '..', 'docs', 'import-historical-evidence', 'pre-reset-snapshots');
  await mkdir(outputDir, { recursive: true });
  const file = join(outputDir, `payment-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    payments: await Payment.find().lean(),
    allocations: await PaymentAllocation.find().lean(),
    monthlyLedgers: await MonthlyLedger.find().lean(),
    paymentMovements: await CustodyMovement.find({ sourceType: MovementSourceType.MEMBER_PAYMENT }).lean(),
    receipts: await PaymentReceipt.find().lean(),
    paymentAuditLogs: paymentIds.length ? await AuditLog.collection.find({ entityId: { $in: paymentIds } }).toArray() : [],
    memberCashoutDues: await Member.find({ cashoutDue: { $gt: 0 } }).select('_id memberId cashoutDue').lean(),
  };
  await writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

async function main(): Promise<void> {
  await connectDatabase();
  const before = await counts();
  const preservedBefore = await preservedCounts();
  console.log('Payment reset scope:', { ...before, paymentIds: undefined });
  console.log('Preserved collection counts:', preservedBefore);
  if (process.env.RESET_PAYMENT_DATA !== 'YES') {
    console.log('Dry run only. Set RESET_PAYMENT_DATA=YES to create a private snapshot and clear the listed payment-derived records.');
    return;
  }
  const snapshotFile = await snapshot(before.paymentIds);
  const result = {
    allocations: await PaymentAllocation.deleteMany({}),
    ledgers: await MonthlyLedger.deleteMany({}),
    paymentMovements: await CustodyMovement.deleteMany({ sourceType: MovementSourceType.MEMBER_PAYMENT }),
    receipts: await PaymentReceipt.collection.deleteMany({}),
    paymentAudits: before.paymentIds.length ? await AuditLog.collection.deleteMany({ entityId: { $in: before.paymentIds } }) : { deletedCount: 0 },
    payments: await Payment.deleteMany({}),
    memberCashoutDues: await Member.updateMany({ cashoutDue: { $ne: 0 } }, { $set: { cashoutDue: 0 } }),
  };
  await refreshCachedBalances();
  const after = await counts();
  const preservedAfter = await preservedCounts();
  console.log('Private snapshot:', snapshotFile);
  console.log('Reset result:', result);
  console.log('Post-reset payment scope:', { ...after, paymentIds: undefined });
  console.log('Post-reset preserved collection counts:', preservedAfter);
  if (after.payments || after.allocations || after.ledgers || after.movements || after.receipts || after.audits || after.memberCashoutDues) {
    throw new Error('Payment reset verification failed: one or more targeted records remain.');
  }
  if (JSON.stringify(preservedBefore) !== JSON.stringify(preservedAfter)) {
    throw new Error('Reset verification failed: a preserved collection count changed.');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
