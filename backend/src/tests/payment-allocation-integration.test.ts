import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { createTestUser, createTestMember, createTestCustodyAccount, ensureDefaultTestRules, TestAuthContext } from './setup/fixtures.js';
import { UserRole, AccountantType, CustodyChannel, PaymentMethod } from '../types/models.js';
import { MonthlyLedger } from '../models/MonthlyLedger.js';
import { Member } from '../models/Member.js';

describe('Payment & Allocation Engine Integration Tests', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let primaryAccountant: TestAuthContext;
  let testCustody: any;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    primaryAccountant = await createTestUser('moin.integration@nsfoundation.org', UserRole.ACCOUNTANT, AccountantType.PRIMARY, 'Moin Uddin');
    testCustody = await createTestCustodyAccount('Moin Bank Custody', CustodyChannel.BANK, 50000, primaryAccountant.user._id);
    await ensureDefaultTestRules();
  });

  it('1. Exact Payment: Member with 2 shares (1,000 BDT) before 15th settles exact obligation with 0 penalty, 0 advance, 0 arrears', async () => {
    const member = await createTestMember('NS-PAY-EXACT', 'Exact Member', 2);

    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_exact_${Date.now()}`)
      .send({
        memberId: member._id,
        custodyAccountId: testCustody._id,
        totalAmount: 1000,
        paymentDate: '2024-02-10T10:00:00.000Z', // Before 15th
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        cashoutChargePaid: 0,
        transactionReference: `TRX_EXACT_${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.payment.principalAmount).toBe(1000);
    expect(res.body.data.payment.penaltyAmount).toBe(0);
    expect(res.body.data.payment.advanceAmount).toBe(0);

    // Verify monthly ledger was created for 2024-02
    const ledger = await MonthlyLedger.findOne({ memberId: member._id, month: '2024-02' });
    expect(ledger).toBeTruthy();
    expect(ledger?.principalPaid).toBe(1000);
    expect(ledger?.status).toBe('PAID');
  });

  it('2. Arrears Priority: Member with 2 unpaid months paying 3,000 BDT satisfies oldest month first', async () => {
    const member = await createTestMember('NS-PAY-ARREARS', 'Arrears Member', 2);

    // Pay 3,000 BDT in April (covers Feb, Mar, Apr)
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_arr_${Date.now()}`)
      .send({
        memberId: member._id,
        custodyAccountId: testCustody._id,
        totalAmount: 3000,
        paymentDate: '2024-04-10T10:00:00.000Z',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        cashoutChargePaid: 0,
        transactionReference: `TRX_ARR_${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.allocations.length).toBeGreaterThanOrEqual(2);

    // Verify allocations sorted by oldest month first
    const months = res.body.data.allocations.map((a: any) => a.targetMonth);
    for (let i = 1; i < months.length; i++) {
      expect(months[i] >= months[i - 1]).toBe(true);
    }
  });

  it('3. Late Penalty: Payment made on or after the 16th segregates penalty from principal', async () => {
    const member = await createTestMember('NS-PAY-PENALTY', 'Late Member', 2);

    // Member with 2 shares owes 1,000 BDT principal + (2 shares * 40 BDT = 80 BDT penalty) = 1,080 BDT
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_pen_${Date.now()}`)
      .send({
        memberId: member._id,
        custodyAccountId: testCustody._id,
        totalAmount: 1080,
        paymentDate: '2024-05-18T10:00:00.000Z', // After 15th
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        cashoutChargePaid: 0,
        transactionReference: `TRX_PEN_${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.penaltyAmount).toBe(80);
    expect(res.body.data.payment.principalAmount).toBe(1000);
  });

  it('4. Advance Credits: Payment exceeding current obligations rolls excess into advance prepayments', async () => {
    const member = await createTestMember('NS-PAY-ADVANCE', 'Advance Member', 2);

    // Obligation is 1,000 BDT/month. Member pays 3,000 BDT in June.
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_adv_${Date.now()}`)
      .send({
        memberId: member._id,
        custodyAccountId: testCustody._id,
        totalAmount: 3000,
        paymentDate: '2024-06-05T10:00:00.000Z',
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        cashoutChargePaid: 0,
        transactionReference: `TRX_ADV_${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.principalAmount).toBe(1000);
    expect(res.body.data.payment.advanceAmount).toBe(2000);
  });

  it('5. Gateway Cashout Charges: Unpaid gateway fees roll over into member cashoutDue', async () => {
    const member = await createTestMember('NS-PAY-CASHOUT', 'Gateway Fee Member', 2);
    expect(member.cashoutDue).toBe(0);

    const bkashCustody = await createTestCustodyAccount('Moin bKash Custody', CustodyChannel.BKASH, 10000, primaryAccountant.user._id);

    // Preview bKash payment: 1000 BDT at 1.85% = 18.5 BDT
    const previewRes = await request(app)
      .post('/api/payments/preview')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .send({
        memberId: member._id,
        custodyAccountId: bkashCustody._id,
        totalAmount: 1000,
        paymentDate: '2024-07-05',
        paymentMethod: PaymentMethod.BKASH,
      });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.gateway.requiredCharge).toBe(18.5);

    // Post payment paying 0 cashout charge paid now
    const postRes = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_co_${Date.now()}`)
      .send({
        memberId: member._id,
        custodyAccountId: bkashCustody._id,
        totalAmount: 1000,
        paymentDate: '2024-07-05T10:00:00.000Z',
        paymentMethod: PaymentMethod.BKASH,
        cashoutChargePaid: 0,
        transactionReference: `TRX_CO_${Date.now()}`,
      });

    expect(postRes.status).toBe(201);

    // Verify member has carried forward 18.5 BDT unpaid cashout due
    const updatedMember = await Member.findById(member._id);
    expect(updatedMember?.cashoutDue).toBe(18.5);
  });

  it('6. Idempotency Protection: Identical requests with same Idempotency-Key reject double submission', async () => {
    const member = await createTestMember('NS-PAY-IDEMP', 'Idempotent Member', 2);
    const key = `idemp_unique_${Date.now()}`;

    const payload = {
      memberId: member._id,
      custodyAccountId: testCustody._id,
      totalAmount: 1000,
      paymentDate: '2024-08-05T10:00:00.000Z',
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      cashoutChargePaid: 0,
      transactionReference: `TRX_IDEMP_${Date.now()}`,
    };

    const first = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);

    // Duplicate submission with same Idempotency-Key
    const duplicate = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toMatch(/already submitted/i);
  });
});
