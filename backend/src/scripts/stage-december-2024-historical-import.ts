/** Posts the reviewed December 2024 manifest. Dry-run unless STAGE_DECEMBER_2024=YES. */
import dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuditLog, CustodyAccount, CustodyMovement, Member, MonthlyLedger, Payment, PaymentAllocation, User } from '../models/index.js';
import { AllocationType, MonthlyLedgerStatus, MovementSourceType, MovementType, PaymentMethod, PaymentStatus } from '../types/models.js';
import { connectDatabase } from '../config/db.js';
import { PaymentService } from '../services/payment.service.js';

dotenv.config();

type Ledger = {
  source_ref: string;
  member_id: string;
  month: string;
  share_count: number;
  principal_due: number;
  principal_paid: number;
  penalty_due: number;
  penalty_paid: number;
  advance_applied: number;
  excess_advance: number;
  status: 'PAID' | 'PARTIAL' | 'DUE';
  comment: string;
};

type PaymentRow = {
  payment_ref: string;
  source_ref: string;
  member_id: string;
  payment_date: string;
  total_amount: number;
  gateway: 'BANK' | 'BKASH' | 'NAGAD' | 'CASH';
  receiver_source: string;
  comment: string;
};

type Allocation = {
  payment_ref: string;
  member_id: string;
  target_month: string;
  allocation_type: 'PRINCIPAL' | 'PENALTY' | 'ADVANCE';
  amount: number;
  source_ref: string;
};

type Manifest = {
  ledgers: Ledger[];
  payments: PaymentRow[];
  allocations: Allocation[];
};

const manifestPath = join(process.cwd(), '..', 'docs', 'import-historical-evidence', 'normalized-manifests', 'december-2024-staging', 'staging-manifest.json');

const methodFor = (gateway: PaymentRow['gateway']) => ({
  BANK: PaymentMethod.BANK_TRANSFER,
  BKASH: PaymentMethod.BKASH,
  NAGAD: PaymentMethod.NAGAD,
  CASH: PaymentMethod.CASH,
}[gateway]);

const outstanding = (ledger: { principalDue: number; principalPaid: number; penaltyDue: number; penaltyPaid: number; penaltyWaived?: number }) =>
  Math.max(0, ledger.principalDue - ledger.principalPaid) + Math.max(0, ledger.penaltyDue - ledger.penaltyPaid - Number(ledger.penaltyWaived || 0));

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
    return { row, receiver, account };
  });

  const errors = [
    ...memberCodes.filter((memberId) => !membersByCode.has(memberId)).map((memberId) => `Missing member ${memberId}`),
    ...routes.filter((route) => !route.receiver).map((route) => `No active receiver for ${route.row.payment_ref}`),
    ...routes.filter((route) => !route.account).map((route) => `No matching custody account for ${route.row.payment_ref}`),
  ];

  const existingPayments = await Payment.countDocuments({ notes: { $regex: '\\[HIST-2024-12\\]' } });

  if (process.env.VERIFY_DECEMBER_2024 === 'YES') {
    const imported = await Payment.find({ notes: { $regex: '\\[HIST-2024-12\\]' } }).lean();
    const ids = imported.map((payment) => payment._id);
    const [allocationCount, auditCount, decemberLedgers] = await Promise.all([
      PaymentAllocation.countDocuments({ paymentId: { $in: ids } }),
      AuditLog.collection.countDocuments({ entityId: { $in: ids }, action: 'IMPORT_HISTORICAL_MEMBER_PAYMENT' }),
      MonthlyLedger.find({ month: '2024-12' }).select('principalDue principalPaid penaltyDue penaltyPaid penaltyWaived').lean(),
    ]);

    const expectedTotal = manifest.payments.reduce((sum, row) => sum + row.total_amount, 0);
    const actualTotal = imported.reduce((sum, payment) => sum + payment.totalAmount, 0);

    const summary = {
      expected: {
        receipts: manifest.payments.length,
        allocations: manifest.allocations.length,
        received: expectedTotal,
        auditLogs: manifest.payments.length,
      },
      actual: {
        receipts: imported.length,
        allocations: allocationCount,
        received: actualTotal,
        auditLogs: auditCount,
        decemberPrincipalDue: decemberLedgers.reduce((sum, ledger) => sum + Math.max(0, ledger.principalDue - ledger.principalPaid), 0),
        decemberPenaltyDue: decemberLedgers.reduce((sum, ledger) => sum + Math.max(0, ledger.penaltyDue - ledger.penaltyPaid - Number(ledger.penaltyWaived || 0)), 0),
      },
    };

    console.log(JSON.stringify(summary, null, 2));
    if (
      imported.length !== manifest.payments.length ||
      allocationCount !== manifest.allocations.length ||
      actualTotal !== expectedTotal ||
      auditCount !== manifest.payments.length
    ) {
      throw new Error('December staging reconciliation failed.');
    }
    return;
  }

  console.log(
    JSON.stringify(
      {
        manifest: {
          ledgers: manifest.ledgers.length,
          payments: manifest.payments.length,
          allocations: manifest.allocations.length,
          received: manifest.payments.reduce((sum, row) => sum + row.total_amount, 0),
        },
        database: {
          membersFound: members.length,
          existingDecemberImportPayments: existingPayments,
        },
        routes: routes.map((r) => ({
          paymentRef: r.row.payment_ref,
          member: r.row.member_id,
          receiver: r.receiver?.name,
          account: r.account?.name,
          gateway: r.row.gateway,
          amount: r.row.total_amount,
        })),
        errors,
      },
      null,
      2
    )
  );

  if (errors.length || existingPayments) throw new Error('December staging validation failed.');
  if (process.env.STAGE_DECEMBER_2024 !== 'YES') return;

  const paymentIds: Types.ObjectId[] = [];
  const createdLedgerIds: Types.ObjectId[] = [];
  const touchedLedgerIds = new Set<string>();

  try {
    // 1. Prepare December MonthlyLedgers (and honor penalty rules / waivers)
    for (const row of manifest.ledgers) {
      const member = membersByCode.get(row.member_id)!;
      const isWaived = await PaymentService.isMonthWaived(row.month, member._id);
      const rule = await PaymentService.getPenaltyRule(row.month);
      const rawPenalty = Number(row.penalty_due || 0);
      const penaltyDue = isWaived ? 0 : (rawPenalty || (row.status === 'DUE' && row.principal_due > row.principal_paid ? row.share_count * rule.ratePerShare : 0));
      const penaltyWaived = isWaived && rawPenalty ? rawPenalty : 0;

      let ledger = await MonthlyLedger.findOne({ memberId: member._id, month: row.month });
      if (ledger) {
        ledger.shareCount = row.share_count;
        ledger.principalDue = row.principal_due;
        ledger.penaltyDue = penaltyDue;
        ledger.penaltyWaived = penaltyWaived;
        ledger.advanceApplied = row.advance_applied || 0;
        ledger.excessAdvance = row.excess_advance || 0;
        if (row.advance_applied && row.advance_applied >= row.principal_due) {
          ledger.principalPaid = row.advance_applied;
          ledger.status = MonthlyLedgerStatus.PAID;
        }
        ledger.lastRebuiltAt = new Date();
        await ledger.save();
      } else {
        ledger = await MonthlyLedger.create({
          memberId: member._id,
          month: row.month,
          shareCount: row.share_count,
          principalDue: row.principal_due,
          principalPaid: row.advance_applied || 0,
          penaltyDue,
          penaltyPaid: 0,
          penaltyWaived,
          advanceApplied: row.advance_applied || 0,
          excessAdvance: row.excess_advance || 0,
          status: row.status === 'PAID' ? MonthlyLedgerStatus.PAID : MonthlyLedgerStatus.DUE,
          lastRebuiltAt: new Date(),
        });
        createdLedgerIds.push(ledger._id);
      }
      touchedLedgerIds.add(String(ledger._id));
    }

    // 2. Process cash payments and allocations
    for (const route of routes) {
      const { row, receiver, account } = route;
      if (!account) throw new Error(`Custody account missing for ${row.payment_ref}.`);
      const member = membersByCode.get(row.member_id)!;
      const allocations = manifest.allocations.filter((allocation) => allocation.payment_ref === row.payment_ref);
      const principalAllocations = allocations.filter((a) => a.allocation_type === 'PRINCIPAL');
      const penaltyAllocations = allocations.filter((a) => a.allocation_type === 'PENALTY');
      const advanceAllocations = allocations.filter((a) => a.allocation_type === 'ADVANCE');

      const principalAmount = principalAllocations.reduce((sum, a) => sum + a.amount, 0);
      const penaltyAmount = penaltyAllocations.reduce((sum, a) => sum + a.amount, 0);
      const advanceAmount = advanceAllocations.reduce((sum, a) => sum + a.amount, 0);

      const payment = await Payment.create({
        receiptNumber: `HIST-202412-${row.payment_ref.split('-').at(-1)}-${row.member_id}`,
        memberId: member._id,
        receiverId: receiver!._id,
        custodyAccountId: account._id,
        paymentDate: new Date(row.payment_date),
        totalAmount: row.total_amount,
        principalAmount,
        penaltyAmount,
        cashoutCharge: 0,
        unpaidCashoutCharge: 0,
        advanceAmount,
        paymentMethod: methodFor(row.gateway),
        status: PaymentStatus.COLLECTED,
        transactionReference: '',
        notes: `[HIST-2024-12] ${row.source_ref}; ${row.comment}`.trim(),
      });
      paymentIds.push(payment._id);

      await PaymentAllocation.insertMany(
        allocations.map((allocation) => ({
          paymentId: payment._id,
          memberId: member._id,
          targetMonth: allocation.target_month,
          allocationType:
            allocation.allocation_type === 'PENALTY'
              ? AllocationType.PENALTY
              : allocation.allocation_type === 'ADVANCE'
              ? AllocationType.ADVANCE
              : AllocationType.PRINCIPAL,
          amount: allocation.amount,
        }))
      );

      for (const allocation of allocations) {
        let target = await MonthlyLedger.findOne({ memberId: member._id, month: allocation.target_month });
        if (!target) {
          const shares = manifest.ledgers.find((l) => l.member_id === member.memberId)?.share_count || 1;
          target = await MonthlyLedger.create({
            memberId: member._id,
            month: allocation.target_month,
            shareCount: shares,
            principalDue: shares * 500,
            principalPaid: allocation.allocation_type === 'ADVANCE' ? allocation.amount : 0,
            penaltyDue: 0,
            penaltyPaid: 0,
            penaltyWaived: 0,
            advanceApplied: allocation.allocation_type === 'ADVANCE' ? allocation.amount : 0,
            excessAdvance: 0,
            status:
              allocation.allocation_type === 'ADVANCE' && allocation.amount >= shares * 500
                ? MonthlyLedgerStatus.PAID
                : MonthlyLedgerStatus.DUE,
            lastRebuiltAt: new Date(),
          });
          createdLedgerIds.push(target._id);
        } else {
          if (allocation.allocation_type === 'PRINCIPAL') {
            target.principalPaid += allocation.amount;
            // NSF009: took 2nd share in Dec and paid retroactively for Jan-Nov
            if (member.memberId === 'NSF009' && allocation.target_month < '2024-12') {
              target.shareCount = 2;
              target.principalDue = 1000;
            }
          } else if (allocation.allocation_type === 'PENALTY') {
            target.penaltyPaid += allocation.amount;
            if (target.penaltyDue < target.penaltyPaid) {
              target.penaltyDue = target.penaltyPaid;
            }
          } else if (allocation.allocation_type === 'ADVANCE') {
            target.advanceApplied += allocation.amount;
            target.principalPaid += allocation.amount;
          }

          // Member-specific historical reconciliations:
          // NSF015: Settled July-Dec dues with ৳100 total penalty fee
          if (member.memberId === 'NSF015' && allocation.target_month >= '2024-07' && allocation.target_month < '2024-12') {
            if (target.penaltyDue > target.penaltyPaid) {
              target.penaltyWaived = target.penaltyDue - target.penaltyPaid;
              target.penaltyDue = target.penaltyPaid;
            }
          }

          // NSF023: Adjusted to 1 share and settled June-Dec principal + 120 penalty
          if (member.memberId === 'NSF023' && allocation.target_month >= '2024-06' && allocation.target_month <= '2024-12') {
            target.shareCount = 1;
            target.principalDue = 500;
            if (target.penaltyDue > target.penaltyPaid) {
              target.penaltyWaived = target.penaltyDue - target.penaltyPaid;
              target.penaltyDue = target.penaltyPaid;
            }
          }

          // NSF034: Adjusted to 4 shares and settled remaining dues; all remaining penalties waived per authoritative sheet
          if (member.memberId === 'NSF034' && allocation.target_month < '2024-12') {
            if (target.penaltyDue > target.penaltyPaid) {
              target.penaltyWaived = target.penaltyDue - target.penaltyPaid;
              target.penaltyDue = target.penaltyPaid;
            }
          }

          target.lastRebuiltAt = new Date();
          await target.save();
        }
        touchedLedgerIds.add(String(target._id));
      }

      await CustodyMovement.create({
        custodyAccountId: account._id,
        movementType: MovementType.IN,
        amount: row.total_amount,
        sourceType: MovementSourceType.MEMBER_PAYMENT,
        sourceRefId: payment._id,
        date: new Date(row.payment_date),
        description: `Historical December 2024 collection from ${member.memberId}`,
        performedBy: receiver!._id,
      });

      await AuditLog.create({
        performedBy: receiver!._id,
        action: 'IMPORT_HISTORICAL_MEMBER_PAYMENT',
        entityName: 'Payment',
        entityId: payment._id,
        afterState: {
          sourceRef: row.source_ref,
          paymentRef: row.payment_ref,
          period: '2024-12',
          totalAmount: row.total_amount,
          principal: principalAmount,
          penalty: penaltyAmount,
          advance: advanceAmount,
        },
        reason: 'Approved December 2024 historical source import.',
      });
    }

    // 3. Update status of touched ledgers
    for (const id of touchedLedgerIds) {
      const ledger = await MonthlyLedger.findById(id);
      if (!ledger) continue;
      ledger.status =
        outstanding(ledger) === 0
          ? MonthlyLedgerStatus.PAID
          : ledger.principalPaid > 0 || ledger.penaltyPaid > 0
          ? MonthlyLedgerStatus.PARTIAL
          : MonthlyLedgerStatus.DUE;
      await ledger.save();
    }

    // 4. Update custody account cached balances
    for (const account of accounts) {
      const totals = await CustodyMovement.aggregate<{ _id: MovementType; total: number }>([
        { $match: { custodyAccountId: account._id } },
        { $group: { _id: '$movementType', total: { $sum: '$amount' } } },
      ]);
      await CustodyAccount.updateOne(
        { _id: account._id },
        {
          $set: {
            cachedBalance: totals.reduce((sum, item) => sum + (item._id === MovementType.IN ? item.total : -item.total), 0),
          },
        }
      );
    }

    const receipts = await Payment.find({ notes: { $regex: '\\[HIST-2024-12\\]' } }).lean();
    const amount = receipts.reduce((sum, payment) => sum + payment.totalAmount, 0);
    if (receipts.length !== manifest.payments.length || amount !== manifest.payments.reduce((sum, row) => sum + row.total_amount, 0)) {
      throw new Error('December reconciliation failed.');
    }
    console.log(`Posted and reconciled December 2024: ${receipts.length} receipts totaling ৳${amount}.`);
  } catch (error) {
    if (paymentIds.length) {
      await CustodyMovement.deleteMany({ sourceRefId: { $in: paymentIds } });
      await PaymentAllocation.deleteMany({ paymentId: { $in: paymentIds } });
      await AuditLog.collection.deleteMany({ entityId: { $in: paymentIds } });
      await Payment.deleteMany({ _id: { $in: paymentIds } });
    }
    if (createdLedgerIds.length) await MonthlyLedger.deleteMany({ _id: { $in: createdLedgerIds } });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
