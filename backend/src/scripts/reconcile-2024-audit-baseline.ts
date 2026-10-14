import mongoose from 'mongoose';
import { Member } from '../models/Member.js';
import { MonthlyLedger } from '../models/MonthlyLedger.js';
import { MemberYearAccount } from '../models/MemberYearAccount.js';
import { ShareHistory } from '../models/ShareHistory.js';
import { MonthlyLedgerStatus, MemberStatus, ShareEventType } from '../types/models.js';

interface AuditMemberBaseline {
  code: string;
  decShares: number;
  annualFee: number;
  totalPaid: number;
  totalPenaltyPaid: number;
  dueAmount: number;
  duesMonths: number;
  adv: number;
  dueDetails?: {
    dueMonths: string[]; // ['2024-11', '2024-12']
    principalDuePerMonth: number;
    penaltyDueTotal: number;
    cashoutDue?: number;
  };
  penaltyOnlyDue?: number;
  droppedAfterMonth?: string; // '2024-03'
  remarks: string;
}

const AUDIT_2024_DATA: Record<string, AuditMemberBaseline> = {
  NSF001: { code: 'NSF001', decShares: 5, annualFee: 30000, totalPaid: 30200, totalPenaltyPaid: 200, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF002: { code: 'NSF002', decShares: 3, annualFee: 18000, totalPaid: 19560, totalPenaltyPaid: 60, dueAmount: 0, duesMonths: 0, adv: 1500, remarks: 'No. of Share adjusted with 3 share. All Paid. January 25 advance 1500 tk.' },
  NSF003: { code: 'NSF003', decShares: 2, annualFee: 12000, totalPaid: 13500, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF004: { code: 'NSF004', decShares: 4, annualFee: 24000, totalPaid: 24000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF005: { code: 'NSF005', decShares: 2, annualFee: 12000, totalPaid: 12070, totalPenaltyPaid: 70, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF006: { code: 'NSF006', decShares: 1, annualFee: 6000, totalPaid: 6030, totalPenaltyPaid: 30, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Paid penalty 10 tk. All Paid' },
  NSF007: { code: 'NSF007', decShares: 1, annualFee: 6000, totalPaid: 1500, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, droppedAfterMonth: '2024-03', remarks: 'March porjonto porishodhito (Dropped)' },
  NSF008: { code: 'NSF008', decShares: 1, annualFee: 6000, totalPaid: 6080, totalPenaltyPaid: 80, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF009: { code: 'NSF009', decShares: 2, annualFee: 12000, totalPaid: 12000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF010: { code: 'NSF010', decShares: 1, annualFee: 6000, totalPaid: 6000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All paid' },
  NSF011: { code: 'NSF011', decShares: 2, annualFee: 12000, totalPaid: 12070, totalPenaltyPaid: 70, dueAmount: 10, duesMonths: 0, adv: 0, penaltyOnlyDue: 10, remarks: 'Due 10 tk penalty. Paid 30 tk penalty.' },
  NSF012: { code: 'NSF012', decShares: 2, annualFee: 12000, totalPaid: 10110, totalPenaltyPaid: 80, dueAmount: 2050, duesMonths: 2, adv: 0, dueDetails: { dueMonths: ['2024-11', '2024-12'], principalDuePerMonth: 1000, penaltyDueTotal: 50 }, remarks: 'Due Nov+Dec payment' },
  NSF013: { code: 'NSF013', decShares: 2, annualFee: 12000, totalPaid: 13170, totalPenaltyPaid: 170, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Penalty 40 tk paid. All Paid' },
  NSF014: { code: 'NSF014', decShares: 6, annualFee: 36000, totalPaid: 36120, totalPenaltyPaid: 120, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF015: { code: 'NSF015', decShares: 1, annualFee: 6000, totalPaid: 6100, totalPenaltyPaid: 100, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Penalty July-December 100 tk. All Paid' },
  NSF016: { code: 'NSF016', decShares: 1, annualFee: 6000, totalPaid: 6000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF017: { code: 'NSF017', decShares: 4, annualFee: 24000, totalPaid: 24000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF018: { code: 'NSF018', decShares: 2, annualFee: 12000, totalPaid: 12040, totalPenaltyPaid: 40, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF019: { code: 'NSF019', decShares: 2, annualFee: 12000, totalPaid: 12000, totalPenaltyPaid: 0, dueAmount: 40, duesMonths: 0, adv: 0, penaltyOnlyDue: 40, remarks: 'Due April penalty' },
  NSF020: { code: 'NSF020', decShares: 1, annualFee: 6000, totalPaid: 2525, totalPenaltyPaid: 0, dueAmount: 3640, duesMonths: 7, adv: 0, dueDetails: { dueMonths: ['2024-06', '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'], principalDuePerMonth: 500, penaltyDueTotal: 120, cashoutDue: 20 }, remarks: 'Due June-Dec payment+May cash out charge 20 tk' },
  NSF021: { code: 'NSF021', decShares: 2, annualFee: 12000, totalPaid: 12080, totalPenaltyPaid: 80, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Nov due+ penalty paid. All paid' },
  NSF022: { code: 'NSF022', decShares: 2, annualFee: 12000, totalPaid: 4000, totalPenaltyPaid: 0, dueAmount: 8280, duesMonths: 8, adv: 0, dueDetails: { dueMonths: ['2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'], principalDuePerMonth: 1000, penaltyDueTotal: 280 }, remarks: 'May-Dec payment unpaid' },
  NSF023: { code: 'NSF023', decShares: 1, annualFee: 6000, totalPaid: 6130, totalPenaltyPaid: 130, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'No. of Share adjusted with 1 share. All Paid' },
  NSF024: { code: 'NSF024', decShares: 1, annualFee: 6000, totalPaid: 6060, totalPenaltyPaid: 60, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Nov Penalty fee 20 tk paid. All paid' },
  NSF025: { code: 'NSF025', decShares: 2, annualFee: 12000, totalPaid: 8050, totalPenaltyPaid: 50, dueAmount: 4230, duesMonths: 4, adv: 0, dueDetails: { dueMonths: ['2024-09', '2024-10', '2024-11', '2024-12'], principalDuePerMonth: 1000, penaltyDueTotal: 230 }, remarks: 'Due July, aug penalty+Sept+Oct+Nov+Dec' },
  NSF026: { code: 'NSF026', decShares: 1, annualFee: 6000, totalPaid: 6020, totalPenaltyPaid: 20, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF027: { code: 'NSF027', decShares: 1, annualFee: 6000, totalPaid: 5580, totalPenaltyPaid: 80, dueAmount: 620, duesMonths: 1, adv: 0, dueDetails: { dueMonths: ['2024-12'], principalDuePerMonth: 500, penaltyDueTotal: 120 }, remarks: 'Paid 500 tk. Due 120 tk June - dec penalty. No. of share adjusted with 1 share.' },
  NSF028: { code: 'NSF028', decShares: 2, annualFee: 12000, totalPaid: 12050, totalPenaltyPaid: 50, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Adv paid for Nov & Dec' },
  NSF029: { code: 'NSF029', decShares: 1, annualFee: 6000, totalPaid: 6000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'All Paid' },
  NSF030: { code: 'NSF030', decShares: 2, annualFee: 12000, totalPaid: 12040, totalPenaltyPaid: 40, dueAmount: 40, duesMonths: 0, adv: 0, penaltyOnlyDue: 40, remarks: 'Due Dec Penalty fee 40 tk.' },
  NSF031: { code: 'NSF031', decShares: 1, annualFee: 6000, totalPaid: 6000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Adv paid for Sept-Dec 24.' },
  NSF032: { code: 'NSF032', decShares: 2, annualFee: 12000, totalPaid: 2000, totalPenaltyPaid: 0, dueAmount: 10400, duesMonths: 10, adv: 0, dueDetails: { dueMonths: ['2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12'], principalDuePerMonth: 1000, penaltyDueTotal: 400 }, remarks: 'Due March-Decmber payment' },
  NSF033: { code: 'NSF033', decShares: 2, annualFee: 12000, totalPaid: 12280, totalPenaltyPaid: 280, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Paid Nov & Dec payment with due 100 tk penalties. All Paid' },
  NSF034: { code: 'NSF034', decShares: 4, annualFee: 24000, totalPaid: 24240, totalPenaltyPaid: 240, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Adjusted to 4 shares, all clear' },
  NSF035: { code: 'NSF035', decShares: 1, annualFee: 6000, totalPaid: 6000, totalPenaltyPaid: 0, dueAmount: 0, duesMonths: 0, adv: 0, remarks: 'Joined Oct, paid Jan-Dec at once' },
};

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/ns-foundation');
  console.log('Connected to MongoDB.');

  const months2024 = Array.from({ length: 12 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`);

  for (const [code, baseline] of Object.entries(AUDIT_2024_DATA)) {
    const member = await Member.findOne({ memberId: code });
    if (!member) {
      console.warn(`Member ${code} not found!`);
      continue;
    }

    // 1. If member was dropped (e.g. NSF007)
    if (baseline.droppedAfterMonth) {
      member.status = MemberStatus.DROPPED;
      await member.save();
      // Remove any ledgers after dropped month
      await MonthlyLedger.deleteMany({
        memberId: member._id,
        month: { $gt: baseline.droppedAfterMonth, $lte: '2024-12' },
      });
      // Mark ledgers up to dropped month as paid
      await MonthlyLedger.updateMany(
        { memberId: member._id, month: { $lte: baseline.droppedAfterMonth } },
        {
          $set: {
            principalDue: 500,
            principalPaid: 500,
            penaltyDue: 0,
            penaltyPaid: 0,
            penaltyWaived: 0,
            status: MonthlyLedgerStatus.PAID,
          },
        }
      );
    } else {
      // 2. Member active/regular in 2024
      // Ensure December share count record exists in ShareHistory
      const existingDecShare = await ShareHistory.findOne({
        memberId: member._id,
        effectiveMonth: '2024-12',
      });
      if (!existingDecShare) {
        // Record December baseline share
        await ShareHistory.create({
          memberId: member._id,
          effectiveMonth: '2024-12',
          shareCount: baseline.decShares,
          previousShareCount: baseline.decShares,
          eventType: ShareEventType.ANNUAL_FINALIZATION,
          isAdministrativeOverride: true,
          changedBy: member._id, // or admin
          notes: `2024 December Audited Baseline Shares: ${baseline.decShares}`,
        });
      }

      // Handle cashout charge if any
      if (baseline.dueDetails?.cashoutDue) {
        member.cashoutDue = baseline.dueDetails.cashoutDue;
        await member.save();
      }

      // If member has due months
      if (baseline.dueDetails && baseline.dueDetails.dueMonths.length > 0) {
        const dueMonths = baseline.dueDetails.dueMonths;
        const totalPenalty = baseline.dueDetails.penaltyDueTotal;
        const basePen = Math.floor(totalPenalty / dueMonths.length);
        let remainderPen = totalPenalty - basePen * dueMonths.length;

        for (const m of months2024) {
          const idx = dueMonths.indexOf(m);
          if (idx !== -1) {
            // Unpaid month
            const penThisMonth = basePen + (remainderPen > 0 ? 1 : 0);
            if (remainderPen > 0) remainderPen--;

            await MonthlyLedger.findOneAndUpdate(
              { memberId: member._id, month: m },
              {
                $set: {
                  shareCount: baseline.decShares,
                  principalDue: baseline.dueDetails.principalDuePerMonth,
                  principalPaid: 0,
                  penaltyDue: penThisMonth,
                  penaltyPaid: 0,
                  penaltyWaived: 0,
                  status: MonthlyLedgerStatus.DUE,
                },
              },
              { upsert: true }
            );
          } else {
            // Paid month
            await MonthlyLedger.findOneAndUpdate(
              { memberId: member._id, month: m },
              {
                $set: {
                  shareCount: baseline.decShares,
                  principalDue: baseline.decShares * 500,
                  principalPaid: baseline.decShares * 500,
                  penaltyDue: 0,
                  penaltyPaid: 0,
                  penaltyWaived: 0,
                  status: MonthlyLedgerStatus.PAID,
                },
              },
              { upsert: true }
            );
          }
        }
      } else if (baseline.penaltyOnlyDue) {
        // All months principal paid, but has penalty-only due
        for (const m of months2024) {
          const targetMonth = code === 'NSF019' ? '2024-04' : '2024-12';
          const isTargetMonth = m === targetMonth;
          await MonthlyLedger.findOneAndUpdate(
            { memberId: member._id, month: m },
            {
              $set: {
                shareCount: baseline.decShares,
                principalDue: baseline.decShares * 500,
                principalPaid: baseline.decShares * 500,
                penaltyDue: isTargetMonth ? baseline.penaltyOnlyDue : 0,
                penaltyPaid: 0,
                penaltyWaived: 0,
                status: isTargetMonth ? MonthlyLedgerStatus.PARTIAL : MonthlyLedgerStatus.PAID,
              },
            },
            { upsert: true }
          );
        }
      } else {
        // Completely all paid
        for (const m of months2024) {
          await MonthlyLedger.findOneAndUpdate(
            { memberId: member._id, month: m },
            {
              $set: {
                shareCount: baseline.decShares,
                principalDue: baseline.decShares * 500,
                principalPaid: baseline.decShares * 500,
                penaltyDue: 0,
                penaltyPaid: 0,
                penaltyWaived: 0,
                status: MonthlyLedgerStatus.PAID,
              },
            },
            { upsert: true }
          );
        }
      }
    }

    // 3. Update MemberYearAccount for 2024
    const shortfall = baseline.dueDetails ? baseline.dueDetails.dueMonths.length * baseline.dueDetails.principalDuePerMonth : 0;
    const isSettled = shortfall === 0;
    await MemberYearAccount.findOneAndUpdate(
      { memberId: member._id, year: 2024 },
      {
        $set: {
          finalShares: baseline.decShares,
          annualObligation: baseline.annualFee,
          totalPrincipalPaid: baseline.annualFee - shortfall,
          shortfall,
          excessAdvance: baseline.adv,
          isSettled,
          settledAt: isSettled ? new Date('2024-12-31T23:59:59.000Z') : undefined,
          notes: baseline.remarks,
        },
      },
      { upsert: true }
    );
  }

  // Verify resulting totals
  const all2024Ledgers = await MonthlyLedger.find({ month: { $gte: '2024-01', $lte: '2024-12' } }).populate('memberId').lean();
  let totalP = 0;
  let totalPen = 0;
  let dueMonthsCount = 0;
  for (const l of all2024Ledgers) {
    const p = Math.max(0, (l.principalDue || 0) - (l.principalPaid || 0));
    const pen = Math.max(0, (l.penaltyDue || 0) - (l.penaltyPaid || 0) - (l.penaltyWaived || 0));
    totalP += p;
    totalPen += pen;
    if (p > 0) dueMonthsCount++;
  }
  const membersWithCashout = await Member.find({ cashoutDue: { $gt: 0 } }).lean();
  const totalCashout = membersWithCashout.reduce((s, m) => s + (m.cashoutDue || 0), 0);

  console.log('=== 2024 AUDIT RECONCILIATION COMPLETE ===');
  console.log(`Principal Due: ৳${totalP} (Target: ৳28,000, Dues Months: ${dueMonthsCount} [Target: 32])`);
  console.log(`Penalty Due: ৳${totalPen} (Target: ৳1,290)`);
  console.log(`Cashout Due: ৳${totalCashout} (Target: ৳20)`);
  console.log(`Total 2024 Dues: ৳${totalP + totalPen + totalCashout} (Target: ৳29,310)`);

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
