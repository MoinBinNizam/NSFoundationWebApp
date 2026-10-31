import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import {
  Member,
  MonthlyLedger,
  Payment,
  MemberExitSettlement,
  CustodyMovement,
  CustodyAccount,
} from '../models/index.js';
import { MemberStatus } from '../types/models.js';
import { ReportingService } from '../services/reporting.service.js';

/**
 * Inspection Script for Auditing Dropped Members & Exit Settlements
 *
 * Verifies:
 * 1. Dropped member status, membership profiles, and audit remarks.
 * 2. Exit settlements (eligible amount, deduction rate %, net refund, clearance).
 * 3. Linked custody movement records (source custody accounts, OUT debit validation).
 * 4. Monthly ledger conservation (ensuring dropped members carry ৳0 outstanding dues).
 * 5. Official 2024 annual audit reporting reconciliation.
 */
export async function inspectDroppedAudit(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ns-foundation';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB at ${mongoUri}`);
  }

  console.log('\n================================================================================');
  console.log('       INSPECTION & AUDIT REPORT: DROPPED MEMBERS & EXIT SETTLEMENTS           ');
  console.log('================================================================================\n');

  // 1. Fetch Dropped Members
  const droppedMembers = await Member.find({ status: MemberStatus.DROPPED }).sort({ memberId: 1 });
  console.log(`Found ${droppedMembers.length} member(s) with status: DROPPED.\n`);

  if (droppedMembers.length === 0) {
    console.log('No dropped members found in database.');
    return;
  }

  // 2. Fetch 2024 Audit baseline report
  const auditReport = await ReportingService.audit2024({ limit: 100 });
  const auditRowMap = new Map((auditReport.rows as any[]).map((r) => [r.memberId, r]));

  for (const member of droppedMembers) {
    console.log('--------------------------------------------------------------------------------');
    console.log(`MEMBER: [${member.memberId}] ${member.name}`);
    console.log(`Phone: ${member.phone} | Status: ${member.status} | Shares: ${(member as any).shareCount || (member as any).shares || (member as any).initialShares || 1}`);
    console.log(`Audit Remarks (2024): ${member.auditRemarks2024 || 'None'}`);
    console.log('--------------------------------------------------------------------------------');

    // Ledgers & Payments
    const ledgers = await MonthlyLedger.find({ memberId: member._id }).sort({ month: 1 });
    const payments = await Payment.find({ memberId: member._id, status: { $ne: 'CANCELLED' } }).sort({ paymentDate: 1 });
    const totalPaidInDb = payments.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalPenaltyPaid = payments.reduce((sum, p) => sum + (p.penaltyAmount || 0), 0);

    const paidLedgers = ledgers.filter((l) => l.status === 'PAID');
    const dueLedgers = ledgers.filter((l) => (Number(l.principalDue || 0) + Number(l.penaltyDue || 0) - Number(l.principalPaid || 0) - Number(l.penaltyPaid || 0)) > 0);
    const totalDueAmount = dueLedgers.reduce((sum, l) => sum + (Number(l.principalDue || 0) + Number(l.penaltyDue || 0) - Number(l.principalPaid || 0) - Number(l.penaltyPaid || 0)), 0);

    console.log(`  * Monthly Ledgers: ${ledgers.length} total (${paidLedgers.length} Paid, ${dueLedgers.length} with Dues)`);
    console.log(`  * Approved Payments: ${payments.length} transactions, Total ৳${totalPaidInDb} (Penalty ৳${totalPenaltyPaid})`);
    console.log(`  * Active Ledger Dues: ৳${totalDueAmount}`);

    // Audit Report Row Check
    const auditRow = auditRowMap.get(member.memberId);
    if (auditRow) {
      console.log(`  * 2024 Annual Audit Row:`);
      console.log(`      Dec Shares: ${auditRow.decemberShares} | Annual Fee: ৳${auditRow.annualFee} | Total Paid: ৳${auditRow.totalPaid}`);
      console.log(`      Due Amount: ৳${auditRow.dueAmount} | Advance Balance: ৳${auditRow.advanceBalance}`);
      console.log(`      Audit Due Verification: ${auditRow.dueAmount === 0 ? ' PASSED (৳0 Due)' : ' FAILED (Expected ৳0 Due)'}`);
    } else {
      console.log('  * 2024 Annual Audit Row: Not present in audit row set');
    }

    // Exit Settlement Check
    const settlement = await MemberExitSettlement.findOne({ memberId: member._id });
    if (!settlement) {
      console.log('  * Exit Settlement Record:  NOT FOUND');
    } else {
      console.log(`  * Exit Settlement Record:`);
      console.log(`      Status: ${settlement.status}`);
      console.log(`      Eligible Amount: ৳${settlement.eligibleAmount}`);
      console.log(`      Deduction Rate: ${settlement.deductionRate}% (৳${settlement.deductionAmount})`);
      console.log(`      Net Refund Amount: ৳${settlement.netAmount}`);
      console.log(`      Installment Amount: ৳${settlement.installmentAmount} (${settlement.installments.length} installment[s])`);
      console.log(`      Payment Method: ${settlement.paymentMethod || 'N/A'}`);
      console.log(`      Transaction Ref: ${settlement.transactionRef || 'N/A'}`);
      console.log(`      Receipt Voucher Number: ${settlement.receiptNumber || 'N/A'}`);
      console.log(`      Attached Document: ${settlement.documentName || 'N/A'}`);
      console.log(`      Authorized By: ${settlement.authorizerName || 'N/A'}`);
      console.log(`      Settlement Notes: ${settlement.notes || 'None'}`);

      // Installment & Custody Movements
      for (let i = 0; i < settlement.installments.length; i++) {
        const inst = settlement.installments[i];
        console.log(`      [Installment ${i + 1}] Amount: ৳${inst.amount} | Due: ${inst.dueDate.toISOString().slice(0, 10)} | Paid: ৳${inst.paidAmount} on ${inst.paidAt ? inst.paidAt.toISOString().slice(0, 10) : 'Pending'}`);
        if (inst.custodyMovementId) {
          const movement = await CustodyMovement.findById(inst.custodyMovementId);
          if (movement) {
            const acc = await CustodyAccount.findById(movement.custodyAccountId);
            const accName = acc ? `${acc.accountType} (${acc.accountNumber})` : 'Unknown Account';
            console.log(`          -> Linked Custody Movement: ${movement._id}`);
            console.log(`             Account: ${accName}`);
            console.log(`             Type: ${movement.movementType} | Amount: ৳${movement.amount} | Date: ${movement.date.toISOString().slice(0, 10)}`);
            console.log(`             Description: ${movement.description}`);
            console.log(`             Source Type: ${movement.sourceType}`);
          } else {
            console.log(`          -> Linked Custody Movement ID (${inst.custodyMovementId}) NOT FOUND in database!`);
          }
        }
      }
    }
    console.log('\n');
  }

  console.log('================================================================================');
  console.log('                         AUDIT INSPECTION COMPLETE                              ');
  console.log('================================================================================\n');
}

inspectDroppedAudit()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Inspection failed with error:', err);
    await mongoose.disconnect();
    process.exit(1);
  });
