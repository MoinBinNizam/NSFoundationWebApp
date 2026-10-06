/**
 * Validates and posts the approved January 2024 historical staging manifest.
 * Dry-run is the default. Set STAGE_JANUARY_2024=YES only after reviewing the
 * generated manifest and source-to-database mapping printed by this command.
 */
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connectDatabase } from '../config/db.js';
import { AuditLog, CustodyAccount, CustodyMovement, Member, MonthlyLedger, Payment, PaymentAllocation, User } from '../models/index.js';
import { AccountType, AllocationType, CustodyChannel, MonthlyLedgerStatus, MovementSourceType, MovementType, PaymentMethod, PaymentStatus } from '../types/models.js';
import { PaymentService } from '../services/payment.service.js';

dotenv.config();

type LedgerRow = { source_ref: string; member_id: string; member_name: string; month: string; share_count: string; principal_due: string; principal_paid: string; penalty_due: string; penalty_paid: string; advance_applied: string; excess_advance: string; status: 'PAID' | 'DUE'; source_row: number; comment: string };
type PaymentRow = { payment_ref: string; source_ref: string; member_id: string; member_name: string; payment_date: string; total_amount: string; gateway: 'BANK' | 'BKASH' | 'NAGAD' | 'CASH'; receiver_source: string; penalty_amount: string; cashout_charge: string; transaction_reference: string; comment: string };
type AllocationRow = { payment_ref: string; member_id: string; target_month: string; allocation_type: 'PRINCIPAL' | 'ADVANCE'; amount: string; source_ref: string };
type Manifest = { ledgers: LedgerRow[]; payments: PaymentRow[]; allocations: AllocationRow[] };

const MANIFEST = join(process.cwd(), '..', 'docs', 'import-historical-evidence', 'normalized-manifests', 'january-2024-staging', 'staging-manifest.json');
const methodFor = (channel: PaymentRow['gateway']): PaymentMethod => ({ BANK: PaymentMethod.BANK_TRANSFER, BKASH: PaymentMethod.BKASH, NAGAD: PaymentMethod.NAGAD, CASH: PaymentMethod.CASH }[channel]);
const amount = (value: string) => Number(value || 0);

async function verify(manifest: Manifest): Promise<void> {
  const payments = await Payment.find({ notes: { $regex: '\\[HIST-2024-01\\]' } }).select('_id totalAmount paymentMethod').lean();
  const ids = payments.map((payment) => payment._id);
  const [allocations, movements, audits, ledgers] = await Promise.all([
    PaymentAllocation.countDocuments({ paymentId: { $in: ids } }),
    CustodyMovement.aggregate<{ _id: string; total: number }>([{ $match: { sourceRefId: { $in: ids }, sourceType: MovementSourceType.MEMBER_PAYMENT } }, { $group: { _id: '$movementType', total: { $sum: '$amount' } } }]),
    AuditLog.collection.countDocuments({ entityId: { $in: ids }, action: 'IMPORT_HISTORICAL_MEMBER_PAYMENT' }),
    MonthlyLedger.find({ month: { $in: [...new Set(manifest.ledgers.map((row) => row.month))] } }).select('month status principalDue principalPaid').lean(),
  ]);
  const expectedPaymentTotal = manifest.payments.reduce((sum, payment) => sum + amount(payment.total_amount), 0);
  const actualPaymentTotal = payments.reduce((sum, payment) => sum + payment.totalAmount, 0);
  const januaryDue = ledgers.filter((ledger) => ledger.month === '2024-01').reduce((sum, ledger) => sum + Math.max(0, ledger.principalDue - ledger.principalPaid), 0);
  const movementIn = movements.find((movement) => movement._id === MovementType.IN)?.total || 0;
  const result = { expected: { payments: manifest.payments.length, allocations: manifest.allocations.length, ledgers: manifest.ledgers.length, paymentTotal: expectedPaymentTotal, januaryDue: 4500, auditLogs: manifest.payments.length }, actual: { payments: payments.length, allocations, ledgers: ledgers.length, paymentTotal: actualPaymentTotal, custodyInflow: movementIn, januaryDue, auditLogs: audits, ledgerStatus: ledgers.reduce<Record<string, number>>((summary, ledger) => { summary[ledger.status] = (summary[ledger.status] || 0) + 1; return summary; }, {}) } };
  console.log(JSON.stringify(result, null, 2));
  if (payments.length !== result.expected.payments || allocations !== result.expected.allocations || ledgers.length !== result.expected.ledgers || actualPaymentTotal !== expectedPaymentTotal || movementIn !== expectedPaymentTotal || januaryDue !== result.expected.januaryDue || audits !== result.expected.auditLogs) throw new Error('January 2024 staging reconciliation failed.');
}

async function main(): Promise<void> {
  await connectDatabase();
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as Manifest;
  if (process.env.VERIFY_JANUARY_2024 === 'YES') { await verify(manifest); return; }
  const memberIds = [...new Set(manifest.ledgers.map((row) => row.member_id))];
  const members = await Member.find({ memberId: { $in: memberIds } }).lean();
  const memberByCode = new Map(members.map((member) => [member.memberId, member]));
  const missingMembers = memberIds.filter((memberId) => !memberByCode.has(memberId));
  const users = await User.find({ status: 'ACTIVE' }).select('_id name').lean();
  const receiverBySource = new Map<string, (typeof users)[number]>();
  for (const source of ['Moin', 'Samrat']) {
    const match = users.find((user) => user.name.toLowerCase().includes(source.toLowerCase()));
    if (match) receiverBySource.set(source, match);
  }
  let accounts = await CustodyAccount.find({ isActive: true }).select('_id name holderId channel').lean();
  const mappedPayments = manifest.payments.map((payment) => {
    const receiver = receiverBySource.get(payment.receiver_source);
    const account = receiver ? accounts.find((item) => String(item.holderId) === String(receiver._id) && item.channel === payment.gateway) : undefined;
    const canProvisionHistoricalCash = Boolean(receiver && !account && payment.gateway === 'CASH');
    return { payment, receiver, account, canProvisionHistoricalCash };
  });
  const mappingErrors = [
    ...missingMembers.map((memberId) => `Missing registered member: ${memberId}`),
    ...mappedPayments.filter(({ receiver }) => !receiver).map(({ payment }) => `No active user matches receiver '${payment.receiver_source}' for ${payment.payment_ref}`),
    ...mappedPayments.filter(({ account, canProvisionHistoricalCash }) => !account && !canProvisionHistoricalCash).map(({ payment }) => `No active ${payment.gateway} custody account belongs to ${payment.receiver_source} for ${payment.payment_ref}`),
  ];
  const existing = await Payment.countDocuments({ notes: { $regex: '\\[HIST-2024-01\\]' } });
  console.log(JSON.stringify({ manifest: { ledgers: manifest.ledgers.length, payments: manifest.payments.length, allocations: manifest.allocations.length }, database: { membersFound: members.length, activeUsers: users.length, activeCustodyAccounts: accounts.length, existingJanuaryImportPayments: existing }, plannedCustodyProvision: mappedPayments.filter(({ canProvisionHistoricalCash }) => canProvisionHistoricalCash).map(({ payment, receiver }) => ({ receiver: receiver?.name, channel: payment.gateway, accountName: `${payment.receiver_source} Physical Petty Cash` })), mappingErrors, mappings: mappedPayments.map(({ payment, receiver, account }) => ({ paymentRef: payment.payment_ref, member: payment.member_id, receiver: receiver?.name || null, custodyAccount: account?.name || (payment.gateway === 'CASH' ? `${payment.receiver_source} Physical Petty Cash (will create)` : null), channel: payment.gateway })) }, null, 2));
  if (mappingErrors.length || existing) throw new Error('Historical staging validation failed. Resolve the reported mapping errors or existing import records before posting.');
  if (process.env.STAGE_JANUARY_2024 !== 'YES') {
    console.log('Dry run passed. Set STAGE_JANUARY_2024=YES to post this exact approved manifest.');
    return;
  }
  const insertedPaymentIds: Types.ObjectId[] = [];
  const insertedLedgerIds: Types.ObjectId[] = [];
  try {
    for (const route of mappedPayments.filter(({ canProvisionHistoricalCash }) => canProvisionHistoricalCash)) {
      const name = `${route.payment.receiver_source} Physical Petty Cash`;
      const existingAccount = await CustodyAccount.findOne({ name });
      if (!existingAccount) await CustodyAccount.create({ name, accountType: AccountType.ACCOUNTANT_CUSTODY, holderId: route.receiver!._id, channel: CustodyChannel.CASH, accountNumber: 'CASH-VAULT-02', cachedBalance: 0, isActive: true, notes: 'Physical petty cash custody created for approved January 2024 historical self-cash collection staging.' });
    }
    accounts = await CustodyAccount.find({ isActive: true }).select('_id name holderId channel').lean();
    for (const ledger of manifest.ledgers) {
      const member = memberByCode.get(ledger.member_id)!;
      const isWaived = await PaymentService.isMonthWaived(ledger.month, member._id);
      const rule = await PaymentService.getPenaltyRule(ledger.month);
      const rawPenalty = amount(ledger.penalty_due);
      const penaltyDue = isWaived ? 0 : (rawPenalty || (ledger.status === 'DUE' && amount(ledger.principal_due) > amount(ledger.principal_paid) ? amount(ledger.share_count) * rule.ratePerShare : 0));
      const penaltyWaived = isWaived && rawPenalty ? rawPenalty : 0;
      const createdLedger = await MonthlyLedger.create({ memberId: member._id, month: ledger.month, shareCount: amount(ledger.share_count), principalDue: amount(ledger.principal_due), principalPaid: amount(ledger.principal_paid), penaltyDue, penaltyPaid: 0, penaltyWaived, advanceApplied: amount(ledger.advance_applied), excessAdvance: amount(ledger.excess_advance), status: ledger.status === 'PAID' ? MonthlyLedgerStatus.PAID : MonthlyLedgerStatus.DUE, lastRebuiltAt: new Date() });
      insertedLedgerIds.push(createdLedger._id);
    }
    for (const originalRoute of mappedPayments) {
      const { payment: row, receiver } = originalRoute;
      const account = accounts.find((item) => String(item.holderId) === String(receiver!._id) && item.channel === row.gateway);
      if (!account) throw new Error(`Custody account disappeared before posting ${row.payment_ref}.`);
      const member = memberByCode.get(row.member_id)!;
      const paymentAllocations = manifest.allocations.filter((allocation) => allocation.payment_ref === row.payment_ref);
      const principal = paymentAllocations.filter((allocation) => allocation.allocation_type === 'PRINCIPAL').reduce((sum, allocation) => sum + amount(allocation.amount), 0);
      const advance = paymentAllocations.filter((allocation) => allocation.allocation_type === 'ADVANCE').reduce((sum, allocation) => sum + amount(allocation.amount), 0);
      const receiptNumber = `HIST-202401-${row.payment_ref.split('-').at(-1)}-${row.member_id}`;
      const payment = await Payment.create({ receiptNumber, memberId: member._id, receiverId: receiver!._id, custodyAccountId: account!._id, paymentDate: new Date(row.payment_date), totalAmount: amount(row.total_amount), principalAmount: principal, penaltyAmount: 0, cashoutCharge: 0, unpaidCashoutCharge: 0, advanceAmount: advance, paymentMethod: methodFor(row.gateway), status: PaymentStatus.COLLECTED, transactionReference: '', notes: `[HIST-2024-01] ${row.source_ref}; ${row.comment}`.trim() });
      insertedPaymentIds.push(payment._id);
      await PaymentAllocation.insertMany(paymentAllocations.map((allocation) => ({ paymentId: payment._id, memberId: member._id, targetMonth: allocation.target_month, allocationType: allocation.allocation_type === 'ADVANCE' ? AllocationType.ADVANCE : AllocationType.PRINCIPAL, amount: amount(allocation.amount) })));
      await CustodyMovement.create({ custodyAccountId: account!._id, movementType: MovementType.IN, amount: amount(row.total_amount), sourceType: MovementSourceType.MEMBER_PAYMENT, sourceRefId: payment._id, date: new Date(row.payment_date), description: `Historical January 2024 collection from ${member.memberId} - ${receiptNumber}`, performedBy: receiver!._id });
      await AuditLog.create({ performedBy: receiver!._id, action: 'IMPORT_HISTORICAL_MEMBER_PAYMENT', entityName: 'Payment', entityId: payment._id, afterState: { sourceRef: row.source_ref, paymentRef: row.payment_ref, period: '2024-01', totalAmount: amount(row.total_amount), principal, advance }, reason: 'Approved January 2024 historical source import.' });
    }
    for (const account of accounts) {
      const totals = await CustodyMovement.aggregate<{ _id: MovementType; total: number }>([{ $match: { custodyAccountId: account._id } }, { $group: { _id: '$movementType', total: { $sum: '$amount' } } }]);
      await CustodyAccount.updateOne({ _id: account._id }, { $set: { cachedBalance: totals.reduce((sum, item) => sum + (item._id === MovementType.IN ? item.total : -item.total), 0) } });
    }
    console.log(`Posted January 2024 staging manifest: ${insertedPaymentIds.length} payments.`);
  } catch (error) {
    if (insertedPaymentIds.length) {
      await CustodyMovement.deleteMany({ sourceRefId: { $in: insertedPaymentIds } });
      await PaymentAllocation.deleteMany({ paymentId: { $in: insertedPaymentIds } });
      await AuditLog.collection.deleteMany({ entityId: { $in: insertedPaymentIds } });
      await Payment.deleteMany({ _id: { $in: insertedPaymentIds } });
    }
    if (insertedLedgerIds.length) await MonthlyLedger.deleteMany({ _id: { $in: insertedLedgerIds } });
    throw error;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
