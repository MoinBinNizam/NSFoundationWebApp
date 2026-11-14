import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import {
  AuditLog,
  CustodyAccount,
  CustodyMovement,
  Expense,
  InvestmentProject,
  InvestmentReturn,
  Member,
  MonthlyLedger,
  Payment,
  PaymentAllocation,
  User,
} from '../models/index.js';
import {
  AccountType,
  AllocationType,
  CustodyChannel,
  MonthlyLedgerStatus,
  MovementSourceType,
  MovementType,
  PaymentMethod,
  PaymentStatus,
} from '../types/models.js';
import { PaymentService } from './payment.service.js';
import { InvestmentService } from './investment.service.js';

function getDocsPath(subPath: string): string {
  const p1 = path.resolve(process.cwd(), '..', 'docs', subPath);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.resolve(process.cwd(), 'docs', subPath);
  if (fs.existsSync(p2)) return p2;
  return p1;
}

function excelSerialToDate(serial: any, fallbackDate: string): Date {
  if (typeof serial === 'number' && serial > 20000 && serial < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + serial * 86400000);
  }
  const parsed = new Date(String(serial));
  return isNaN(parsed.getTime()) ? new Date(fallbackDate) : parsed;
}

export class HistoricalSyncService {
  /**
   * Returns authoritative counts and amounts across all 4 historical scopes
   */
  static async getOverview() {
    const start2024 = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
    const end2024 = new Date(Date.UTC(2024, 11, 31, 23, 59, 59, 999));
    const start2025 = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    const end2025 = new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999));

    const [
      membersCount,
      payments2024,
      payments2025,
      ledgers2024Count,
      ledgers2025Count,
      expensesList,
      projectsList,
      returnsList,
      custodyAccounts,
    ] = await Promise.all([
      Member.countDocuments(),
      Payment.find({ paymentDate: { $gte: start2024, $lte: end2024 }, status: { $ne: PaymentStatus.CANCELLED } }).lean(),
      Payment.find({ paymentDate: { $gte: start2025, $lte: end2025 }, status: { $ne: PaymentStatus.CANCELLED } }).lean(),
      MonthlyLedger.countDocuments({ month: { $regex: '^2024-' } }),
      MonthlyLedger.countDocuments({ month: { $regex: '^2025-' } }),
      Expense.find().lean(),
      InvestmentProject.find().lean(),
      InvestmentReturn.find().lean(),
      CustodyAccount.find({ isActive: true }).lean(),
    ]);

    const total2024Amount = payments2024.reduce((s, p) => s + (p.totalAmount || 0), 0);
    const total2025Amount = payments2025.reduce((s, p) => s + (p.totalAmount || 0), 0);
    const totalExpensesAmount = expensesList.reduce((s, e) => s + (e.amount || 0), 0);
    const totalFunded = projectsList.reduce((s, p) => s + (p.totalFunded || 0), 0);
    const totalRealizedProfit = returnsList.reduce((s, r) => s + (r.actualProfit || 0), 0);

    return {
      membersCount,
      year2024: {
        status: payments2024.length >= 304 ? 'SYNCED' : payments2024.length > 0 ? 'PARTIAL' : 'PENDING',
        paymentsCount: payments2024.length,
        totalAmount: total2024Amount,
        ledgersCount: ledgers2024Count,
        expectedPayments: 304,
        expectedAmount: 388975,
      },
      year2025: {
        status: payments2025.length >= 60 ? 'SYNCED' : payments2025.length > 0 ? 'PARTIAL' : 'PENDING',
        months: ['2025-01', '2025-02', '2025-03', '2025-04'],
        paymentsCount: payments2025.length,
        totalAmount: total2025Amount,
        ledgersCount: ledgers2025Count,
        expectedPayments: 60,
        expectedAmount: 93170,
      },
      expenses: {
        status: expensesList.length >= 5 ? 'SYNCED' : expensesList.length > 0 ? 'PARTIAL' : 'PENDING',
        count: expensesList.length,
        totalAmount: totalExpensesAmount,
        expectedCount: 5,
        expectedAmount: 3760,
      },
      investments: {
        status: projectsList.length >= 20 ? 'SYNCED' : projectsList.length > 0 ? 'PARTIAL' : 'PENDING',
        projectsCount: projectsList.length,
        totalFunded,
        totalRealizedProfit,
        expectedProjects: 20,
        expectedFunded: 1312363,
      },
      custody: custodyAccounts.map((a) => ({
        id: a._id,
        name: a.name,
        channel: a.channel,
        accountType: a.accountType,
        cachedBalance: a.cachedBalance || 0,
      })),
    };
  }

  /**
   * Ensures Standard Core Users and Custody Accounts exist
   */
  private static async ensureCoreActorsAndCustody() {
    const moinUser = await User.findOne({
      $or: [{ name: /moin/i }, { email: /admin@nsfoundation\.org/i }, { role: 'SUPER_ADMIN' }],
    });
    const samratUser = await User.findOne({
      $or: [{ name: /samrat/i }, { email: /assistant@nsfoundation\.org/i }, { role: 'ACCOUNTANT' }],
    });

    if (!moinUser) throw new Error('Accountant/Admin Moin Uddin not found in database.');
    const activeSamrat = samratUser || moinUser;

    let bankCustody = await CustodyAccount.findOne({ channel: CustodyChannel.BANK });
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

    let moinBkashCustody = await CustodyAccount.findOne({
      channel: CustodyChannel.BKASH,
      $or: [{ holderId: moinUser._id }, { name: /moin/i }],
    });
    if (!moinBkashCustody) {
      moinBkashCustody = await CustodyAccount.create({
        name: 'Moin Uddin Personal bKash',
        channel: CustodyChannel.BKASH,
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: moinUser._id,
        cachedBalance: 0,
        isActive: true,
      });
    }

    let samratBkashCustody = await CustodyAccount.findOne({
      channel: CustodyChannel.BKASH,
      $or: [{ holderId: activeSamrat._id }, { name: /samrat.*bkash/i }],
    });
    if (!samratBkashCustody) {
      samratBkashCustody = await CustodyAccount.create({
        name: 'Samrat Personal bKash',
        channel: CustodyChannel.BKASH,
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: activeSamrat._id,
        cachedBalance: 0,
        isActive: true,
      });
    }

    let samratNagadCustody = await CustodyAccount.findOne({ channel: CustodyChannel.NAGAD });
    if (!samratNagadCustody) {
      samratNagadCustody = await CustodyAccount.create({
        name: 'Samrat Nagad Wallet',
        channel: CustodyChannel.NAGAD,
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: activeSamrat._id,
        cachedBalance: 0,
        isActive: true,
      });
    }

    let moinCashCustody = await CustodyAccount.findOne({
      channel: CustodyChannel.CASH,
      $or: [{ holderId: moinUser._id }, { name: /^Physical Petty Cash/i }],
    });
    if (!moinCashCustody) {
      moinCashCustody = await CustodyAccount.create({
        name: 'Physical Petty Cash',
        channel: CustodyChannel.CASH,
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: moinUser._id,
        cachedBalance: 0,
        isActive: true,
      });
    }

    let samratCashCustody = await CustodyAccount.findOne({
      channel: CustodyChannel.CASH,
      $or: [{ holderId: activeSamrat._id }, { name: /samrat.*cash/i }],
    });
    if (!samratCashCustody) {
      samratCashCustody = await CustodyAccount.create({
        name: 'Samrat Physical Petty Cash',
        channel: CustodyChannel.CASH,
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: activeSamrat._id,
        cachedBalance: 0,
        isActive: true,
      });
    }

    return {
      moinUser,
      samratUser: activeSamrat,
      bankCustody,
      moinBkashCustody,
      samratBkashCustody,
      samratNagadCustody,
      moinCashCustody,
      samratCashCustody,
    };
  }

  /**
   * Recalculate cached balances across all custody accounts
   */
  private static async rebalanceAllCustody() {
    const allAccounts = await CustodyAccount.find();
    for (const acc of allAccounts) {
      const movements = await CustodyMovement.find({ custodyAccountId: acc._id });
      const inTotal = movements.filter((m) => m.movementType === MovementType.IN).reduce((s, m) => s + m.amount, 0);
      const outTotal = movements.filter((m) => m.movementType === MovementType.OUT).reduce((s, m) => s + m.amount, 0);
      acc.cachedBalance = Math.round((inTotal - outTotal) * 100) / 100;
      await acc.save();
    }
  }

  /**
   * Action 1: Synchronize 2024 Historical Data (35 Members, 12 Months Payments, Ledgers, Custody)
   */
  static async sync2024(dryRun = false, actor: any) {
    const excelPath = getDocsPath('updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Workbook file not found at ${excelPath}`);
    }

    const {
      moinUser,
      samratUser,
      bankCustody,
      moinBkashCustody,
      samratBkashCustody,
      samratNagadCustody,
      moinCashCustody,
      samratCashCustody,
    } = await this.ensureCoreActorsAndCustody();

    const wb = XLSX.readFile(excelPath);

    // 1. Members
    const membersSheet = wb.Sheets['Sorted Members'];
    const memberRows = XLSX.utils.sheet_to_json(membersSheet, { header: 1 }) as any[][];
    const memberData = memberRows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));
    const memberIdMap = new Map<string, any>();

    for (const r of memberData) {
      const code = String(r[0]).trim();
      let m = await Member.findOne({ memberId: code });
      if (!m && !dryRun) {
        const rawName = String(r[1] || code).trim();
        const cleanName = rawName.replace(/\s*-[A-Za-z0-9.\s]+$/, '').trim();
        m = await Member.create({
          memberId: code,
          name: cleanName,
          phone: String(r[3] || '01700000000').trim(),
          email: `${code.toLowerCase()}@nsfoundation.org`,
          status: 'ACTIVE',
          shares: Number(r[2] || 1),
          joinDate: new Date('2024-01-01'),
        });
      }
      if (m) memberIdMap.set(code, m);
    }

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

    let paymentsCount = 0;
    let totalAmount = 0;
    let moinCount = 0;
    let samratCount = 0;

    for (const cfg of monthConfigs) {
      const sheet = wb.Sheets[cfg.name];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      const dataRows = rows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));

      for (const r of dataRows) {
        const code = String(r[0]).trim();
        const member = memberIdMap.get(code);
        const amt = Number(r[3]);
        if (isNaN(amt) || amt <= 0) continue;

        paymentsCount++;
        totalAmount += amt;

        const gatewayStr = String(r[4] || 'Bkash').trim().toUpperCase();
        const receiverStr = String(r[5] || 'Moin').trim();
        const isSamrat = /samrat/i.test(receiverStr);
        if (isSamrat) samratCount++; else moinCount++;

        const receiverUser = isSamrat ? samratUser : moinUser;
        let custodyAcc = isSamrat ? samratBkashCustody : moinBkashCustody;
        let method = PaymentMethod.BKASH;

        if (gatewayStr.includes('BANK')) {
          method = PaymentMethod.BANK_TRANSFER;
          custodyAcc = bankCustody;
        } else if (gatewayStr.includes('NAGAD')) {
          method = PaymentMethod.NAGAD;
          custodyAcc = samratNagadCustody;
        } else if (gatewayStr.includes('CASH')) {
          method = PaymentMethod.CASH;
          custodyAcc = isSamrat ? samratCashCustody : moinCashCustody;
        } else if (gatewayStr.includes('SELF')) {
          method = isSamrat ? PaymentMethod.NAGAD : PaymentMethod.BKASH;
          custodyAcc = isSamrat ? samratNagadCustody : moinBkashCustody;
        }

        if (!dryRun && member) {
          const receiptNumber = `HIST-${cfg.key}-${code}`;
          const pDate = excelSerialToDate(r[6], `${cfg.key}-10`);
          const shareCount = Number(r[2] || 1);
          const penaltyCol = Number(r[8] || 0);
          const comment = String(r[9] || '').trim();

          let penaltyPaid = 0;
          if (/penalty\s*(\d+)/i.test(comment)) {
            const match = comment.match(/penalty\s*(\d+)/i);
            if (match) penaltyPaid = Number(match[1]);
          } else if (penaltyCol > 0 && amt > shareCount * 500) {
            penaltyPaid = penaltyCol;
          }
          const principalPaid = Math.max(0, amt - penaltyPaid);

          // Upsert Payment
          let payment = await Payment.findOne({ receiptNumber });
          if (!payment) {
            payment = await Payment.create({
              receiptNumber,
              memberId: member._id,
              receiverId: receiverUser._id,
              custodyAccountId: custodyAcc._id,
              paymentDate: pDate,
              totalAmount: amt,
              principalAmount: principalPaid,
              penaltyAmount: penaltyPaid,
              cashoutCharge: 0,
              paymentMethod: method,
              status: PaymentStatus.COLLECTED,
              notes: comment ? `[${cfg.name}] ${comment}` : `[${cfg.name}] Payment`,
            });
          } else {
            payment.receiverId = receiverUser._id;
            payment.custodyAccountId = custodyAcc._id;
            payment.paymentMethod = method;
            payment.totalAmount = amt;
            payment.principalAmount = principalPaid;
            payment.penaltyAmount = penaltyPaid;
            await payment.save();
          }

          // Upsert CustodyMovement (IN)
          let mov = await CustodyMovement.findOne({ sourceRefId: payment._id });
          if (!mov) {
            await CustodyMovement.create({
              custodyAccountId: custodyAcc._id,
              movementType: MovementType.IN,
              amount: amt,
              sourceType: MovementSourceType.MEMBER_PAYMENT,
              sourceRefId: payment._id,
              sourceRefType: 'Payment',
              date: pDate,
              performedBy: receiverUser._id,
              description: `Contribution receipt ${receiptNumber} from ${member.name} (${code})`,
            });
          } else {
            mov.custodyAccountId = custodyAcc._id;
            mov.performedBy = receiverUser._id;
            mov.amount = amt;
            await mov.save();
          }
        }
      }
    }

    if (!dryRun) {
      await this.rebalanceAllCustody();
      await PaymentService.ensureMonthlyLedgersUpToDate();
      await AuditLog.create({
        performedBy: actor._id,
        action: 'SYNC_HISTORICAL_2024',
        entityName: 'HistoricalMigration',
        reason: 'Executed full dynamic 2024 historical synchronization from Updated Excel workbook.',
        afterState: { paymentsCount, totalAmount, moinCount, samratCount },
      });
    }

    return {
      dryRun,
      membersProcessed: memberData.length,
      paymentsCount,
      totalAmount,
      moinCollections: moinCount,
      samratCollections: samratCount,
      status: 'SUCCESS',
      message: dryRun
        ? `Preview: 2024 contains ${paymentsCount} payments (৳${totalAmount.toLocaleString()}) across 12 monthly sheets. Ready to sync.`
        : `Successfully synchronized 2024 historical records: ${paymentsCount} payments (৳${totalAmount.toLocaleString()}) and custody accounts rebalanced.`,
    };
  }

  /**
   * Action 2: Synchronize 2025 Historical Staged Months (Jan, Feb, Mar, Apr 2025)
   */
  static async sync2025(dryRun = false, actor: any) {
    const manifestsDir = getDocsPath('import-historical-evidence/normalized-manifests');
    const months = [
      { key: '2025-01', folder: 'january-2025-staging' },
      { key: '2025-02', folder: 'february-2025-staging' },
      { key: '2025-03', folder: 'march-2025-staging' },
      { key: '2025-04', folder: 'april-2025-staging' },
    ];

    const {
      moinUser,
      samratUser,
      bankCustody,
      moinBkashCustody,
      samratBkashCustody,
      samratNagadCustody,
      moinCashCustody,
      samratCashCustody,
    } = await this.ensureCoreActorsAndCustody();

    const members = await Member.find().lean();
    const memberMap = new Map(members.map((m) => [m.memberId, m]));

    let totalPayments = 0;
    let totalReceived = 0;
    let totalLedgers = 0;
    let totalAllocations = 0;

    for (const mCfg of months) {
      const manifestFile = path.join(manifestsDir, mCfg.folder, 'staging-manifest.json');
      if (!fs.existsSync(manifestFile)) continue;

      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

      // Ledgers
      for (const row of manifest.ledgers || []) {
        totalLedgers++;
        const member = memberMap.get(row.member_id);
        if (!member || dryRun) continue;

        let ledger = await MonthlyLedger.findOne({ memberId: member._id, month: row.month });
        if (ledger) {
          ledger.shareCount = row.share_count;
          ledger.principalDue = row.principal_due;
          ledger.principalPaid = row.principal_paid;
          ledger.penaltyDue = row.penalty_due || 0;
          ledger.penaltyPaid = row.penalty_paid || 0;
          ledger.advanceApplied = row.advance_applied || 0;
          ledger.excessAdvance = row.excess_advance || 0;
          ledger.status = row.status === 'PAID' ? MonthlyLedgerStatus.PAID : MonthlyLedgerStatus.DUE;
          await ledger.save();
        } else {
          await MonthlyLedger.create({
            memberId: member._id,
            month: row.month,
            shareCount: row.share_count,
            principalDue: row.principal_due,
            principalPaid: row.principal_paid,
            penaltyDue: row.penalty_due || 0,
            penaltyPaid: row.penalty_paid || 0,
            advanceApplied: row.advance_applied || 0,
            excessAdvance: row.excess_advance || 0,
            status: row.status === 'PAID' ? MonthlyLedgerStatus.PAID : MonthlyLedgerStatus.DUE,
            lastRebuiltAt: new Date(),
          });
        }
      }

      // Payments & Allocations
      for (const pRow of manifest.payments || []) {
        totalPayments++;
        totalReceived += pRow.total_amount;
        const member = memberMap.get(pRow.member_id);
        if (!member || dryRun) continue;

        const isSamrat = /samrat/i.test(pRow.receiver_source || '');
        const receiverUser = isSamrat ? samratUser : moinUser;
        let custodyAcc = isSamrat ? samratBkashCustody : moinBkashCustody;
        let method = PaymentMethod.BKASH;

        if (pRow.gateway === 'BANK') {
          method = PaymentMethod.BANK_TRANSFER;
          custodyAcc = bankCustody;
        } else if (pRow.gateway === 'NAGAD') {
          method = PaymentMethod.NAGAD;
          custodyAcc = samratNagadCustody;
        } else if (pRow.gateway === 'CASH') {
          method = PaymentMethod.CASH;
          custodyAcc = isSamrat ? samratCashCustody : moinCashCustody;
        }

        const receiptNumber = `HIST-${mCfg.key.replace('-', '')}-${pRow.payment_ref.split('-').at(-1)}-${pRow.member_id}`;
        let payment = await Payment.findOne({ receiptNumber });
        if (!payment) {
          payment = await Payment.create({
            receiptNumber,
            memberId: member._id,
            receiverId: receiverUser._id,
            custodyAccountId: custodyAcc._id,
            paymentDate: new Date(pRow.payment_date),
            totalAmount: pRow.total_amount,
            principalAmount: pRow.total_amount,
            penaltyAmount: 0,
            cashoutCharge: 0,
            paymentMethod: method,
            status: PaymentStatus.COLLECTED,
            notes: `[${mCfg.key}] ${pRow.source_ref}; ${pRow.comment || ''}`.trim(),
          });
        }

        // Allocations
        const matchedAllocations = (manifest.allocations || []).filter((a: any) => a.payment_ref === pRow.payment_ref);
        for (const alloc of matchedAllocations) {
          totalAllocations++;
          const exists = await PaymentAllocation.findOne({ paymentId: payment._id, targetMonth: alloc.target_month, allocationType: alloc.allocation_type });
          if (!exists) {
            await PaymentAllocation.create({
              paymentId: payment._id,
              memberId: member._id,
              targetMonth: alloc.target_month,
              allocationType: alloc.allocation_type === 'ADVANCE' ? AllocationType.ADVANCE : AllocationType.PRINCIPAL,
              amount: alloc.amount,
              notes: alloc.source_ref,
            });
          }
        }

        // CustodyMovement
        let mov = await CustodyMovement.findOne({ sourceRefId: payment._id });
        if (!mov) {
          await CustodyMovement.create({
            custodyAccountId: custodyAcc._id,
            movementType: MovementType.IN,
            amount: pRow.total_amount,
            sourceType: MovementSourceType.MEMBER_PAYMENT,
            sourceRefId: payment._id,
            sourceRefType: 'Payment',
            date: new Date(pRow.payment_date),
            performedBy: receiverUser._id,
            description: `Historical payment ${receiptNumber} from ${member.name} (${pRow.member_id})`,
          });
        }
      }
    }

    if (!dryRun) {
      await this.rebalanceAllCustody();
      await AuditLog.create({
        performedBy: actor._id,
        action: 'SYNC_HISTORICAL_2025',
        entityName: 'HistoricalMigration',
        reason: 'Executed 2025 historical staged months import (Jan - Apr 2025).',
        afterState: { totalPayments, totalReceived, totalLedgers, totalAllocations },
      });
    }

    return {
      dryRun,
      months: months.map((m) => m.key),
      totalPayments,
      totalReceived,
      totalLedgers,
      totalAllocations,
      status: 'SUCCESS',
      message: dryRun
        ? `Preview: 2025 contains ${totalPayments} payments (৳${totalReceived.toLocaleString()}) across 4 approved months. Ready to sync.`
        : `Successfully synchronized 2025 historical records: ${totalPayments} payments (৳${totalReceived.toLocaleString()}) posted to production.`,
    };
  }

  /**
   * Action 3: Synchronize Historical Expenses (Operational Vouchers)
   */
  static async syncExpenses(dryRun = false, actor: any) {
    const excelPath = getDocsPath('updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Workbook file not found at ${excelPath}`);
    }

    const { moinUser, moinBkashCustody } = await this.ensureCoreActorsAndCustody();
    const wb = XLSX.readFile(excelPath);
    const expensesSheet = wb.Sheets['Expenses'];
    if (!expensesSheet) throw new Error('Expenses sheet not found in workbook.');

    const expRows = XLSX.utils.sheet_to_json(expensesSheet, { header: 1 }) as any[][];
    const expData = expRows.slice(2).filter((r) => r && r[0] !== undefined && r[1]);

    let expCount = 0;
    let totalExpenseAmount = 0;

    for (let i = 0; i < expData.length; i++) {
      const r = expData[i];
      const eDate = excelSerialToDate(r[0], '2024-01-01');
      const reason = String(r[1]).trim();
      const amount = Number(r[2] || 0);
      expCount++;
      totalExpenseAmount += amount;

      if (!dryRun) {
        const expenseNumber = `EXP-2024-${String(i + 1).padStart(3, '0')}`;
        let expenseDoc = await Expense.findOne({ expenseNumber });
        if (!expenseDoc) {
          expenseDoc = await Expense.create({
            expenseNumber,
            custodyAccountId: moinBkashCustody._id,
            amount,
            category: /meeting|খাবার|নাস্তা/i.test(reason) ? 'MEETING' : /ai|subscription/i.test(reason) ? 'SOFTWARE' : 'COMMUNICATION',
            date: eDate,
            description: reason,
            createdBy: moinUser._id,
          });
        } else {
          expenseDoc.custodyAccountId = moinBkashCustody._id;
          expenseDoc.amount = amount;
          expenseDoc.createdBy = moinUser._id;
          await expenseDoc.save();
        }

        // CustodyMovement (OUT)
        let mov = await CustodyMovement.findOne({ sourceRefId: expenseDoc._id });
        if (!mov) {
          await CustodyMovement.create({
            custodyAccountId: moinBkashCustody._id,
            movementType: MovementType.OUT,
            amount,
            sourceType: MovementSourceType.EXPENSE,
            sourceRefId: expenseDoc._id,
            sourceRefType: 'Expense',
            date: eDate,
            performedBy: moinUser._id,
            description: `Operational expense voucher ${expenseNumber}: ${reason}`,
          });
        } else {
          mov.custodyAccountId = moinBkashCustody._id;
          mov.amount = amount;
          mov.performedBy = moinUser._id;
          await mov.save();
        }
      }
    }

    if (!dryRun) {
      await this.rebalanceAllCustody();
      await AuditLog.create({
        performedBy: actor._id,
        action: 'SYNC_HISTORICAL_EXPENSES',
        entityName: 'HistoricalMigration',
        reason: 'Synchronized historical 2024 operational expenses.',
        afterState: { expCount, totalExpenseAmount },
      });
    }

    return {
      dryRun,
      expCount,
      totalExpenseAmount,
      status: 'SUCCESS',
      message: dryRun
        ? `Preview: Found ${expCount} operational expense vouchers totaling ৳${totalExpenseAmount.toLocaleString()}. Ready to sync.`
        : `Successfully synchronized ${expCount} expense vouchers (৳${totalExpenseAmount.toLocaleString()}) to Moin Uddin Personal bKash.`,
    };
  }

  /**
   * Action 4: Synchronize Historical Investments & Project Returns
   * Reads authoritative docs/updated-payments-files/NS Foundation Investments.xlsx
   */
  static async syncInvestments(dryRun = false, actor: any) {
    return InvestmentService.syncAuthoritativeInvestments(dryRun, actor);
  }
}

