import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { createTestUser, TestAuthContext } from './setup/fixtures.js';
import { UserRole, AccountantType } from '../types/models.js';
import { User } from '../models/User.js';

describe('Authentication & RBAC Security Boundaries Integration Tests', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let superAdmin: TestAuthContext;
  let assistantAccountant: TestAuthContext;
  let regularMember: TestAuthContext;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    superAdmin = await createTestUser('super.rbac@nsfoundation.org', UserRole.SUPER_ADMIN, null, 'Super Admin');
    assistantAccountant = await createTestUser('samrat.rbac@nsfoundation.org', UserRole.ACCOUNTANT, AccountantType.ASSISTANT, 'Samrat Accountant');
    regularMember = await createTestUser('member.rbac@nsfoundation.org', UserRole.MEMBER, null, 'Member User');
  });

  it('1. Expired JWT Token: Requests with expired tokens are rejected with 401', async () => {
    const expiredToken = jwt.sign(
      {
        userId: String(superAdmin.user._id),
        email: superAdmin.user.email,
        role: superAdmin.user.role,
        sessionVersion: superAdmin.user.sessionVersion,
      },
      process.env.JWT_SECRET || 'fallback-secret-for-tests-only',
      { expiresIn: '-10s' }
    );

    const res = await request(app)
      .get('/api/custody/summary')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('expired');
  });

  it('2. Session Revocation: Incrementing sessionVersion immediately invalidates existing tokens', async () => {
    // Current token is valid
    const preRes = await request(app)
      .get('/api/custody/summary')
      .set('Authorization', `Bearer ${assistantAccountant.token}`);
    expect(preRes.status).toBe(200);

    // Invalidate session by incrementing sessionVersion
    await User.findByIdAndUpdate(assistantAccountant.user._id, { $inc: { sessionVersion: 1 } });

    // Request with old token must now fail with 401 session revoked
    const postRes = await request(app)
      .get('/api/custody/summary')
      .set('Authorization', `Bearer ${assistantAccountant.token}`);

    expect(postRes.status).toBe(401);
    expect(postRes.body.message).toContain('revoked');
  });

  it('3. RBAC Policy: Assistant accountant cannot modify system settings', async () => {
    const freshAssistant = await createTestUser('samrat.fresh@nsfoundation.org', UserRole.ACCOUNTANT, AccountantType.ASSISTANT);

    const res = await request(app)
      .post('/api/settings/share-amount')
      .set('Authorization', `Bearer ${freshAssistant.token}`)
      .send({ amount: 600 });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Forbidden|Access denied/i);
  });

  it('4. RBAC Policy: Regular member cannot access accountant custody endpoints', async () => {
    const res = await request(app)
      .post('/api/custody/transfer')
      .set('Authorization', `Bearer ${regularMember.token}`)
      .send({
        sourceAccountId: new mongoose.Types.ObjectId(),
        destinationAccountId: new mongoose.Types.ObjectId(),
        amount: 1000,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Forbidden|Access denied/i);
  });

  it('5. NoSQL Injection Sanitization: MongoDB query operators ($gt, $ne) in body are sanitized', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: { $gt: '' },
        password: 'Password123!',
      });

    // Sanitizer removes $ operators from input keys, so $gt is stripped or rejected
    expect(res.status).toBe(400);
  });
});
