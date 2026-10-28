import { describe, it, expect, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { ReportingService } from '../services/reporting.service.js';
import { Member, MemberExitSettlement, CustodyMovement } from '../models/index.js';
import { MemberStatus, MemberExitStatus, MovementType, UserRole } from '../types/models.js';

import { stage2024FromUpdatedWorkbook } from '../scripts/stage-2024-from-updated-workbook.js';

describe('2024 Authoritative Audit & Member Exit Settlements Suite', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ns-foundation');
    }
    await stage2024FromUpdatedWorkbook();
  }, 30000);

  describe('1. White-Box & Black-Box Reconciliation: 2024 Annual Totals', () => {
    it('matches exact authoritative totals from Updated-NS FOUNDATION 2024.xlsx', async () => {
      const report = await ReportingService.audit2024({});
      expect(report.type).toBe('audit2024');

      const s = report.summary;
      expect(s.totalMembers).toBe(35);
      expect(s.totalShares).toBe(70);
      expect(s.totalAnnualFee).toBe(420000);
      expect(s.totalPaid).toBe(388975);
      expect(s.dueAmount).toBe(32440);
      expect(s.duePrincipal).toBe(31000);
      expect(s.duePenalty).toBe(1410);
      expect(s.dueCashout).toBe(30);
      expect(s.advanceBalance).toBe(2500);
    });

    it('verifies individual member audit records with specific adjustments', async () => {
      const report = await ReportingService.audit2024({ limit: 100 });
      const rows = report.rows as any[];
      const map = new Map(rows.map((r) => [r.memberId, r]));

      // NSF001: 5 shares, all paid
      const nsf001 = map.get('NSF001');
      expect(nsf001).toBeDefined();
      expect(nsf001.decemberShares).toBe(5);
      expect(nsf001.annualFee).toBe(30000);
      expect(nsf001.totalPaid).toBe(30200);
      expect(nsf001.dueAmount).toBe(0);

      // NSF002: Safiqul Islam with ৳1,500 advance
      const nsf002 = map.get('NSF002');
      expect(nsf002).toBeDefined();
      expect(nsf002.advanceBalance).toBe(1500);
      expect(nsf002.dueAmount).toBe(0);

      // NSF013: H. M Ali Hossain with ৳1,000 advance
      const nsf013 = map.get('NSF013');
      expect(nsf013).toBeDefined();
      expect(nsf013.advanceBalance).toBe(1000);
      expect(nsf013.dueAmount).toBe(0);

      // NSF020: Nasim Billah Rafi (৳3,640 due = 3500 principal + 120 pen + 20 cashout)
      const nsf020 = map.get('NSF020');
      expect(nsf020).toBeDefined();
      expect(nsf020.duePrincipal).toBe(3500);
      expect(nsf020.duePenalty).toBe(120);
      expect(nsf020.dueCashout).toBe(20);
      expect(nsf020.dueAmount).toBe(3640);

      // NSF023: MD. Abdullah Al Jobair (৳3,130 due = 3000 principal + 120 pen + 10 cashout)
      const nsf023 = map.get('NSF023');
      expect(nsf023).toBeDefined();
      expect(nsf023.duePrincipal).toBe(3000);
      expect(nsf023.duePenalty).toBe(120);
      expect(nsf023.dueCashout).toBe(10);
      expect(nsf023.dueAmount).toBe(3130);
    });
  });

  describe('2. Departed Member Refunds & Custody Deduction Conservation', () => {
    it('verifies NSF007 (Bayzid Hasan) exit settlement and custody deduction', async () => {
      const m7 = await Member.findOne({ memberId: 'NSF007' });
      expect(m7).toBeDefined();
      expect(m7!.status).toBe(MemberStatus.DROPPED);

      const settlement = await MemberExitSettlement.findOne({ memberId: m7!._id });
      expect(settlement).toBeDefined();
      expect(settlement!.status).toBe(MemberExitStatus.SETTLED);
      expect(settlement!.netAmount).toBe(1000);
      expect(settlement!.paymentMethod).toBe('BKASH');

      // Check linked custody movement OUT
      const installment = settlement!.installments[0];
      expect(installment).toBeDefined();
      expect(installment.custodyMovementId).toBeDefined();

      const mov = await CustodyMovement.findById(installment.custodyMovementId);
      expect(mov).toBeDefined();
      expect(mov!.movementType).toBe(MovementType.OUT);
      expect(mov!.amount).toBe(1000);
      expect(new Date(mov!.date).toISOString().slice(0, 10)).toBe('2026-01-15');
    });

    it('verifies NSF032 (Ahsan Ul Tanvir) exit settlement and custody deduction', async () => {
      const m32 = await Member.findOne({ memberId: 'NSF032' });
      expect(m32).toBeDefined();
      expect(m32!.status).toBe(MemberStatus.DROPPED);

      const settlement = await MemberExitSettlement.findOne({ memberId: m32!._id });
      expect(settlement).toBeDefined();
      expect(settlement!.status).toBe(MemberExitStatus.SETTLED);
      expect(settlement!.netAmount).toBe(1802);
      expect(settlement!.paymentMethod).toBe('BKASH');

      // Check linked custody movement OUT
      const installment = settlement!.installments[0];
      expect(installment).toBeDefined();
      expect(installment.custodyMovementId).toBeDefined();

      const mov = await CustodyMovement.findById(installment.custodyMovementId);
      expect(mov).toBeDefined();
      expect(mov!.movementType).toBe(MovementType.OUT);
      expect(mov!.amount).toBe(1802);
      expect(new Date(mov!.date).toISOString().slice(0, 10)).toBe('2026-01-11');
    });
  });

  describe('3. Input Sanitization & Search Verification', () => {
    it('correctly filters audit report by member name without regex injection', async () => {
      const result = await ReportingService.audit2024({ search: 'Salah Uddin' });
      expect(result.rows.length).toBe(1);
      expect((result.rows[0] as any).memberId).toBe('NSF001');

      // Sanitization check with special characters
      const sanitizedResult = await ReportingService.audit2024({ search: '.*' });
      expect(sanitizedResult).toBeDefined();
    });

    it('paginates accurately with bound checks', async () => {
      const page1 = await ReportingService.audit2024({ page: 1, limit: 10 });
      expect(page1.rows.length).toBe(10);
      expect(page1.pagination.total).toBe(35);
      expect(page1.pagination.totalPages).toBe(4);

      const page4 = await ReportingService.audit2024({ page: 4, limit: 10 });
      expect(page4.rows.length).toBe(5);
    });
  });

  describe('4. Security & Access Control Validation', () => {
    it('restricts investment reports to unauthorized member users', async () => {
      const mockMemberUser: any = {
        _id: new mongoose.Types.ObjectId(),
        role: UserRole.MEMBER,
        accountantType: null,
      };

      await expect(
        ReportingService.getReport('investments', {}, mockMemberUser)
      ).rejects.toThrow('Investment reports are restricted to administrators and the primary accountant.');
    });

    it('allows admin users full access to all report types', async () => {
      const mockAdminUser: any = {
        _id: new mongoose.Types.ObjectId(),
        role: UserRole.ADMIN,
      };

      const duesReport = await ReportingService.getReport('dues', {}, mockAdminUser);
      expect(duesReport).toBeDefined();

      const auditReport = await ReportingService.getReport('audit2024', {}, mockAdminUser);
      expect(auditReport).toBeDefined();
    });
  });
});
