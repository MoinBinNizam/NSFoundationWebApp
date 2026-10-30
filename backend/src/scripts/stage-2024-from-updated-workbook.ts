import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import {
  Member,
  Payment,
  MonthlyLedger,
  MemberYearAccount,
  Expense,
  InvestmentProject,
  InvestmentReturn,
  MemberExitSettlement,
  CustodyAccount,
  CustodyMovement,
  User,
  ShareHistory,
} from '../models/index.js';
import {
  MemberStatus,
  MemberExitStatus,
  PaymentMethod,
  PaymentStatus,
  ProjectStatus,
  MovementType,
  MovementSourceType,
  ReturnDestinationType,
  AccountType,
  CustodyChannel,
  ShareEventType,
} from '../types/models.js';
import { PaymentService } from '../services/payment.service.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ns-foundation';

function getWorkbookPath(): string {
  const p1 = path.resolve(process.cwd(), 'docs/updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
  if (fs.existsSync(p1)) return p1;
  const p2 = path.resolve(process.cwd(), '../docs/updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
  if (fs.existsSync(p2)) return p2;
  return path.resolve('C:/TechVelly/NSFoundationWebApp/docs/updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
}

const EXCEL_PATH = getWorkbookPath();

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
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGODB_URI);
  }
  console.log('Connected successfully.');

  console.log('Reading Workbook:', EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);

  // ─── 0. WIPE PREVIOUS DATA TO PREVENT ANY DUPLICATION ───────────────────────
  console.log('\n--- 0. Wiping previous data across modules ---');
  await Payment.deleteMany({});
  await MonthlyLedger.deleteMany({});
  await Expense.deleteMany({});
  await InvestmentProject.deleteMany({});
  await InvestmentReturn.deleteMany({});
  await CustodyMovement.deleteMany({});
  await MemberExitSettlement.deleteMany({});
  await MemberYearAccount.deleteMany({});
  await ShareHistory.deleteMany({});
  // Remove dummy/test members not in NSF001-NSF035
  await Member.deleteMany({ memberId: { $not: /^NSF0(0[1-9]|[12][0-9]|3[0-5])$/ } });
  await Member.updateMany({}, { $set: { cashoutDue: 0 } });
  console.log('Previous payments, ledgers, expenses, investments, returns, movements, and settlements wiped.');

  // ─── 1. SETUP / VERIFY USERS & CUSTODY ACCOUNTS ─────────────────────────────
  let moinUser = await User.findOne({ email: /moin/i });
  if (!moinUser) moinUser = await User.findOne({ role: { $in: ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTANT'] } });
  let samratUser = (await User.findOne({ email: /samrat/i })) || moinUser;

  if (!moinUser) {
    throw new Error('Default admin/accountant user (Moin) not found in system.');
  }

  // Ensure standard custody accounts exist
  let moinBkashCustody = await CustodyAccount.findOne({ channel: 'BKASH', $or: [{ holderId: moinUser._id }, { name: /moin|merchant|bkash/i }] });
  if (!moinBkashCustody) {
    moinBkashCustody = await CustodyAccount.create({
      name: 'Moin Personal/Society bKash',
      channel: CustodyChannel.BKASH,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let bankCustody = await CustodyAccount.findOne({ channel: 'BANK' });
  if (!bankCustody) {
    bankCustody = await CustodyAccount.create({
      name: 'Islami Bank Bangladesh Ltd (IBBL)',
      channel: CustodyChannel.BANK,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let samratNagadCustody = await CustodyAccount.findOne({ channel: 'NAGAD' });
  if (!samratNagadCustody) {
    samratNagadCustody = await CustodyAccount.create({
      name: 'Samrat Nagad Wallet',
      channel: CustodyChannel.NAGAD,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: samratUser?._id || moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let samratCashCustody = await CustodyAccount.findOne({ channel: 'CASH' });
  if (!samratCashCustody) {
    samratCashCustody = await CustodyAccount.create({
      name: 'Physical Petty Cash',
      channel: CustodyChannel.CASH,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: samratUser?._id || moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let growupWallet = await CustodyAccount.findOne({ name: /growup/i });
  if (!growupWallet) {
    growupWallet = await CustodyAccount.create({
      name: 'GrowUp Partner Wallet',
      channel: CustodyChannel.WALLET,
      accountType: AccountType.EXTERNAL_WALLET,
      holderId: moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  // ─── 2. PROCESS MEMBERS FROM "Sorted Members" ───────────────────────────────
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
    const isDropped = code === 'NSF007' || code === 'NSF032';

    let member = await Member.findOne({ memberId: code });
    if (!member) {
      member = new Member({
        memberId: code,
        name,
        phone: phone || '+8801700000000',
        joinDate,
        initialShares: shares,
        currentShares: shares,
        status: isDropped ? MemberStatus.DROPPED : MemberStatus.ACTIVE,
        cashoutDue: 0,
      });
    } else {
      member.name = name;
      if (phone) member.phone = phone;
      (member as any).currentShares = shares;
      member.status = isDropped ? MemberStatus.DROPPED : MemberStatus.ACTIVE;
      member.cashoutDue = 0;
    }
    await member.save();
    memberIdMap.set(code, member);

    // Initial Share History for 2024
    await ShareHistory.create({
      memberId: member._id,
      shareCount: shares,
      previousShareCount: 0,
      effectiveMonth: '2024-01',
      eventType: ShareEventType.INITIAL_ALLOCATION,
      changedBy: moinUser._id,
      notes: '2024 Baseline Share Allocation',
    });
  }
  console.log(`Loaded and initialized ${memberIdMap.size} members.`);

  // ─── 3. PROCESS "Audit 2024 cross check" ────────────────────────────────────
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

      const isDropped = code === 'NSF007' || code === 'NSF032';

      // Update Member
      member.auditRemarks2024 = isDropped
        ? code === 'NSF007'
          ? 'মার্চ পর্যন্ত পরিশোধিত (অব্যাহত রাখেননি)'
          : 'অব্যাহত রাখেননি - রিফান্ড প্রদান সম্পন্ন'
        : remarks;
      member.cashoutDue = isDropped ? 0 : dueCO;
      await member.save();

      // Update MemberYearAccount (For dropped members, obligations match what was paid, 0 shortfall, 0 dues)
      const principalDue = isDropped ? 0 : Math.max(0, dueAmount - duePen - dueCO);
      await MemberYearAccount.create({
        memberId: member._id,
        year: 2024,
        annualObligation: isDropped ? (code === 'NSF007' ? 1500 : 2000) : annualFee,
        totalPrincipalPaid: isDropped ? (code === 'NSF007' ? 1500 : 2000) : paidPrincipal,
        totalPaid: isDropped ? (code === 'NSF007' ? 1500 : 2000) : totalPaid,
        totalPenaltyPaid: isDropped ? 0 : penPaid,
        totalCashoutPaid: isDropped ? 0 : coPaid,
        cashoutDue: isDropped ? 0 : dueCO,
        shortfall: principalDue,
        excessAdvance: advanceBalance,
        finalShares: decShare,
        notes: isDropped
          ? code === 'NSF007'
            ? 'মার্চ পর্যন্ত পরিশোধিত (অব্যাহত রাখেননি)'
            : 'অব্যাহত রাখেননি - রিফান্ড প্রদান সম্পন্ন'
          : remarks,
        isSettled: isDropped || dueAmount === 0,
        settledAt: new Date('2024-12-31T23:59:59.000Z'),
      });
    }
    console.log(`Updated 2024 Year Accounts & Audit Remarks for ${dataRows.length} members.`);
  }

  // ─── 4. PROCESS 12 MONTHLY PAYMENT SHEETS ───────────────────────────────────
  console.log('\n--- 3. Processing 12 Monthly Payment Sheets ---');
  const monthConfigs = [
    { key: '2024-01', name: 'January, 2024' },
    { key: '2024-02', name: 'February, 2024' },
    { key: '2024-03', name: 'March, 2024' },
    { key: '2024-04', name: 'April, 2024' },
    { key: '2024-05', name: 'May, 2024' },
    { key: '2024-06', name: 'June, 2024' },
    { key: '2024-07', name: 'July, 2024' },
    { key: '2024-08', name: 'August, 2024' },
    { key: '2024-09', name: 'Sept, 2024' },
    { key: '2024-10', name: 'Oct, 2024' },
    { key: '2024-11', name: 'Nov, 2024' },
    { key: '2024-12', name: 'Dec, 2024' },
  ];

  let totalPaymentsRecorded = 0;
  let totalLedgersRecorded = 0;

  for (const cfg of monthConfigs) {
    const sheet = wb.Sheets[cfg.name];
    if (!sheet) {
      console.warn(`Sheet not found: ${cfg.name}`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const dataRows = rows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));

    for (const r of dataRows) {
      const code = String(r[0]).trim();
      const member = memberIdMap.get(code);
      if (!member) continue;

      const pDate = excelSerialToDate(r[6], `${cfg.key}-10`);
      const shareCount = Number(r[2] || 1);
      const totalAmount = Number(r[3] || 0);
      const gatewayStr = String(r[4] || 'Bkash').toUpperCase();
      const receiverStr = String(r[5] || 'Moin');
      const penaltyCol = Number(r[8] || 0);
      const comment = String(r[9] || '').trim();

      const receiverUser = (/samrat/i.test(receiverStr) ? samratUser : moinUser)!;
      let custodyAcc = moinBkashCustody;
      let method = PaymentMethod.BKASH;

      if (gatewayStr.includes('BANK')) {
        method = PaymentMethod.BANK_TRANSFER;
        custodyAcc = bankCustody;
      } else if (gatewayStr.includes('NAGAD')) {
        method = PaymentMethod.NAGAD;
        custodyAcc = samratNagadCustody;
      } else if (gatewayStr.includes('CASH')) {
        method = PaymentMethod.CASH;
        custodyAcc = samratCashCustody;
      } else if (/samrat/i.test(receiverStr)) {
        custodyAcc = samratNagadCustody;
      }

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

        // Record single Payment
        const receiptNumber = `HIST-${cfg.key}-${code}`;
        const paymentDoc = await Payment.create({
          receiptNumber,
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
        });

        // Record CustodyMovement (IN)
        await CustodyMovement.create({
          custodyAccountId: custodyAcc._id,
          movementType: MovementType.IN,
          amount: totalAmount,
          sourceType: MovementSourceType.MEMBER_PAYMENT,
          sourceRefId: paymentDoc._id,
          sourceRefType: 'Payment',
          date: pDate,
          performedBy: receiverUser._id,
          description: `Contribution receipt ${receiptNumber} from ${member.name} (${code})`,
        });

        totalPaymentsRecorded++;
      }

      // Record MonthlyLedger
      const isBayzidWaived = code === 'NSF007' && cfg.key > '2024-03';
      const isTanvirWaived = code === 'NSF032' && cfg.key > '2024-02';

      if (isBayzidWaived || isTanvirWaived) {
        // Dropped members have 0 dues and status WAIVED after exit
        await MonthlyLedger.create({
          memberId: member._id,
          month: cfg.key,
          shareCount,
          principalDue: 0,
          principalPaid: 0,
          penaltyDue: 0,
          penaltyPaid: 0,
          cashoutDue: 0,
          status: 'WAIVED',
          notes: isBayzidWaived ? 'Member dropped (মার্চ পর্যন্ত পরিশোধিত)' : 'Member dropped (অব্যাহত রাখেননি)',
        });
      } else {
        const expectedPrincipal = shareCount * 500;
        const isPaid = totalAmount >= expectedPrincipal;
        const ledgerStatus = isPaid ? 'PAID' : totalAmount > 0 ? 'PARTIAL' : 'DUE';

        await MonthlyLedger.create({
          memberId: member._id,
          month: cfg.key,
          shareCount,
          principalDue: expectedPrincipal,
          principalPaid,
          penaltyDue: isPaid ? 0 : penaltyCol,
          penaltyPaid,
          cashoutDue: code === 'NSF020' && cfg.key === '2024-05' ? 20 : code === 'NSF023' && cfg.key === '2024-05' ? 10 : 0,
          status: ledgerStatus,
          paymentMethod: totalAmount > 0 ? method : undefined,
          notes: comment,
        });
      }
      totalLedgersRecorded++;
    }
  }
  console.log(`Recorded exactly ${totalPaymentsRecorded} Payments and ${totalLedgersRecorded} MonthlyLedgers.`);

  // ─── 5. PROCESS EXPENSES ────────────────────────────────────────────────────
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
      const expCustody = (/samrat/i.test(paidByStr) ? samratCashCustody : moinBkashCustody)!;

      const expenseNumber = `EXP-2024-${String(i + 1).padStart(3, '0')}`;
      const expenseDoc = await Expense.create({
        expenseNumber,
        custodyAccountId: expCustody._id,
        amount,
        category: /meeting|খাবার|নাস্তা/i.test(reason) ? 'MEETING' : /ai|subscription/i.test(reason) ? 'SOFTWARE' : 'COMMUNICATION',
        date: eDate,
        description: reason,
        createdBy: expUser._id,
      });

      // Record CustodyMovement (OUT)
      await CustodyMovement.create({
        custodyAccountId: expCustody._id,
        movementType: MovementType.OUT,
        amount,
        sourceType: MovementSourceType.EXPENSE,
        sourceRefId: expenseDoc._id,
        sourceRefType: 'Expense',
        date: eDate,
        performedBy: expUser._id,
        description: `Operational expense voucher ${expenseNumber}: ${reason}`,
      });

      expCount++;
    }
    console.log(`Recorded ${expCount} Expenses and associated custody movements.`);
  }

  // ─── 6. PROCESS 2024 INVESTMENTS (SL 1 TO 11) ──────────────────────────────
  console.log('\n--- 5. Processing 2024 Investments (SL 1 to 11) ---');
  const invSheet = wb.Sheets['Investment'];
  if (invSheet) {
    const invRows = XLSX.utils.sheet_to_json(invSheet, { header: 1 }) as any[][];
    // Filter strictly 2024 investments (SL 1 to 11)
    const invData2024 = invRows.slice(2).filter((r) => {
      if (!r || r[0] === undefined || !r[4]) return false;
      const pDate = excelSerialToDate(r[3], '2020-01-01');
      return pDate.getFullYear() === 2024;
    });

    let invCount = 0;
    for (const r of invData2024) {
      const sl = r[0];
      const invNo = String(r[2] || `PRJ-2024-${sl}`).replace('#', '').trim();
      const amount = Number(r[4] || 0);
      const pName = String(r[7]).trim();
      const duration = String(r[8] || '6 months').trim();
      const roiAnnual = Number(r[9] || 0.38) * 100;
      const statusStr = String(r[11] || 'Running').trim();
      const pStatus = /matured/i.test(statusStr) ? ProjectStatus.MATURED : ProjectStatus.ACTIVE;
      const org = String(r[12] || 'GrowUp').trim();
      const actualRoi = r[13] ? Number(r[13]) : undefined;
      const paidMoin = r[17] === '-' || !r[17] ? 0 : Number(r[17]);
      const paidSamrat = r[18] === '-' || !r[18] ? 0 : Number(r[18]);
      const comment = String(r[20] || '').trim();

      const payDate = excelSerialToDate(r[3], '2024-04-01');
      const startDate = excelSerialToDate(r[5], '2024-04-01');
      const maturityDate = excelSerialToDate(r[6], '2024-10-01');

      const projectDoc = await InvestmentProject.create({
        projectId: `PRJ-2024-${sl}`,
        name: pName,
        category: /cow|cattle|goat/i.test(pName) ? 'LIVESTOCK' : /banana|sugar|onion|papaya/i.test(pName) ? 'AGRO' : /fish/i.test(pName) ? 'FISHERIES' : 'TRADE',
        startDate,
        maturityDate,
        plannedDuration: duration,
        targetPrincipal: amount,
        totalFunded: amount,
        expectedAnnualRoiPercent: roiAnnual,
        status: pStatus,
        externalEntity: org,
        invoiceNo: invNo,
        description: comment || `Authoritative 2024 Investment record #${sl}`,
        createdBy: moinUser._id,
      });

      // Track Cash Outflows from Accountants
      if (paidMoin > 0) {
        await CustodyMovement.create({
          custodyAccountId: moinBkashCustody._id,
          movementType: MovementType.OUT,
          amount: paidMoin,
          sourceType: MovementSourceType.INVESTMENT_FUNDING,
          sourceRefId: projectDoc._id,
          sourceRefType: 'InvestmentProject',
          date: payDate,
          performedBy: moinUser._id,
          description: `Capital disbursement for ${pName} (${invNo}) paid by Moin`,
        });
      }

      if (paidSamrat > 0) {
        await CustodyMovement.create({
          custodyAccountId: samratNagadCustody._id,
          movementType: MovementType.OUT,
          amount: paidSamrat,
          sourceType: MovementSourceType.INVESTMENT_FUNDING,
          sourceRefId: projectDoc._id,
          sourceRefType: 'InvestmentProject',
          date: payDate,
          performedBy: samratUser?._id || moinUser._id,
          description: `Capital disbursement for ${pName} (${invNo}) paid by Samrat`,
        });
      }

      // If Matured in 2024 (SL 1 to 4), record Return into GrowUp Partner Wallet for Reinvestment
      if (pStatus === ProjectStatus.MATURED && actualRoi !== undefined) {
        const totalReturn = amount + actualRoi;
        await InvestmentReturn.create({
          projectId: projectDoc._id,
          maturityDate,
          principalReturned: amount,
          actualProfit: actualRoi,
          actualLoss: 0,
          totalReturn,
          destinationType: ReturnDestinationType.EXTERNAL_WALLET,
          destinationCustodyAccountId: growupWallet._id,
          transactionRef: `RET-2024-${sl}`,
          recordedBy: moinUser._id,
          notes: `Matured return credited to GrowUp wallet for reinvestment`,
        });
      }

      invCount++;
    }
    console.log(`Recorded ${invCount} 2024 Investment Projects with verified custody disbursements and returns.`);
  }

  // ─── 7. PROCESS DEPARTED MEMBER REFUNDS (EXIT SETTLEMENTS & DOCUMENTS) ──────
  console.log('\n--- 6. Processing Departed Member Refunds & Documents ---');

  // NSF032 (Ahsan Ul Tanvir): ৳1,802 on 11/01/2026 via bKash
  const m32 = memberIdMap.get('NSF032');
  if (m32) {
    const mov32 = await CustodyMovement.create({
      custodyAccountId: moinBkashCustody._id,
      date: new Date('2026-01-11'),
      amount: 1802,
      movementType: MovementType.OUT,
      sourceType: MovementSourceType.FINAL_DISTRIBUTION,
      description: 'Member Exit Refund for Ahsan Ul Tanvir (NSF032) via bKash by Accountant Moin Uddin',
      performedBy: moinUser._id,
    });

    await MemberExitSettlement.create({
      memberId: m32._id,
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
      transactionRef: 'BKASH-REF-20260111-NSF032',
      authorizerName: 'Moin Uddin',
      documentName: 'Refund_Voucher_NSF032_Tanvir.pdf',
      receiptNumber: 'RCPT-EXIT-NSF032',
      notes: 'Refunded ৳1,802 via bKash on 11/01/2026 by Accountant Moin Uddin (deducted from bKash custody). Member exited and settled.',
    });
    console.log('Recorded MemberExitSettlement & document proof for NSF032 (Ahsan Ul Tanvir).');
  }

  // NSF007 (Bayzid Hasan): ৳1,000 on 15/01/2026 via bKash
  const m7 = memberIdMap.get('NSF007');
  if (m7) {
    const mov7 = await CustodyMovement.create({
      custodyAccountId: moinBkashCustody._id,
      date: new Date('2026-01-15'),
      amount: 1000,
      movementType: MovementType.OUT,
      sourceType: MovementSourceType.FINAL_DISTRIBUTION,
      description: 'Member Exit Refund for Bayzid Hasan (NSF007) via bKash by Accountant Moin Uddin',
      performedBy: moinUser._id,
    });

    await MemberExitSettlement.create({
      memberId: m7._id,
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
      transactionRef: 'BKASH-REF-20260115-NSF007',
      authorizerName: 'Moin Uddin',
      documentName: 'Refund_Voucher_NSF007_Bayzid.pdf',
      receiptNumber: 'RCPT-EXIT-NSF007',
      notes: 'Refunded ৳1,000 via bKash on 15/01/2026 by Accountant Moin Uddin (deducted from bKash custody). Member exited and settled.',
    });
    console.log('Recorded MemberExitSettlement & document proof for NSF007 (Bayzid Hasan).');
  }

  // ─── 8. SYNCHRONIZE CUSTODY ACCOUNT BALANCES ────────────────────────────────
  console.log('\n--- 7. Synchronizing Custody Balances ---');
  const allAccounts = await CustodyAccount.find();
  for (const acc of allAccounts) {
    const movements = await CustodyMovement.find({ custodyAccountId: acc._id });
    const inTotal = movements.filter((m) => m.movementType === MovementType.IN).reduce((s, m) => s + m.amount, 0);
    const outTotal = movements.filter((m) => m.movementType === MovementType.OUT).reduce((s, m) => s + m.amount, 0);
    acc.cachedBalance = Math.round((inTotal - outTotal) * 100) / 100;
    await acc.save();
    console.log(`   Account: ${acc.name} | Total IN: ৳${inTotal} | Total OUT: ৳${outTotal} | Balance: ৳${acc.cachedBalance}`);
  }

  // ─── 9. ENSURE ACTIVE MONTHLY LEDGERS UP TO DATE (2024 TO PRESENT) ────────
  console.log('\n--- 8. Ensuring Active Monthly Ledgers Up To Date (2024 to Present) ---');
  await PaymentService.ensureMonthlyLedgersUpToDate();
  console.log('   Active monthly obligations dynamically synchronized.');

  console.log('\n=== COMPLETE 2024 CLEAN STAGING FINISHED SUCCESSFULLY ===\n');
}

if (process.argv[1] && process.argv[1].endsWith('stage-2024-from-updated-workbook.ts')) {
  stage2024FromUpdatedWorkbook()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error staging 2024 data:', err);
      process.exit(1);
    });
}
