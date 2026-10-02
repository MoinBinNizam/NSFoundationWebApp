import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import {
  AuditLog,
  CustodyAccount,
  CustodyMovement,
  MonthlyLedger,
  Payment,
  PaymentAllocation,
  PaymentReceipt,
} from '../models/index.js';
import { MovementType } from '../types/models.js';

dotenv.config();

const DEMO_RECEIPTS = ['RCP-202401-0001', 'RCP-202401-0002'];
const OPENING_DESCRIPTIONS = [
  'Opening IBBL Operating Balance',
  'Opening Nagad Wallet Balance',
  'Opening bKash Gateway Balance',
  'Opening Physical Petty Cash Vault',
];

async function refreshCachedBalances(): Promise<void> {
  const accounts = await CustodyAccount.find().select('_id');
  for (const account of accounts) {
    const totals = await CustodyMovement.aggregate<{ _id: MovementType; total: number }>([
      { $match: { custodyAccountId: account._id } },
      { $group: { _id: '$movementType', total: { $sum: '$amount' } } },
    ]);
    const balance = totals.reduce((sum, item) => sum + (item._id === MovementType.IN ? item.total : -item.total), 0);
    await CustodyAccount.updateOne({ _id: account._id }, { $set: { cachedBalance: balance } });
  }
}

async function main(): Promise<void> {
  if (process.env.REMOVE_DEMO_FINANCIAL_DATA !== 'YES') {
    throw new Error('Refusing to change data. Set REMOVE_DEMO_FINANCIAL_DATA=YES to remove only the known demo financial records.');
  }

  await connectDatabase();
  const payments = await Payment.find({ receiptNumber: { $in: DEMO_RECEIPTS } }).select('_id memberId receiptNumber');
  const paymentIds = payments.map((payment) => payment._id);
  const result = {
    openingMovements: await CustodyMovement.deleteMany({ description: { $in: OPENING_DESCRIPTIONS } }),
    paymentMovements: paymentIds.length ? await CustodyMovement.deleteMany({ sourceRefId: { $in: paymentIds } }) : { deletedCount: 0 },
    allocations: paymentIds.length ? await PaymentAllocation.deleteMany({ paymentId: { $in: paymentIds } }) : { deletedCount: 0 },
    monthlyLedgers: await Promise.all(payments.map((payment) => MonthlyLedger.deleteMany({ memberId: payment.memberId, month: '2024-01', principalPaid: { $in: [2000, 2500] }, penaltyPaid: 0 }))),
    receipts: paymentIds.length ? await PaymentReceipt.collection.deleteMany({ paymentId: { $in: paymentIds } }) : { deletedCount: 0 },
    auditLogs: paymentIds.length ? await AuditLog.collection.deleteMany({ entityId: { $in: paymentIds } }) : { deletedCount: 0 },
    payments: paymentIds.length ? await Payment.deleteMany({ _id: { $in: paymentIds } }) : { deletedCount: 0 },
  };

  await refreshCachedBalances();
  console.log('Removed only the known demo financial records and recalculated custody balances.', result);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
