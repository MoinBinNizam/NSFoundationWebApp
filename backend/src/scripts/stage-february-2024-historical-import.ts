/** Posts the reviewed February 2024 manifest. Dry-run unless STAGE_FEBRUARY_2024=YES. */
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLog, CustodyAccount, CustodyMovement, Member, MonthlyLedger, Payment, PaymentAllocation, User } from '../models/index.js';
import { AccountType, AllocationType, CustodyChannel, MonthlyLedgerStatus, MovementSourceType, MovementType, PaymentMethod, PaymentStatus } from '../types/models.js';
import { connectDatabase } from '../config/db.js';

dotenv.config();
type Ledger = { source_ref: string; member_id: string; month: string; share_count: number; principal_due: number; principal_paid: number; penalty_due: number; penalty_paid: number; advance_applied: number; excess_advance: number; status: 'PAID' | 'DUE'; comment: string };
type PaymentRow = { payment_ref: string; source_ref: string; member_id: string; payment_date: string; total_amount: number; gateway: 'BANK' | 'BKASH' | 'NAGAD' | 'CASH'; receiver_source: string; comment: string };
type Allocation = { payment_ref: string; member_id: string; target_month: string; allocation_type: 'PRINCIPAL'; amount: number; source_ref: string };
type Manifest = { ledgers: Ledger[]; payments: PaymentRow[]; allocations: Allocation[] };
const manifestPath = join(process.cwd(), '..', 'docs', 'import-historical-evidence', 'normalized-manifests', 'february-2024-staging', 'staging-manifest.json');
const methodFor = (gateway: PaymentRow['gateway']) => ({ BANK: PaymentMethod.BANK_TRANSFER, BKASH: PaymentMethod.BKASH, NAGAD: PaymentMethod.NAGAD, CASH: PaymentMethod.CASH }[gateway]);
const outstanding = (ledger: { principalDue: number; principalPaid: number; penaltyDue: number; penaltyPaid: number; penaltyWaived?: number }) => Math.max(0, ledger.principalDue - ledger.principalPaid) + Math.max(0, ledger.penaltyDue - ledger.penaltyPaid - Number(ledger.penaltyWaived || 0));

async function main() {
  await connectDatabase();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const memberCodes = [...new Set(manifest.ledgers.map((row) => row.member_id))];
  const members = await Member.find({ memberId: { $in: memberCodes } }).lean();
  const membersByCode = new Map(members.map((member) => [member.memberId, member]));
  const users = await User.find({ status: 'ACTIVE' }).select('_id name').lean();
  const accounts = await CustodyAccount.find({ isActive: true }).select('_id name holderId channel').lean();
  const routes = manifest.payments.map((row) => {
    const receiver = users.find((candidate) => candidate.name.toLowerCase().includes(row.receiver_source.toLowerCase()));
    const account = receiver && accounts.find((candidate) => String(candidate.holderId) === String(receiver._id) && candidate.channel === row.gateway);
    const canProvisionHistoricalBkash = Boolean(receiver && !account && row.gateway === 'BKASH' && row.receiver_source.toLowerCase() === 'samrat');
    return { row, receiver, account, canProvisionHistoricalBkash };
  });
  const errors = [
    ...memberCodes.filter((memberId) => !membersByCode.has(memberId)).map((memberId) => `Missing member ${memberId}`),
    ...routes.filter((route) => !route.receiver).map((route) => `No active receiver for ${route.row.payment_ref}`),
    ...routes.filter((route) => !route.account && !route.canProvisionHistoricalBkash).map((route) => `No matching custody account for ${route.row.payment_ref}`),
  ];
  const existingPayments = await Payment.countDocuments({ notes: { $regex: '\\[HIST-2024-02\\]' } });
  if (process.env.VERIFY_FEBRUARY_2024 === 'YES') {
    const imported = await Payment.find({ notes: { $regex: '\\[HIST-2024-02\\]' } }).lean();
    const ids = imported.map((payment) => payment._id);
    const [allocationCount, auditCount, februaryLedgers] = await Promise.all([
      PaymentAllocation.countDocuments({ paymentId: { $in: ids } }),
      AuditLog.collection.countDocuments({ entityId: { $in: ids }, action: 'IMPORT_HISTORICAL_MEMBER_PAYMENT' }),
      MonthlyLedger.find({ month: '2024-02' }).select('principalDue principalPaid penaltyDue penaltyPaid penaltyWaived').lean(),
    ]);
    const expectedTotal = manifest.payments.reduce((sum, row) => sum + row.total_amount, 0);
    const actualTotal = imported.reduce((sum, payment) => sum + payment.totalAmount, 0);
    const summary = { expected: { receipts: manifest.payments.length, allocations: manifest.allocations.length, received: expectedTotal, auditLogs: manifest.payments.length }, actual: { receipts: imported.length, allocations: allocationCount, received: actualTotal, auditLogs: auditCount, februaryPrincipalDue: februaryLedgers.reduce((sum, ledger) => sum + Math.max(0, ledger.principalDue - ledger.principalPaid), 0), februaryPenaltyDue: februaryLedgers.reduce((sum, ledger) => sum + Math.max(0, ledger.penaltyDue - ledger.penaltyPaid - Number(ledger.penaltyWaived || 0)), 0) } };
    console.log(JSON.stringify(summary, null, 2));
    if (imported.length !== manifest.payments.length || allocationCount !== manifest.allocations.length || actualTotal !== expectedTotal || auditCount !== manifest.payments.length) throw new Error('February staging reconciliation failed.');
    return;
  }
  console.log(JSON.stringify({ manifest: { ledgers: manifest.ledgers.length, payments: manifest.payments.length, allocations: manifest.allocations.length, received: manifest.payments.reduce((sum, row) => sum + row.total_amount, 0) }, database: { membersFound: members.length, existingFebruaryImportPayments: existingPayments }, plannedCustodyProvision: routes.filter((route) => route.canProvisionHistoricalBkash).map((route) => ({ receiver: route.receiver?.name, accountName: 'Samrat Personal bKash', channel: route.row.gateway })), errors }, null, 2));
  if (errors.length || existingPayments) throw new Error('February staging validation failed.');
  if (process.env.STAGE_FEBRUARY_2024 !== 'YES') return;

  const paymentIds: Types.ObjectId[] = [];
  const createdLedgerIds: Types.ObjectId[] = [];
  const touchedLedgerIds = new Set<string>();
  try {
    for (const route of routes.filter((item) => item.canProvisionHistoricalBkash)) {
      const name = 'Samrat Personal bKash';
      if (!await CustodyAccount.exists({ name })) await CustodyAccount.create({ name, accountType: AccountType.ACCOUNTANT_CUSTODY, holderId: route.receiver!._id, channel: CustodyChannel.BKASH, cachedBalance: 0, isActive: true, notes: 'Created from the documented February 2024 historical bKash collection mapping.' });
    }
    const activeAccounts = await CustodyAccount.find({ isActive: true }).select('_id name holderId channel').lean();
    // Reuse January-created advance ledgers for NSF023/030/031. For new
    // February ledgers, payment allocations below are the only source of paid
    // principal; this prevents a receipt from being counted twice.
    for (const row of manifest.ledgers) {
      const member = membersByCode.get(row.member_id)!;
      let ledger = await MonthlyLedger.findOne({ memberId: member._id, month: row.month });
      if (ledger) {
        ledger.shareCount = row.share_count;
        ledger.principalDue = row.principal_due;
        ledger.penaltyDue = row.penalty_due;
        ledger.lastRebuiltAt = new Date();
        await ledger.save();
      } else {
        ledger = await MonthlyLedger.create({ memberId: member._id, month: row.month, shareCount: row.share_count, principalDue: row.principal_due, principalPaid: 0, penaltyDue: row.penalty_due, penaltyPaid: 0, penaltyWaived: 0, advanceApplied: 0, excessAdvance: 0, status: MonthlyLedgerStatus.DUE, lastRebuiltAt: new Date() });
        createdLedgerIds.push(ledger._id);
      }
      touchedLedgerIds.add(String(ledger._id));
    }
    for (const route of routes) {
      const { row, receiver } = route;
      const account = activeAccounts.find((candidate) => String(candidate.holderId) === String(receiver!._id) && candidate.channel === row.gateway);
      if (!account) throw new Error(`Custody account disappeared before posting ${row.payment_ref}.`);
      const member = membersByCode.get(row.member_id)!;
      const allocations = manifest.allocations.filter((allocation) => allocation.payment_ref === row.payment_ref);
      const principalAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      const payment = await Payment.create({ receiptNumber: `HIST-202402-${row.payment_ref.split('-').at(-1)}-${row.member_id}`, memberId: member._id, receiverId: receiver!._id, custodyAccountId: account!._id, paymentDate: new Date(row.payment_date), totalAmount: row.total_amount, principalAmount, penaltyAmount: 0, cashoutCharge: 0, unpaidCashoutCharge: 0, advanceAmount: 0, paymentMethod: methodFor(row.gateway), status: PaymentStatus.COLLECTED, transactionReference: '', notes: `[HIST-2024-02] ${row.source_ref}; ${row.comment}`.trim() });
      paymentIds.push(payment._id);
      await PaymentAllocation.insertMany(allocations.map((allocation) => ({ paymentId: payment._id, memberId: member._id, targetMonth: allocation.target_month, allocationType: AllocationType.PRINCIPAL, amount: allocation.amount })));
      for (const allocation of allocations) {
        const target = await MonthlyLedger.findOne({ memberId: member._id, month: allocation.target_month });
        if (!target) throw new Error(`Missing target ledger ${allocation.target_month} for ${row.member_id}`);
        target.principalPaid += allocation.amount;
        target.lastRebuiltAt = new Date();
        await target.save();
        touchedLedgerIds.add(String(target._id));
      }
      await CustodyMovement.create({ custodyAccountId: account!._id, movementType: MovementType.IN, amount: row.total_amount, sourceType: MovementSourceType.MEMBER_PAYMENT, sourceRefId: payment._id, date: new Date(row.payment_date), description: `Historical February 2024 collection from ${member.memberId}`, performedBy: receiver!._id });
      await AuditLog.create({ performedBy: receiver!._id, action: 'IMPORT_HISTORICAL_MEMBER_PAYMENT', entityName: 'Payment', entityId: payment._id, afterState: { sourceRef: row.source_ref, paymentRef: row.payment_ref, period: '2024-02', totalAmount: row.total_amount, principal: principalAmount }, reason: 'Approved February 2024 historical source import.' });
    }
    for (const id of touchedLedgerIds) {
      const ledger = await MonthlyLedger.findById(id);
      if (!ledger) continue;
      ledger.status = outstanding(ledger) === 0 ? MonthlyLedgerStatus.PAID : (ledger.principalPaid > 0 || ledger.penaltyPaid > 0 ? MonthlyLedgerStatus.PARTIAL : MonthlyLedgerStatus.DUE);
      await ledger.save();
    }
    for (const account of accounts) {
      const totals = await CustodyMovement.aggregate<{ _id: MovementType; total: number }>([{ $match: { custodyAccountId: account._id } }, { $group: { _id: '$movementType', total: { $sum: '$amount' } } }]);
      await CustodyAccount.updateOne({ _id: account._id }, { $set: { cachedBalance: totals.reduce((sum, item) => sum + (item._id === MovementType.IN ? item.total : -item.total), 0) } });
    }
    const receipts = await Payment.find({ notes: { $regex: '\\[HIST-2024-02\\]' } }).lean();
    const amount = receipts.reduce((sum, payment) => sum + payment.totalAmount, 0);
    if (receipts.length !== manifest.payments.length || amount !== manifest.payments.reduce((sum, row) => sum + row.total_amount, 0)) throw new Error('February reconciliation failed.');
    console.log(`Posted and reconciled February 2024: ${receipts.length} receipts totaling ৳${amount}.`);
  } catch (error) {
    if (paymentIds.length) { await CustodyMovement.deleteMany({ sourceRefId: { $in: paymentIds } }); await PaymentAllocation.deleteMany({ paymentId: { $in: paymentIds } }); await AuditLog.collection.deleteMany({ entityId: { $in: paymentIds } }); await Payment.deleteMany({ _id: { $in: paymentIds } }); }
    if (createdLedgerIds.length) await MonthlyLedger.deleteMany({ _id: { $in: createdLedgerIds } });
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => mongoose.disconnect());
