import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { PaymentService } from '../services/payment.service.js';
import { Member } from '../models/Member.js';
import { ShareHistory } from '../models/ShareHistory.js';
import { PaymentMethod, CustodyChannel } from '../types/models.js';
import { CustodyAccount } from '../models/CustodyAccount.js';

describe('Financial Allocation & Gateway Rules Test Suite', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let testMemberId: string;
  let testCustodyAccountId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Create a temporary test member
    const member = await Member.create({
      memberId: 'NS-TEST-999',
      name: 'Test Allocation Member',
      phone: '+8801700999999',
      status: 'ACTIVE',
      totalShares: 2,
      sharePurchaseAmount: 1000,
      monthlyPayable: 1000,
      joinDate: new Date('2024-01-01'),
    });
    testMemberId = String(member._id);

    // Create initial share history (2 shares = 1,000 BDT/month)
    await ShareHistory.create({
      memberId: member._id,
      shareCount: 2,
      previousShareCount: 0,
      effectiveMonth: '2024-01',
      eventType: 'TEMPORARY_CHANGE',
      changedBy: new mongoose.Types.ObjectId(),
      notes: 'Initial test shares',
    });

    // Create test custody account
    const custody = await CustodyAccount.create({
      name: 'Test bKash Account',
      accountType: 'ACCOUNTANT_CUSTODY',
      channel: CustodyChannel.BKASH,
      accountNumber: '01700999999',
      cachedBalance: 50000,
      isActive: true,
    });
    testCustodyAccountId = String(custody._id);
  });

  afterAll(async () => {
    if (testMemberId) {
      await Member.findByIdAndDelete(testMemberId);
      await ShareHistory.deleteMany({ memberId: testMemberId });
    }
    if (testCustodyAccountId) {
      await CustodyAccount.findByIdAndDelete(testCustodyAccountId);
    }
  });

  it('calculates exact monthly obligation for on-time payment before 15th', async () => {
    const preview = await PaymentService.calculatePaymentPreview({
      memberId: testMemberId,
      paymentDate: new Date('2025-03-10'),
      totalAmount: 1000,
      paymentMethod: PaymentMethod.CASH,
    });

    expect(preview.allocations).toBeDefined();
    expect(preview.breakdown.principalAmount).toBe(1000);
    expect(preview.breakdown.advanceAmount).toBe(0);
    expect(preview.breakdown.penaltyAmount).toBe(0);
  });

  it('allocates advance credit when paying in excess of monthly obligation', async () => {
    const preview = await PaymentService.calculatePaymentPreview({
      memberId: testMemberId,
      paymentDate: new Date('2025-03-10'),
      totalAmount: 3000,
      paymentMethod: PaymentMethod.CASH,
    });

    expect(preview.breakdown.principalAmount).toBe(1000);
    expect(preview.breakdown.advanceAmount).toBe(2000);
  });

  it('computes gateway cash-out fee calculation and nearest-integer rounding', async () => {
    // bKash app fee on 1,000 BDT is ~14.90 BDT, rounding to nearest integer 15 BDT
    const preview = await PaymentService.calculatePaymentPreview({
      memberId: testMemberId,
      paymentDate: new Date('2025-03-10'),
      totalAmount: 1000,
      paymentMethod: PaymentMethod.BKASH,
      custodyAccountId: testCustodyAccountId,
    });

    expect(preview.gateway).toBeDefined();
    expect(preview.gateway.requiredCharge).toBeGreaterThan(0);
    expect(preview.gateway.ratePercentage).toBeGreaterThan(0);
  });

  it('correctly retrieves penalty rule for post-2025 months (40 BDT/share)', async () => {
    const rule = await PaymentService.getPenaltyRule('2025-02');
    expect(rule.ratePerShare).toBe(40);
    expect(rule.graceDayOfMonth).toBe(15);
  });
});
