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

  it('accepts deposit submission with target month and base64 slip image', async () => {
    // 1x1 transparent PNG in base64
    const samplePngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await request(app)
      .post('/api/member-portal/deposit-request')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        amount: 2500,
        paymentMethod: 'NAGAD',
        transactionReference: 'TEST-TRX-SLIP-999',
        paymentDate: '2026-10-05',
        targetMonth: '2026-10',
        notes: 'October monthly installment',
        slipFile: {
          name: 'nagad-receipt.png',
          type: 'image/png',
          base64: samplePngBase64,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.targetMonth).toBe('2026-10');

    // Retrieve via my-deposits
    const listRes = await request(app)
      .get('/api/member-portal/my-deposits')
      .set('Authorization', `Bearer ${memberToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    const item = listRes.body.data.find((d: any) => d.receiptId === res.body.data.receiptId);
    expect(item).toBeDefined();
    expect(item.amount).toBe(2500);
    expect(item.targetMonth).toBe('2026-10');
    expect(item.hasSlip).toBe(true);

    // Stream the slip file back
    const slipRes = await request(app)
      .get(`/api/member-portal/my-deposits/${res.body.data.receiptId}/slip`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(slipRes.status).toBe(200);
    expect(slipRes.headers['content-type']).toContain('image');
  });

  it('enforces anti-IDOR security: unauthorized member cannot stream another member slip', async () => {
    // Create another user not linked to testMember
    const otherMember = await Member.create({
      memberId: 'NSF-TEST-OTHER',
      name: 'Other Member',
      phone: '+8801999111222',
      status: 'ACTIVE',
      totalShares: 1,
      sharePurchaseAmount: 500,
      monthlyPayable: 500,
      joinDate: new Date('2024-01-01'),
    });
    const otherUser = await User.create({
      email: 'other.member@nsfoundation.org',
      passwordHash: 'HashedPassword123!',
      name: 'Other Member',
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
      memberId: otherMember._id,
    });
    const otherToken = generateToken({
      userId: String(otherUser._id),
      email: otherUser.email,
      role: UserRole.MEMBER,
    });

    // Submit deposit as first member
    const res = await request(app)
      .post('/api/member-portal/deposit-request')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        amount: 1000,
        paymentMethod: 'BKASH',
        transactionReference: 'TEST-TRX-IDOR-CHECK',
      });

    const receiptId = res.body.data.receiptId;

    // Try to access as otherToken
    const unauthorizedRes = await request(app)
      .get(`/api/member-portal/my-deposits/${receiptId}/slip`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(unauthorizedRes.status).toBe(403);

    // Clean up other member & user
    await Member.deleteOne({ _id: otherMember._id });
    await User.deleteOne({ _id: otherUser._id });
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
