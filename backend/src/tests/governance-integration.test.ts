import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { createTestUser, createTestMember, TestAuthContext } from './setup/fixtures.js';
import { UserRole } from '../types/models.js';
import { AnnualClosing } from '../models/AnnualClosing.js';

describe('Annual Closing & Exit Governance Integration Tests', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let superAdmin: TestAuthContext;
  let admin: TestAuthContext;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    superAdmin = await createTestUser('superadmin.gov@nsfoundation.org', UserRole.SUPER_ADMIN, null, 'Super Admin');
    admin = await createTestUser('admin.gov@nsfoundation.org', UserRole.ADMIN, null, 'Society Admin');
  });

  it('1. Member Exit Eligibility: Member with < 1 year tenure is rejected from exit settlement', async () => {
    // Member joined 3 months ago
    const newJoinDate = new Date();
    newJoinDate.setMonth(newJoinDate.getMonth() - 3);

    const juniorMember = await createTestMember('NS-GOV-JUNIOR', 'Junior Member', 2, newJoinDate);

    const res = await request(app)
      .post('/api/governance/exits')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `idemp_exit1_${Date.now()}`)
      .send({
        memberId: juniorMember._id,
        eligibleAmount: 10000,
        notes: 'Premature exit request',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('first year');
  });

  it('2. Member Exit Deduction Math: 9.99% deduction applied and exactly 4 monthly installment vouchers generated', async () => {
    // Member joined 2 years ago
    const veteranJoinDate = new Date();
    veteranJoinDate.setFullYear(veteranJoinDate.getFullYear() - 2);

    const eligibleMember = await createTestMember('NS-GOV-VETERAN', 'Veteran Member', 2, veteranJoinDate);
    const eligiblePrincipal = 10000;

    const res = await request(app)
      .post('/api/governance/exits')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `idemp_exit2_${Date.now()}`)
      .send({
        memberId: eligibleMember._id,
        eligibleAmount: eligiblePrincipal,
        notes: 'Eligible exit proposal',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const settlement = res.body.data;
    expect(settlement.deductionRate).toBe(9.99);

    // 10000 * 9.99% = 999 BDT deduction
    expect(settlement.deductionAmount).toBe(999);

    // Net refund = 10000 - 999 = 9001 BDT
    expect(settlement.netAmount).toBe(9001);

    // Exactly 4 installments
    expect(settlement.installments.length).toBe(4);

    // Sum of all 4 installments equals netAmount exactly
    const totalInstallments = settlement.installments.reduce((sum: number, inst: any) => sum + inst.amount, 0);
    expect(totalInstallments).toBe(9001);
  });

  it('3. Annual Closing Workflow: Create, review, approve, and lock annual closing for a year', async () => {
    await AnnualClosing.deleteMany({ year: 2025 });

    // Create annual closing for year 2025
    const createRes = await request(app)
      .post('/api/governance/annual')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `idemp_ann_${Date.now()}`)
      .send({
        year: 2025,
        notes: '2025 Year End Closure',
      });

    expect(createRes.status).toBe(201);
    const closingId = createRes.body.data._id;

    // Review
    const reviewRes = await request(app)
      .post(`/api/governance/annual/${closingId}/review`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', `idemp_rev_${Date.now()}`);
    expect(reviewRes.status).toBe(200);

    // Approve
    const approveRes = await request(app)
      .post(`/api/governance/annual/${closingId}/approve`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .set('Idempotency-Key', `idemp_app_${Date.now()}`);
    expect(approveRes.status).toBe(200);

    // Lock
    const lockRes = await request(app)
      .post(`/api/governance/annual/${closingId}/lock`)
      .set('Authorization', `Bearer ${superAdmin.token}`)
      .set('Idempotency-Key', `idemp_lock_${Date.now()}`);
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.data.status).toBe('LOCKED');
  });
});
