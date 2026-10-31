import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../app.js';
import { Member } from '../models/Member.js';
import { User } from '../models/User.js';
import { PaymentReceipt } from '../models/PaymentReceipt.js';
import { generateToken } from '../utils/jwt.js';
import { UserRole, UserStatus } from '../types/models.js';

describe('Member Portal Self-Service Deposit Request Suite', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let memberToken: string;
  let testMemberId: string;
  let testUserId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    // Clean any prior test deposits
    await PaymentReceipt.deleteMany({ 'extractedData.transactionId': /^TEST-TRX/ });

    // 1. Create a test member
    const member = await Member.create({
      memberId: 'NSF-TEST-PORTAL',
      name: 'Portal Test Member',
      phone: '+8801999888777',
      status: 'ACTIVE',
      totalShares: 1,
      sharePurchaseAmount: 500,
      monthlyPayable: 500,
      joinDate: new Date('2024-01-01'),
    });
    testMemberId = String(member._id);

    // 2. Create corresponding member portal user
    const user = await User.create({
      email: 'portal.test@nsfoundation.org',
      passwordHash: 'HashedPassword123!',
      name: 'Portal Test Member',
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      memberId: member._id,
    });
    testUserId = String(user._id);

    // Generate JWT token
    memberToken = generateToken({
      userId: testUserId,
      email: user.email,
      role: UserRole.MEMBER,
    });
  });

  afterAll(async () => {
    await PaymentReceipt.deleteMany({ 'extractedData.transactionId': /^TEST-TRX/ });
    await Member.deleteOne({ _id: testMemberId });
    await User.deleteOne({ _id: testUserId });
    await mongoose.disconnect();
  });

  it('rejects deposit requests with missing required fields (amount, trxId)', async () => {
    const res = await request(app)
      .post('/api/member-portal/deposit-request')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        amount: 0,
        transactionReference: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('successfully creates a payment receipt review item for accountant verification', async () => {
    const res = await request(app)
      .post('/api/member-portal/deposit-request')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        amount: 1500,
        paymentMethod: 'BKASH',
        transactionReference: 'TEST-TRX-100234',
        paymentDate: '2025-02-15',
        notes: 'Monthly dues paid via bKash personal',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.amount).toBe(1500);
    expect(res.body.data.receiptId).toBeDefined();

    // Verify it exists in PaymentReceipt collection
    const savedReceipt = await PaymentReceipt.findOne({ receiptId: res.body.data.receiptId });
    expect(savedReceipt).not.toBeNull();
    expect(savedReceipt?.extractedData.amount).toBe(1500);
    expect(savedReceipt?.extractedData.transactionId).toBe('TEST-TRX-100234');
    expect(savedReceipt?.memberMatch.selectedMemberId?.toString()).toBe(testMemberId);
  });

  it('prevents unauthenticated deposit request submission', async () => {
    const res = await request(app)
      .post('/api/member-portal/deposit-request')
      .send({
        amount: 2000,
        gateway: 'NAGAD',
        transactionId: 'TEST-TRX-UNAUTH',
      });

    expect(res.status).toBe(401);
  });
});
