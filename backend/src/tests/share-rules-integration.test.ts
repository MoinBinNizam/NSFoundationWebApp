import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { createTestUser, createTestMember, TestAuthContext } from './setup/fixtures.js';
import { UserRole, AccountantType, ShareEventType } from '../types/models.js';
import { Member } from '../models/Member.js';
import { ShareHistory } from '../models/ShareHistory.js';
import { AuditLog } from '../models/AuditLog.js';

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
});
