import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { createTestUser, createTestMember, TestAuthContext } from './setup/fixtures.js';
import { UserRole, ShareEventType, PaymentMethod, PaymentStatus } from '../types/models.js';
import { ShareHistory } from '../models/ShareHistory.js';
import { AuditLog } from '../models/AuditLog.js';

import { MonthlyLedger } from '../models/MonthlyLedger.js';
import { MemberYearAccount } from '../models/MemberYearAccount.js';
import { Payment } from '../models/Payment.js';

describe('Share Rules & Post-2024 Lock Enforcement Integration Tests', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let admin: TestAuthContext;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    admin = await createTestUser('admin.shares@nsfoundation.org', UserRole.ADMIN, null, 'Society Admin');
  });

  it('1. Post-2024 Lock: Modifying share count with effective date >= 2025-01 is rejected with 400', async () => {
    const member = await createTestMember('NS-SHARE-LOCK', 'Locked Member', 2);

    const res = await request(app)
      .post('/api/shares/change')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        memberId: member._id,
        effectiveMonth: '2025-01',
        shareCount: 4,
        eventType: ShareEventType.TEMPORARY_CHANGE,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('January 2025');
  });

  it('2. Pre-2025 Adjustment: Historical 2024 share changes are permitted with audit logging', async () => {
    const member = await createTestMember('NS-SHARE-HIST', 'Historical Member', 2);

    const res = await request(app)
      .post('/api/shares/change')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        memberId: member._id,
        effectiveMonth: '2024-06',
        shareCount: 3,
        eventType: ShareEventType.TEMPORARY_CHANGE,
        notes: 'Pre-2025 historical adjustment',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.shareCount).toBe(3);

    // Verify audit log entry
    const audit = await AuditLog.findOne({
      entityId: res.body.data._id,
      action: 'RECORD_SHARE_CHANGE',
    });
    expect(audit).toBeTruthy();
  });

  it('3. Peer-to-Peer Share Transfer: Transferring 1 share decreases seller and increases buyer with audit trail', async () => {
    const seller = await createTestMember('NS-SHARE-SELLER', 'Seller Member', 3);
    const buyer = await createTestMember('NS-SHARE-BUYER', 'Buyer Member', 1);

    const res = await request(app)
      .post('/api/shares/transfer')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        fromMemberId: seller._id,
        toMemberId: buyer._id,
        shareCount: 1,
        effectiveMonth: '2025-02',
        notes: 'Mutual peer-to-peer share sale',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Check seller current shares
    const sellerHistory = await ShareHistory.find({ memberId: seller._id }).sort({ effectiveMonth: -1, createdAt: -1 });
    expect(sellerHistory[0].shareCount).toBe(2); // 3 - 1 = 2

    // Check buyer current shares
    const buyerHistory = await ShareHistory.find({ memberId: buyer._id }).sort({ effectiveMonth: -1, createdAt: -1 });
    expect(buyerHistory[0].shareCount).toBe(2); // 1 + 1 = 2
  });

  it('4. Historical Months Preservation & Dec 2024 Final Obligation / Advance calculation', async () => {
    // Member starts with 4 shares in 2024-01
    const member = await createTestMember('NS-SHARE-ADV', 'Advance Member', 4);
    const dummyCustodyId = new mongoose.Types.ObjectId();

    const runId = Date.now();
    // Seed Jan - Apr (months 1-4) with 4 shares (2000 BDT due, 2000 BDT paid)
    for (let m = 1; m <= 4; m++) {
      const monthStr = `2024-${String(m).padStart(2, '0')}`;
      await MonthlyLedger.create({
        memberId: member._id,
        month: monthStr,
        shareCount: 4,
        principalDue: 2000,
        principalPaid: 2000,
        penaltyDue: 0,
        penaltyPaid: 0,
        cashoutDue: 0,
        cashoutPaid: 0,
        status: 'PAID',
      });
      await Payment.create({
        memberId: member._id,
        receiverId: admin.user._id,
        receiptNumber: `RCP-${runId}-${m}`,
        paymentDate: new Date(`2024-${String(m).padStart(2, '0')}-15`),
        principalAmount: 2000,
        totalAmount: 2000,
        paymentMethod: PaymentMethod.CASH,
        custodyAccountId: dummyCustodyId,
        status: PaymentStatus.VERIFIED,
      });
    }

    // Seed May - Dec (months 5-12) with initial placeholder ledgers
    for (let m = 5; m <= 12; m++) {
      const monthStr = `2024-${String(m).padStart(2, '0')}`;
      await MonthlyLedger.create({
        memberId: member._id,
        month: monthStr,
        shareCount: 4,
        principalDue: 2000,
        principalPaid: 0,
        penaltyDue: 0,
        penaltyPaid: 0,
        cashoutDue: 0,
        cashoutPaid: 0,
        status: 'DUE',
      });
    }

    // In May 2024 (2024-05), member reduces shares to 3
    const changeRes = await request(app)
      .post('/api/shares/change')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        memberId: member._id,
        effectiveMonth: '2024-05',
        shareCount: 3,
        eventType: ShareEventType.TEMPORARY_CHANGE,
        notes: 'Reduced to 3 shares starting May 2024',
      });

    expect(changeRes.status).toBe(201);

    // Member pays 1500 BDT/month for May to Dec (8 months × 1500 = 12,000 BDT)
    for (let m = 5; m <= 12; m++) {
      const monthStr = `2024-${String(m).padStart(2, '0')}`;
      await Payment.create({
        memberId: member._id,
        receiverId: admin.user._id,
        receiptNumber: `RCP-${runId}-${m}`,
        paymentDate: new Date(`2024-${String(m).padStart(2, '0')}-15`),
        principalAmount: 1500,
        totalAmount: 1500,
        paymentMethod: PaymentMethod.CASH,
        custodyAccountId: dummyCustodyId,
        status: PaymentStatus.VERIFIED,
      });
      await MonthlyLedger.updateOne(
        { memberId: member._id, month: monthStr },
        { $set: { principalPaid: 1500, status: 'PAID' } }
      );
    }

    // Reconcile 2024
    const recRes = await request(app)
      .post('/api/shares/reconcile-year')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        memberId: member._id,
        year: 2024,
      });

    expect(recRes.status).toBe(200);

    // CRITICAL ASSERTION 1: Jan - Apr months MUST retain 4 shares and 2000 BDT due (NOT updated to 3!)
    for (let m = 1; m <= 4; m++) {
      const monthStr = `2024-${String(m).padStart(2, '0')}`;
      const ledger = await MonthlyLedger.findOne({ memberId: member._id, month: monthStr });
      expect(ledger).toBeTruthy();
      expect(ledger?.shareCount).toBe(4);
      expect(ledger?.principalDue).toBe(2000);
      expect(ledger?.principalPaid).toBe(2000);
    }

    // CRITICAL ASSERTION 2: May - Dec months have 3 shares and 1500 BDT due
    for (let m = 5; m <= 12; m++) {
      const monthStr = `2024-${String(m).padStart(2, '0')}`;
      const ledger = await MonthlyLedger.findOne({ memberId: member._id, month: monthStr });
      expect(ledger).toBeTruthy();
      expect(ledger?.shareCount).toBe(3);
      expect(ledger?.principalDue).toBe(1500);
    }

    // CRITICAL ASSERTION 3: Annual Account for 2024
    // Final Shares = 3
    // Annual Obligation = 3 × 500 × 12 = 18,000 BDT
    // Total Principal Paid = (4 × 2000) + (8 × 1500) = 8,000 + 12,000 = 20,000 BDT
    // Excess Advance = 20,000 - 18,000 = 2,000 BDT
    // Shortfall = 0
    const yearAcc = await MemberYearAccount.findOne({ memberId: member._id, year: 2024 });
    expect(yearAcc).toBeTruthy();
    expect(yearAcc?.finalShares).toBe(3);
    expect(yearAcc?.annualObligation).toBe(18000);
    expect(yearAcc?.totalPrincipalPaid).toBe(20000);
    expect(yearAcc?.shortfall).toBe(0);
    expect(yearAcc?.excessAdvance).toBe(2000);
    expect(yearAcc?.isSettled).toBe(true);
  });
});
