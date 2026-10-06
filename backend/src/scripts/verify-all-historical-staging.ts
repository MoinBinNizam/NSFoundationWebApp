import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Payment, PaymentAllocation, CustodyMovement, CustodyAccount, AuditLog } from '../models/index.js';
import { connectDatabase } from '../config/db.js';

dotenv.config();

async function verifyAll() {
  await connectDatabase();

  const payments = await Payment.find({ notes: { $regex: '\\[HIST-' } }).lean();
  const paymentTotal = payments.reduce((s, p) => s + p.totalAmount, 0);

  const allocations = await PaymentAllocation.find().lean();
  const allocationTotal = allocations.reduce((s, a) => s + a.amount, 0);

  const movements = await CustodyMovement.find({ sourceType: 'MEMBER_PAYMENT' }).lean();
  const movementTotal = movements.reduce((s, m) => s + m.amount, 0);

  const auditLogs = await AuditLog.collection.countDocuments({ action: 'IMPORT_HISTORICAL_MEMBER_PAYMENT' });
  const accounts = await CustodyAccount.find({ isActive: true }).select('name channel cachedBalance').lean();

  console.log(JSON.stringify({
    historicalPayments: payments.length,
    paymentTotal,
    allocationsCount: allocations.length,
    allocationTotal,
    custodyMovements: movements.length,
    movementTotal,
    auditLogs,
    accounts: accounts.map(a => ({ name: a.name, channel: a.channel, balance: a.cachedBalance }))
  }, null, 2));

  await mongoose.disconnect();
}

verifyAll();
