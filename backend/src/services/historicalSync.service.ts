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
  MemberExitSettlement,
  MonthlyLedger,
  Payment,
  PaymentAllocation,
  ShareHistory,
  SystemConfig,
  User,
} from '../models/index.js';
import {
  AccountType,
  AllocationType,
  CustodyChannel,
  MemberExitStatus,
  MemberStatus,
  MonthlyLedgerStatus,
  MovementSourceType,
  MovementType,
  PaymentMethod,
  PaymentStatus,
  ShareEventType,
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
      moduleConfig,
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
      SystemConfig.findOne({ key: 'HISTORICAL_MIGRATION_ENABLED' }).lean(),
    ]);

    const total2024Amount = payments2024.reduce((s, p) => s + (p.totalAmount || 0), 0);
    const total2025Amount = payments2025.reduce((s, p) => s + (p.totalAmount || 0), 0);
    const totalExpensesAmount = expensesList.reduce((s, e) => s + (e.amount || 0), 0);
    const totalFunded = projectsList.reduce((s, p) => s + (p.totalFunded || 0), 0);
    const totalRealizedProfit = returnsList.reduce((s, r) => s + (r.actualProfit || 0), 0);

    return {
      membersCount,
      members: {
        status: membersCount >= 35 ? 'SYNCED' : membersCount > 0 ? 'PARTIAL' : 'PENDING',
        count: membersCount,
        expectedCount: 35,
      },
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
      isModuleEnabled: moduleConfig ? Boolean(moduleConfig.value) : true,
    };
  }

  /**
   * Ensures Standard Core Users and Custody Accounts exist
   */
  private static async ensureCoreActorsAndCustody(actor?: any) {
    let moinUser = await User.findOne({
      $or: [{ name: /moin/i }, { email: /admin@nsfoundation\.org/i }, { role: 'SUPER_ADMIN' }],
    });
    if (!moinUser && actor) {
      moinUser = actor;
    }
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
   * Step 1: Synchronize 35 Sorted Members & Baseline Shares
   */
  static async syncMembers(dryRun = false, actor: any, force = false) {
    const excelPath = getDocsPath('updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Workbook file not found at ${excelPath}`);
    }

    const currentCount = await Member.countDocuments();
    if (!dryRun && !force && currentCount >= 35) {
      return {
        alreadySynced: true,
        scope: 'Step 1: Members',
        count: currentCount,
        message: 'সদস্য তালিকা ইতিমধ্যেই ডাটাবেজে সম্পূর্ণভাবে সংরক্ষিত রয়েছে (৩৫ জন সদস্য)। ডুপ্লিকেশন প্রতিরোধে পুনরায় ইমপোর্ট ব্লক করা হয়েছে।',
      };
    }

    if (!dryRun && force) {
      await this.purgeMembers(actor);
    }

    const wb = XLSX.readFile(excelPath);
    const membersSheet = wb.Sheets['Sorted Members'];
    const memberRows = XLSX.utils.sheet_to_json(membersSheet, { header: 1 }) as any[][];
    const memberData = memberRows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));

    let createdCount = 0;
    let updatedCount = 0;

    for (const r of memberData) {
      const code = String(r[0]).trim();
      const isDropped = code === 'NSF007' || code === 'NSF032';
      const rawName = String(r[1] || code).trim();
      const cleanName = rawName.replace(/\s*-[A-Za-z0-9.\s]+$/, '').trim();
      let phone = String(r[3] || '01700000000').trim();
      if (phone && !phone.startsWith('+')) phone = '+' + phone;
      const shares = Number(r[2] || 1);

      let m = await Member.findOne({ memberId: code });
      if (!m) {
        createdCount++;
        if (!dryRun) {
          m = await Member.create({
            memberId: code,
            name: cleanName,
            phone,
            email: `${code.toLowerCase()}@nsfoundation.org`,
            status: isDropped ? MemberStatus.DROPPED : MemberStatus.ACTIVE,
            joinDate: new Date('2024-01-01'),
            cashoutDue: 0,
          });
        }
      } else {
        updatedCount++;
        if (!dryRun) {
          m.name = cleanName;
          m.phone = phone;
          m.status = isDropped ? MemberStatus.DROPPED : MemberStatus.ACTIVE;
          await m.save();
        }
      }

      if (!dryRun && m) {
        let sh = await ShareHistory.findOne({ memberId: m._id });
        if (!sh) {
          await ShareHistory.create({
            memberId: m._id,
            shareCount: shares,
            previousShareCount: 0,
            effectiveMonth: '2024-01',
            eventType: ShareEventType.INITIAL_ALLOCATION,
            changedBy: actor._id,
            notes: '2024 Baseline Share Allocation',
          });
        }
      }
    }

    if (!dryRun) {
      await AuditLog.create({
        performedBy: actor._id,
        action: 'SYNC_HISTORICAL_MEMBERS',
        entityName: 'HistoricalMigration',
        reason: 'Synchronized 35 sorted members from workbook.',
        afterState: { totalMembers: memberData.length, createdCount, updatedCount },
      });
    }

    return {
      dryRun,
      scope: 'Step 1: Members',
      totalMembers: memberData.length,
      createdCount,
      updatedCount,
      status: 'SUCCESS',
      message: dryRun
        ? `প্রিভিউ: ৩৫ জন সদস্যের প্রোফাইল (যোগদানের তারিখ ও প্রারম্ভিক শেয়ার) প্রস্তুত রয়েছে।`
        : `সফলভাবে ৩৫ জন সদস্য প্রোফাইল ডাটাবেজে সিঙ্ক সম্পন্ন হয়েছে।`,
    };
  }

  /**
   * Step 2: Synchronize 2024 Historical Data (35 Members, 12 Months Payments, Ledgers, Custody)
   */
  static async sync2024(dryRun = false, actor: any, force = false) {
    const excelPath = getDocsPath('updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Workbook file not found at ${excelPath}`);
    }

    const start2024 = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
    const end2024 = new Date(Date.UTC(2024, 11, 31, 23, 59, 59, 999));
    const existing2024Count = await Payment.countDocuments({
      paymentDate: { $gte: start2024, $lte: end2024 },
      status: { $ne: PaymentStatus.CANCELLED },
    });

    if (!dryRun && !force && existing2024Count >= 304) {
      const existingPayments = await Payment.find({
        paymentDate: { $gte: start2024, $lte: end2024 },
        status: { $ne: PaymentStatus.CANCELLED },
      }).lean();
      const existingSum = existingPayments.reduce((s, p) => s + (p.totalAmount || 0), 0);
      return {
        alreadySynced: true,
        scope: 'Step 2: 2024 Historical Data',
        count: existing2024Count,
        totalAmount: existingSum,
        message: `২০২৪ সালের কিস্তি ডাটা ইতিমধ্যেই ডাটাবেজে সম্পূর্ণভাবে সংরক্ষিত রয়েছে (${existing2024Count}টি পেমেন্ট, ৳${existingSum.toLocaleString()})। ডুপ্লিকেশন প্রতিরোধে পুনরায় সরাসরি ইমপোর্ট ব্লক করা হয়েছে।`,
      };
    }

    if (!dryRun && force) {
      await this.purge2024(actor);
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
    } = await this.ensureCoreActorsAndCustody(actor);

    const wb = XLSX.readFile(excelPath);

    // 1. Members
    const membersSheet = wb.Sheets['Sorted Members'];
    const memberRows = XLSX.utils.sheet_to_json(membersSheet, { header: 1 }) as any[][];
    const memberData = memberRows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));
    const memberIdMap = new Map<string, any>();

    for (const r of memberData) {
      const code = String(r[0]).trim();
      const isDropped = code === 'NSF007' || code === 'NSF032';
      let m = await Member.findOne({ memberId: code });
      if (!m && !dryRun) {
        const rawName = String(r[1] || code).trim();
        const cleanName = rawName.replace(/\s*-[A-Za-z0-9.\s]+$/, '').trim();
        m = await Member.create({
          memberId: code,
          name: cleanName,
          phone: String(r[3] || '01700000000').trim(),
          email: `${code.toLowerCase()}@nsfoundation.org`,
          status: isDropped ? MemberStatus.DROPPED : MemberStatus.ACTIVE,
          joinDate: new Date('2024-01-01'),
          cashoutDue: 0,
        });
      } else if (m && !dryRun) {
        m.status = isDropped ? MemberStatus.DROPPED : MemberStatus.ACTIVE;
        await m.save();
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
      // Process departed member exit settlements & bKash custody deductions
      // NSF032 (Ahsan Ul Tanvir): ৳1,802 on 11/01/2026 via bKash
      const m32 = memberIdMap.get('NSF032') || (await Member.findOne({ memberId: 'NSF032' }));
      if (m32) {
        let mov32 = await CustodyMovement.findOne({
          custodyAccountId: moinBkashCustody._id,
          amount: 1802,
          sourceType: MovementSourceType.FINAL_DISTRIBUTION,
        });
        if (!mov32) {
          mov32 = await CustodyMovement.create({
            custodyAccountId: moinBkashCustody._id,
            date: new Date('2026-01-11'),
            amount: 1802,
            movementType: MovementType.OUT,
            sourceType: MovementSourceType.FINAL_DISTRIBUTION,
            description: 'Member Exit Refund for Ahsan Ul Tanvir (NSF032) via bKash by Accountant Moin Uddin',
            performedBy: moinUser._id,
          });
        }

        let exit32 = await MemberExitSettlement.findOne({ memberId: m32._id });
        if (!exit32) {
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
        }
      }

      // NSF007 (Bayzid Hasan): ৳1,000 on 15/01/2026 via bKash
      const m7 = memberIdMap.get('NSF007') || (await Member.findOne({ memberId: 'NSF007' }));
      if (m7) {
        let mov7 = await CustodyMovement.findOne({
          custodyAccountId: moinBkashCustody._id,
          amount: 1000,
          sourceType: MovementSourceType.FINAL_DISTRIBUTION,
        });
        if (!mov7) {
          mov7 = await CustodyMovement.create({
            custodyAccountId: moinBkashCustody._id,
            date: new Date('2026-01-15'),
            amount: 1000,
            movementType: MovementType.OUT,
            sourceType: MovementSourceType.FINAL_DISTRIBUTION,
            description: 'Member Exit Refund for Bayzid Hasan (NSF007) via bKash by Accountant Moin Uddin',
            performedBy: moinUser._id,
          });
        }

        let exit7 = await MemberExitSettlement.findOne({ memberId: m7._id });
        if (!exit7) {
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
        }
      }

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
   * Step 3: Synchronize 2025 Historical Staged Months (Jan, Feb, Mar, Apr 2025)
   */
  static async sync2025(dryRun = false, actor: any, force = false) {
    const start2025 = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    const end2025 = new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999));
    const existing2025Count = await Payment.countDocuments({
      paymentDate: { $gte: start2025, $lte: end2025 },
      status: { $ne: PaymentStatus.CANCELLED },
    });

    if (!dryRun && !force && existing2025Count >= 60) {
      const existingPayments = await Payment.find({
        paymentDate: { $gte: start2025, $lte: end2025 },
        status: { $ne: PaymentStatus.CANCELLED },
      }).lean();
      const existingSum = existingPayments.reduce((s, p) => s + (p.totalAmount || 0), 0);
      return {
        alreadySynced: true,
        scope: 'Step 3: 2025 Staged Months',
        count: existing2025Count,
        totalAmount: existingSum,
        message: `২০২৫ সালের কিস্তি ডাটা ইতিমধ্যেই ডাটাবেজে সংরক্ষিত রয়েছে (${existing2025Count}টি পেমেন্ট, ৳${existingSum.toLocaleString()})। ডুপ্লিকেশন প্রতিরোধে পুনরায় সরাসরি ইমপোর্ট ব্লক করা হয়েছে।`,
      };
    }

    if (!dryRun && force) {
      await this.purge2025(actor);
    }

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
   * Step 4: Synchronize Historical Expenses (Operational Vouchers)
   */
  static async syncExpenses(dryRun = false, actor: any, force = false) {
    const existingExpCount = await Expense.countDocuments({ expenseNumber: { $regex: '^EXP-2024-' } });
    if (!dryRun && !force && existingExpCount >= 5) {
      const exps = await Expense.find({ expenseNumber: { $regex: '^EXP-2024-' } }).lean();
      const sum = exps.reduce((s, e) => s + (e.amount || 0), 0);
      return {
        alreadySynced: true,
        scope: 'Step 4: Historical Expenses',
        count: existingExpCount,
        totalAmount: sum,
        message: `ঐতিহাসিক পরিচালন ব্যয় ভাউচার ইতিমধ্যেই সংরক্ষিত রয়েছে (${existingExpCount}টি ভাউচার, ৳${sum.toLocaleString()})। ডুপ্লিকেশন প্রতিরোধে পুনরায় সরাসরি ইমপোর্ট ব্লক করা হয়েছে।`,
      };
    }

    if (!dryRun && force) {
      await this.purgeExpenses(actor);
    }

    const excelPath = getDocsPath('updated-payments-files/Updated-NS FOUNDATION 2024.xlsx');
    if (!fs.existsSync(excelPath)) {
      throw new Error(`Workbook file not found at ${excelPath}`);
    }

    const { moinUser, moinBkashCustody } = await this.ensureCoreActorsAndCustody(actor);
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
   * Step 5: Synchronize Historical Investments & Project Returns
   * Reads authoritative docs/updated-payments-files/NS Foundation Investments.xlsx
   */
  static async syncInvestments(dryRun = false, actor: any, force = false) {
    const existingProjectsCount = await InvestmentProject.countDocuments();
    if (!dryRun && !force && existingProjectsCount >= 20) {
      const projs = await InvestmentProject.find().lean();
      const sum = projs.reduce((s, p) => s + (p.totalFunded || 0), 0);
      return {
        alreadySynced: true,
        scope: 'Step 5: Historical Investments',
        count: existingProjectsCount,
        totalAmount: sum,
        message: `ঐতিহাসিক বিনিয়োগ প্রকল্প ইতিমধ্যেই সংরক্ষিত রয়েছে (${existingProjectsCount}টি প্রকল্প, ৳${sum.toLocaleString()})। ডুপ্লিকেশন প্রতিরোধে পুনরায় সরাসরি ইমপোর্ট ব্লক করা হয়েছে।`,
      };
    }

    if (!dryRun && force) {
      await this.purgeInvestments(actor);
    }

    return InvestmentService.syncAuthoritativeInvestments(dryRun, actor);
  }

  /**
   * ─── PURGE OPERATIONS (SAFE DATA DELETION TO PREVENT DUPLICATION) ───
   */
  static async purgeMembers(actor: any) {
    const paymentCount = await Payment.countDocuments();
    if (paymentCount > 0) {
      throw new Error(`পেমেন্ট রেকর্ড (${paymentCount}টি) বিদ্যমান থাকা অবস্থায় সদস্যদের মুছে ফেলা যাবে না। অনুগ্রহ করে প্রথমে পেমেন্ট ডাটা পার্জ (Purge) করুন।`);
    }

    const membersCount = await Member.countDocuments();
    await ShareHistory.deleteMany({});
    await Member.deleteMany({});

    await AuditLog.create({
      performedBy: actor._id,
      action: 'PURGE_HISTORICAL_MEMBERS',
      entityName: 'HistoricalMigration',
      reason: `Purged ${membersCount} members safely.`,
      afterState: { purgedMembersCount: membersCount },
    });

    return {
      status: 'SUCCESS',
      purgedMembersCount: membersCount,
      message: `${membersCount} জন সদস্য সফলভাবে ডাটাবেজ থেকে মুছে ফেলা হয়েছে।`,
    };
  }

  static async purge2024(actor: any) {
    const start2024 = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
    const end2024 = new Date(Date.UTC(2024, 11, 31, 23, 59, 59, 999));

    const payments = await Payment.find({
      paymentDate: { $gte: start2024, $lte: end2024 },
    }).lean();
    const paymentIds = payments.map((p) => p._id);

    await PaymentAllocation.deleteMany({ paymentId: { $in: paymentIds } });
    await CustodyMovement.deleteMany({ sourceRefId: { $in: paymentIds } });
    await MonthlyLedger.deleteMany({ month: { $regex: '^2024-' } });
    await Payment.deleteMany({ _id: { $in: paymentIds } });

    // Departed member settlements and movements
    const exitSettlements = await MemberExitSettlement.find().lean();
    const exitIds = exitSettlements.map((e) => e._id);
    await CustodyMovement.deleteMany({
      $or: [
        { sourceRefId: { $in: exitIds } },
        { description: { $regex: 'Member Exit Refund for (Bayzid|Tanvir|Ahsan Ul Tanvir)' } },
      ],
    });
    await MemberExitSettlement.deleteMany({});

    await this.rebalanceAllCustody();

    await AuditLog.create({
      performedBy: actor._id,
      action: 'PURGE_HISTORICAL_2024',
      entityName: 'HistoricalMigration',
      reason: `Purged 2024 historical records: ${paymentIds.length} payments, allocations, ledgers, and exit settlements removed safely.`,
      afterState: { purgedPaymentsCount: paymentIds.length },
    });

    return {
      status: 'SUCCESS',
      purgedPaymentsCount: paymentIds.length,
      message: `২০২৪ সালের ${paymentIds.length}টি পেমেন্ট, লেজার ও সংশ্লিষ্ট রেকর্ডসমূহ সফলভাবে মুছে ফেলা হয়েছে এবং কাস্টডি রিব্যালেন্স করা হয়েছে।`,
    };
  }

  static async purge2025(actor: any) {
    const start2025 = new Date(Date.UTC(2025, 0, 1, 0, 0, 0));
    const end2025 = new Date(Date.UTC(2025, 11, 31, 23, 59, 59, 999));

    const payments = await Payment.find({
      paymentDate: { $gte: start2025, $lte: end2025 },
    }).lean();
    const paymentIds = payments.map((p) => p._id);

    await PaymentAllocation.deleteMany({ paymentId: { $in: paymentIds } });
    await CustodyMovement.deleteMany({ sourceRefId: { $in: paymentIds } });
    await MonthlyLedger.deleteMany({ month: { $regex: '^2025-(01|02|03|04)' } });
    await Payment.deleteMany({ _id: { $in: paymentIds } });

    await this.rebalanceAllCustody();

    await AuditLog.create({
      performedBy: actor._id,
      action: 'PURGE_HISTORICAL_2025',
      entityName: 'HistoricalMigration',
      reason: `Purged 2025 historical staged records: ${paymentIds.length} payments removed safely.`,
      afterState: { purgedPaymentsCount: paymentIds.length },
    });

    return {
      status: 'SUCCESS',
      purgedPaymentsCount: paymentIds.length,
      message: `২০২৫ সালের ${paymentIds.length}টি পেমেন্ট, লেজার ও সংশ্লিষ্ট রেকর্ডসমূহ সফলভাবে মুছে ফেলা হয়েছে এবং কাস্টডি রিব্যালেন্স করা হয়েছে।`,
    };
  }

  static async purgeExpenses(actor: any) {
    const expenses = await Expense.find({ expenseNumber: { $regex: '^EXP-2024-' } }).lean();
    const expIds = expenses.map((e) => e._id);

    await CustodyMovement.deleteMany({ sourceRefId: { $in: expIds } });
    await Expense.deleteMany({ _id: { $in: expIds } });

    await this.rebalanceAllCustody();

    await AuditLog.create({
      performedBy: actor._id,
      action: 'PURGE_HISTORICAL_EXPENSES',
      entityName: 'HistoricalMigration',
      reason: `Purged ${expIds.length} historical operational expense vouchers.`,
      afterState: { purgedExpensesCount: expIds.length },
    });

    return {
      status: 'SUCCESS',
      purgedExpensesCount: expIds.length,
      message: `${expIds.length}টি ঐতিহাসিক ব্যয় ভাউচার সফলভাবে মুছে ফেলা হয়েছে এবং কাস্টডি রিব্যালেন্স করা হয়েছে।`,
    };
  }

  static async purgeInvestments(actor: any) {
    const projects = await InvestmentProject.find().lean();
    const projIds = projects.map((p) => p._id);

    const returns = await InvestmentReturn.find({ projectId: { $in: projIds } }).lean();
    const returnIds = returns.map((r) => r._id);

    await CustodyMovement.deleteMany({
      $or: [
        { sourceRefId: { $in: projIds } },
        { sourceRefId: { $in: returnIds } },
        { sourceType: { $in: [MovementSourceType.INVESTMENT_FUNDING, MovementSourceType.INVESTMENT_RETURN] } },
      ],
    });

    await InvestmentReturn.deleteMany({ _id: { $in: returnIds } });
    await InvestmentProject.deleteMany({ _id: { $in: projIds } });

    await CustodyAccount.updateMany(
      { accountType: AccountType.EXTERNAL_WALLET },
      { $set: { cachedBalance: 0 } }
    );

    await this.rebalanceAllCustody();

    await AuditLog.create({
      performedBy: actor._id,
      action: 'PURGE_HISTORICAL_INVESTMENTS',
      entityName: 'HistoricalMigration',
      reason: `Purged ${projIds.length} historical investment projects and returns.`,
      afterState: { purgedProjectsCount: projIds.length },
    });

    return {
      status: 'SUCCESS',
      purgedProjectsCount: projIds.length,
      message: `${projIds.length}টি ঐতিহাসিক বিনিয়োগ প্রকল্প ও রিটার্ন সফলভাবে মুছে ফেলা হয়েছে এবং ওয়ালেট রিব্যালেন্স করা হয়েছে।`,
    };
  }

  /**
   * ─── AUDIT TRAIL / SYNC HISTORY ───
   */
  static async getHistory() {
    const logs = await AuditLog.find({
      action: { $regex: '^(SYNC_HISTORICAL_|PURGE_HISTORICAL_|TOGGLE_HISTORICAL_)' },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('performedBy', 'name email role')
      .lean();

    return logs.map((log) => ({
      id: log._id,
      action: log.action,
      performedBy: (log.performedBy as any)?.name || 'System Admin',
      reason: log.reason,
      createdAt: log.createdAt,
      details: log.afterState || {},
    }));
  }

  /**
   * ─── MODULE VISIBILITY SETTINGS ───
   */
  static async getModuleVisibility() {
    const config = await SystemConfig.findOne({ key: 'HISTORICAL_MIGRATION_ENABLED' }).lean();
    return {
      enabled: config ? Boolean(config.value) : true,
    };
  }

  static async setModuleVisibility(enabled: boolean, actor: any) {
    const before = await SystemConfig.findOne({ key: 'HISTORICAL_MIGRATION_ENABLED' }).lean();
    const config = await SystemConfig.findOneAndUpdate(
      { key: 'HISTORICAL_MIGRATION_ENABLED' },
      {
        value: enabled,
        description: 'Global visibility toggle for the Historical Migration & Database Sync module.',
        updatedBy: actor._id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await AuditLog.create({
      performedBy: actor._id,
      action: 'TOGGLE_HISTORICAL_MIGRATION_MODULE',
      entityName: 'SystemConfig',
      entityId: config._id,
      beforeState: before || null,
      afterState: { enabled },
      reason: enabled
        ? 'Historical Migration module enabled and made visible.'
        : 'Historical Migration module marked complete and hidden from navigation.',
    });

    return {
      enabled,
      message: enabled
        ? 'হিস্টোরিক্যাল মাইগ্রেশন মডিউল সফলভাবে সক্রিয় করা হয়েছে।'
        : 'হিস্টোরিক্যাল মাইগ্রেশন মডিউল সফলভাবে নিষ্ক্রিয়/লুকানো হয়েছে।',
    };
  }
}

