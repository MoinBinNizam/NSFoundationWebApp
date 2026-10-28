import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import * as path from 'path';
import {
  Member,
  Payment,
  MonthlyLedger,
  MemberYearAccount,
  Expense,
  InvestmentProject,
  MemberExitSettlement,
  CustodyAccount,
  CustodyMovement,
  User,
} from '../models/index.js';
import {
  MemberStatus,
  MemberExitStatus,
  PaymentMethod,
  PaymentStatus,
  ProjectStatus,
  MovementType,
  MovementSourceType,
} from '../types/models.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ns-foundation';
const EXCEL_PATH = path.resolve(__dirname, '../../../docs/updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');

function excelSerialToDate(serial: any, fallbackDate: string): Date {
  if (!serial) return new Date(fallbackDate);
  if (typeof serial === 'number' || (!isNaN(Number(serial)) && Number(serial) > 30000)) {
    return new Date(Math.round((Number(serial) - 25569) * 86400 * 1000));
  }
  const parsed = new Date(String(serial));
  return isNaN(parsed.getTime()) ? new Date(fallbackDate) : parsed;
}

export async function stage2024FromUpdatedWorkbook() {
  console.log('Connecting to MongoDB:', MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully.');

  console.log('Reading Workbook:', EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);

  // 1. Get Accountants for custody references
  let moinUser = await User.findOne({ email: /moin/i });
  if (!moinUser) moinUser = await User.findOne({ role: { $in: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'] } });
  let samratUser = (await User.findOne({ email: /samrat/i })) || moinUser;

  let moinCustody = (await CustodyAccount.findOne({ name: /moin/i })) || (await CustodyAccount.findOne());
  let samratCustody = (await CustodyAccount.findOne({ name: /samrat/i })) || moinCustody;

  if (!moinUser) {
    throw new Error('Default admin/accountant user (Moin) not found in system.');
  }
  if (!moinCustody) {
    throw new Error('Custody account not found.');
  }

  // 2. Process Members from "Sorted Members"
  console.log('\n--- 1. Processing Sorted Members (35) ---');
  const membersSheet = wb.Sheets['Sorted Members'];
  const memberRows = XLSX.utils.sheet_to_json(membersSheet, { header: 1 }) as any[][];
  const memberData = memberRows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));

  const memberIdMap = new Map<string, any>();

  for (const r of memberData) {
    const code = String(r[0]).trim();
    const name = String(r[1]).trim();
    let phone = String(r[2] || '').trim();
    if (phone && !phone.startsWith('+')) {
      phone = '+' + phone;
    }
    const joinDate = excelSerialToDate(r[3], '2024-01-01');
    const shares = Number(r[4] || 1);

    let member = await Member.findOne({ memberId: code });
    if (!member) {
      member = new Member({
        memberId: code,
        name,
        phone: phone || '+8801700000000',
        joinDate,
        initialShares: shares,
        currentShares: shares,
        status: code === 'NSF007' || code === 'NSF032' ? MemberStatus.DROPPED : MemberStatus.ACTIVE,
      });
    } else {
      member.name = name;
      if (phone) member.phone = phone;
      (member as any).currentShares = shares;
      if (code === 'NSF007' || code === 'NSF032') {
        member.status = MemberStatus.DROPPED;
      }
    }
    await member.save();
    memberIdMap.set(code, member);
  }
  console.log(`Loaded ${memberIdMap.size} members.`);

  // 3. Process "Audit 2024 cross check"
  console.log('\n--- 2. Processing Audit 2024 Cross Check ---');
  const auditCrossSheet = wb.Sheets['Audit 2024 cross check'];
  if (auditCrossSheet) {
    const crossRows = XLSX.utils.sheet_to_json(auditCrossSheet, { header: 1 }) as any[][];
    const dataRows = crossRows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));

    for (const r of dataRows) {
      const code = String(r[0]).trim();
      const member = memberIdMap.get(code);
      if (!member) continue;

      const decShare = Number(r[2] || 1);
      const annualFee = Number(r[3] || 6000);
      const totalPaid = Number(r[4] || 0);
      const paidPrincipal = Number(r[5] || 0);
      const penPaid = Number(r[6] || 0);
      const coPaid = Number(r[7] || 0);
      const dueAmount = Number(r[8] || 0);
      const dueCO = Number(r[9] || 0);
      const duePen = Number(r[10] || 0);
      const advanceBalance = Number(r[12] || 0);
      const remarks = String(r[13] || '').trim();

      // Update Member
      member.auditRemarks2024 = remarks;
      member.cashoutDue = dueCO;
      await member.save();

      // Update MemberYearAccount
      const principalDue = Math.max(0, dueAmount - duePen - dueCO);
      await MemberYearAccount.findOneAndUpdate(
        { memberId: member._id, year: 2024 },
        {
          $set: {
            annualObligation: annualFee,
            totalPrincipalPaid: paidPrincipal,
            totalPaid,
            totalPenaltyPaid: penPaid,
            totalCashoutPaid: coPaid,
            cashoutDue: dueCO,
            shortfall: principalDue,
            excessAdvance: advanceBalance,
            finalShares: decShare,
            notes: remarks,
            isSettled: dueAmount === 0,
            settledAt: new Date('2024-12-31T23:59:59.000Z'),
          },
        },
        { upsert: true }
      );
    }
    console.log(`Updated 2024 Year Accounts & Audit Remarks for ${dataRows.length} members.`);
  }

  // 4. Process 12 Monthly Payment Sheets
  console.log('\n--- 3. Processing 12 Monthly Payment Sheets ---');
  const monthConfigs = [
    { name: 'January, 2024', key: '2024-01', defaultDate: '2024-01-15' },
    { name: 'February, 2024', key: '2024-02', defaultDate: '2024-02-15' },
    { name: 'March, 2024', key: '2024-03', defaultDate: '2024-03-15' },
    { name: 'April, 2024', key: '2024-04', defaultDate: '2024-04-15' },
    { name: 'May, 2024', key: '2024-05', defaultDate: '2024-05-15' },
    { name: 'June, 2024', key: '2024-06', defaultDate: '2024-06-15' },
    { name: 'July, 2024', key: '2024-07', defaultDate: '2024-07-15' },
    { name: 'August, 2024', key: '2024-08', defaultDate: '2024-08-15' },
    { name: 'Sept, 2024', key: '2024-09', defaultDate: '2024-09-15' },
    { name: 'Oct, 2024', key: '2024-10', defaultDate: '2024-10-15' },
    { name: 'Nov, 2024', key: '2024-11', defaultDate: '2024-11-15' },
    { name: 'Dec, 2024', key: '2024-12', defaultDate: '2024-12-15' },
  ];

  let totalPaymentsRecorded = 0;
  let totalLedgersRecorded = 0;

  for (const cfg of monthConfigs) {
    const sheet = wb.Sheets[cfg.name];
    if (!sheet) {
      console.warn(`Sheet "${cfg.name}" not found in workbook!`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    let headerIdx = rows.findIndex((r) => r && r.some((c: any) => String(c).includes('Member ID')));
    if (headerIdx === -1) headerIdx = 1;
    const dataRows = rows.slice(headerIdx + 1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));

    for (const r of dataRows) {
      const code = String(r[0]).trim();
      const member = memberIdMap.get(code);
      if (!member) continue;

      const shareCount = Number(r[2] || 1);
      const totalAmount = Number(r[3] || 0);
      const gatewayStr = String(r[4] || 'BKASH').toUpperCase();
      const receiverStr = String(r[5] || 'Moin');
      const dateSerial = r[6];
      const pDate = excelSerialToDate(dateSerial, cfg.defaultDate);
      const penaltyCol = Number(r[8] || 0);
      const comment = String(r[9] || r[10] || '').trim();

      const receiverUser = (/samrat/i.test(receiverStr) ? samratUser : moinUser)!;
      const custodyAcc = (/samrat/i.test(receiverStr) ? samratCustody : moinCustody)!;

      let method = PaymentMethod.BKASH;
      if (gatewayStr.includes('BANK')) method = PaymentMethod.BANK_TRANSFER;
      else if (gatewayStr.includes('NAGAD')) method = PaymentMethod.NAGAD;
      else if (gatewayStr.includes('CASH')) method = PaymentMethod.CASH;

      // Extract penalty & principal paid
      let penaltyPaid = 0;
      let cashoutCharge = 0;
      let principalPaid = 0;

      if (totalAmount > 0) {
        if (/penalty\s*(\d+)/i.test(comment)) {
          const match = comment.match(/penalty\s*(\d+)/i);
          if (match) penaltyPaid = Number(match[1]);
        } else if (penaltyCol > 0 && totalAmount > shareCount * 500) {
          penaltyPaid = penaltyCol;
        }

        principalPaid = Math.max(0, totalAmount - penaltyPaid - cashoutCharge);

        // Record Payment
        const receiptNumber = `HIST-${cfg.key}-${code}`;
        await Payment.findOneAndUpdate(
          { receiptNumber },
          {
            $set: {
              memberId: member._id,
              receiverId: receiverUser._id,
              custodyAccountId: custodyAcc._id,
              paymentDate: pDate,
              totalAmount,
              principalAmount: principalPaid,
              penaltyAmount: penaltyPaid,
              cashoutCharge,
              paymentMethod: method,
              status: PaymentStatus.COLLECTED,
              notes: comment ? `[${cfg.name}] ${comment}` : `[${cfg.name}] Payment`,
            },
          },
          { upsert: true }
        );
        totalPaymentsRecorded++;
      }

      // Record MonthlyLedger
      const expectedPrincipal = shareCount * 500;
      const isPaid = totalAmount >= expectedPrincipal;

      let ledgerStatus = isPaid ? 'PAID' : totalAmount > 0 ? 'PARTIAL' : 'DUE';
      if (member.status === MemberStatus.DROPPED && totalAmount === 0 && code === 'NSF007' && cfg.key > '2024-03') {
        ledgerStatus = 'WAIVED';
      }

      await MonthlyLedger.findOneAndUpdate(
        { memberId: member._id, month: cfg.key },
        {
          $set: {
            shareCount,
            principalDue: expectedPrincipal,
            principalPaid,
            penaltyDue: isPaid ? 0 : penaltyCol,
            penaltyPaid,
            cashoutDue: code === 'NSF020' && cfg.key === '2024-05' ? 20 : code === 'NSF023' && cfg.key === '2024-05' ? 10 : 0,
            status: ledgerStatus,
            paymentMethod: totalAmount > 0 ? method : undefined,
            notes: comment,
          },
        },
        { upsert: true }
      );
      totalLedgersRecorded++;
    }
  }
  console.log(`Recorded/Updated ${totalPaymentsRecorded} Payments and ${totalLedgersRecorded} MonthlyLedgers.`);

  // 5. Process Expenses
  console.log('\n--- 4. Processing Expenses ---');
  const expensesSheet = wb.Sheets['Expenses'];
  if (expensesSheet) {
    const expRows = XLSX.utils.sheet_to_json(expensesSheet, { header: 1 }) as any[][];
    const expData = expRows.slice(2).filter((r) => r && r[0] !== undefined && r[1]);
    let expCount = 0;
    for (let i = 0; i < expData.length; i++) {
      const r = expData[i];
      const eDate = excelSerialToDate(r[0], '2024-01-01');
      const reason = String(r[1]).trim();
      const amount = Number(r[2] || 0);
      const paidByStr = String(r[3] || 'Moin');
      const expUser = (/samrat/i.test(paidByStr) ? samratUser : moinUser)!;
      const expCustody = (/samrat/i.test(paidByStr) ? samratCustody : moinCustody)!;

      const expenseNumber = `EXP-2024-${String(i + 1).padStart(3, '0')}`;
      await Expense.findOneAndUpdate(
        { expenseNumber },
        {
          $set: {
            custodyAccountId: expCustody._id,
            amount,
            category: /meeting|খাবার|নাস্তা/i.test(reason) ? 'MEETING' : /ai|subscription/i.test(reason) ? 'SOFTWARE' : 'COMMUNICATION',
            date: eDate,
            description: reason,
            createdBy: expUser._id,
          },
        },
        { upsert: true }
      );
      expCount++;
    }
    console.log(`Recorded/Updated ${expCount} Expenses.`);
  }

  // 6. Process Investments
  console.log('\n--- 5. Processing Investments ---');
  const invSheet = wb.Sheets['Investment'];
  if (invSheet) {
    const invRows = XLSX.utils.sheet_to_json(invSheet, { header: 1 }) as any[][];
    const invData = invRows.slice(2).filter((r) => r && r[0] !== undefined && r[7]);
    let invCount = 0;
    for (const r of invData) {
      const sl = r[0];
      const invNo = String(r[2] || `PRJ-2024-${sl}`).replace('#', '').trim();
      const amount = Number(r[4] || 0);
      const pName = String(r[7]).trim();
      const duration = String(r[8] || '6 months').trim();
      const roiAnnual = Number(r[9] || 0.38) * 100;
      const statusStr = String(r[11] || 'Running').trim().toLowerCase();
      const pStatus = statusStr.includes('matured') ? ProjectStatus.MATURED : ProjectStatus.ACTIVE;
      const startDate = excelSerialToDate(r[5], '2024-04-01');
      const maturityDate = excelSerialToDate(r[6], '2024-10-01');

      const projectId = `PRJ-${String(sl).padStart(3, '0')}`;
      await InvestmentProject.findOneAndUpdate(
        { projectId },
        {
          $set: {
            name: pName,
            category: /cow|cattle|goat/i.test(pName) ? 'LIVESTOCK' : /banana|sugar|onion|papaya/i.test(pName) ? 'AGRO' : /fish/i.test(pName) ? 'FISHERIES' : 'TRADE',
            startDate,
            maturityDate,
            plannedDuration: duration,
            targetPrincipal: amount,
            totalFunded: amount,
            expectedAnnualRoiPercent: roiAnnual,
            status: pStatus,
            description: `Authoritative Investment record #${sl} (${invNo})`,
          },
        },
        { upsert: true }
      );
      invCount++;
    }
    console.log(`Recorded/Updated ${invCount} Investment Projects.`);
  }

  // 7. Process Departed Member Refunds (2026 Exit Settlements)
  console.log('\n--- 6. Processing Departed Member Refunds ---');
  const moinBkashCustody =
    (await CustodyAccount.findOne({
      channel: 'BKASH',
      $or: [{ holderId: moinUser._id }, { name: /merchant|agent|bkash/i }],
    })) || moinCustody;

  // NSF032 (Ahsan Ul Tanvir): ৳1,802 on 11/01/2026 via bKash
  const m32 = memberIdMap.get('NSF032');
  if (m32) {
    const mov32 = await CustodyMovement.findOneAndUpdate(
      {
        custodyAccountId: moinBkashCustody._id,
        date: new Date('2026-01-11'),
        amount: 1802,
        movementType: MovementType.OUT,
      },
      {
        $set: {
          sourceType: MovementSourceType.ADJUSTMENT,
          description: 'Member Exit Refund for Ahsan Ul Tanvir (NSF032) via bKash by Accountant Moin Uddin',
          performedBy: moinUser._id,
        },
      },
      { upsert: true, new: true }
    );

    await MemberExitSettlement.findOneAndUpdate(
      { memberId: m32._id },
      {
        $set: {
          eligibleAmount: 2000,
          deductionRate: 9.9,
          deductionAmount: 198,
          netAmount: 1802,
          installmentAmount: 1802,
          installments: [
            {
              dueDate: new Date('2026-01-11'),
              amount: 1802,
              paidAmount: 1802,
              paidAt: new Date('2026-01-11'),
              custodyMovementId: mov32._id,
            },
          ],
          status: MemberExitStatus.SETTLED,
          requestedBy: moinUser._id,
          approvedBy: moinUser._id,
          paymentMethod: 'BKASH',
          authorizerName: 'Moin Uddin',
          notes: 'Refunded ৳1,802 via bKash on 11/01/2026 by Accountant Moin Uddin (deducted from bKash custody account).',
        },
      },
      { upsert: true }
    );
    console.log('Recorded MemberExitSettlement & CustodyMovement (OUT) for NSF032 (Ahsan Ul Tanvir): ৳1,802 from Moin bKash Custody on 11/01/2026.');
  }

  // NSF007 (Bayzid Hasan): ৳1,000 on 15/01/2026 via bKash
  const m7 = memberIdMap.get('NSF007');
  if (m7) {
    const mov7 = await CustodyMovement.findOneAndUpdate(
      {
        custodyAccountId: moinBkashCustody._id,
        date: new Date('2026-01-15'),
        amount: 1000,
        movementType: MovementType.OUT,
      },
      {
        $set: {
          sourceType: MovementSourceType.ADJUSTMENT,
          description: 'Member Exit Refund for Bayzid Hasan (NSF007) via bKash by Accountant Moin Uddin',
          performedBy: moinUser._id,
        },
      },
      { upsert: true, new: true }
    );

    await MemberExitSettlement.findOneAndUpdate(
      { memberId: m7._id },
      {
        $set: {
          eligibleAmount: 1500,
          deductionRate: 33.33,
          deductionAmount: 500,
          netAmount: 1000,
          installmentAmount: 1000,
          installments: [
            {
              dueDate: new Date('2026-01-15'),
              amount: 1000,
              paidAmount: 1000,
              paidAt: new Date('2026-01-15'),
              custodyMovementId: mov7._id,
            },
          ],
          status: MemberExitStatus.SETTLED,
          requestedBy: moinUser._id,
          approvedBy: moinUser._id,
          paymentMethod: 'BKASH',
          authorizerName: 'Moin Uddin',
          notes: 'Refunded ৳1,000 via bKash on 15/01/2026 by Accountant Moin Uddin (deducted from bKash custody account).',
        },
      },
      { upsert: true }
    );
    console.log('Recorded MemberExitSettlement & CustodyMovement (OUT) for NSF007 (Bayzid Hasan): ৳1,000 from Moin bKash Custody on 15/01/2026.');
  }

  console.log('\n=== COMPLETE 2024 STAGING FINISHED SUCCESSFULLY ===');
}

if (process.argv[1]?.includes('stage-2024-from-updated-workbook')) {
  stage2024FromUpdatedWorkbook()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
