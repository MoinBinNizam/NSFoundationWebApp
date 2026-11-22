import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { createTestUser, TestAuthContext } from './setup/fixtures.js';
import { Member } from '../models/Member.js';
import { GoverningBodyMember } from '../models/GoverningBodyMember.js';
import { UserRole, MemberStatus, MemberDesignation } from '../types/models.js';

describe('Governing Body Executive Roles & Structure Integration Tests', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let admin: TestAuthContext;
  let testMember: any;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    admin = await createTestUser('admin.gb_test@nsfoundation.org', UserRole.SUPER_ADMIN, null, 'Super Admin GB');

    // Create a regular test member
    testMember = await Member.create({
      memberId: 'NSF999',
      name: 'Test Candidate Member',
      phone: '+8801999888777',
      status: MemberStatus.ACTIVE,
      joinDate: new Date('2024-01-01'),
      designation: MemberDesignation.GENERAL_MEMBER,
      cashoutDue: 0,
    });
  });

  afterAll(async () => {
    if (testMember?._id) {
      await Member.findByIdAndDelete(testMember._id);
      await GoverningBodyMember.deleteMany({ memberId: testMember._id });
    }
  });

  it('1. GET /api/members/governing-body: Returns seeded executive structure', async () => {
    const res = await request(app)
      .get('/api/members/governing-body')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const first = res.body.data[0];
    expect(first).toHaveProperty('titleEn');
    expect(first).toHaveProperty('titleBn');
    expect(first).toHaveProperty('role');
    expect(first).toHaveProperty('memberId');
  });

  it('2. POST /api/members/governing-body: Adds a new board member and dynamically updates Member designation', async () => {
    const res = await request(app)
      .post('/api/members/governing-body')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        memberId: testMember._id.toString(),
        role: 'TREASURER',
        titleEn: 'Treasurer',
        titleBn: 'কোষাধ্যক্ষ',
        responsibilitiesEn: 'Oversee financial accounts and ensure audit integrity.',
        responsibilitiesBn: 'আর্থিক হিসাব ও অডিট স্বচ্ছতা বজায় রাখা।',
        order: 7,
        status: 'ACTIVE',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('TREASURER');
    expect(res.body.data.titleEn).toBe('Treasurer');

    // Verify dynamic update in Member collection
    const updatedMember = await Member.findById(testMember._id);
    expect(updatedMember?.designation).toBe(MemberDesignation.TREASURER);
  });

  it('3. PUT /api/members/governing-body/:id: Updates responsibilities and titles dynamically', async () => {
    const currentList = await GoverningBodyMember.findOne({ memberId: testMember._id });
    expect(currentList).toBeTruthy();

    const res = await request(app)
      .put(`/api/members/governing-body/${currentList!._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        titleEn: 'Senior Treasurer & Audit Chair',
        titleBn: 'প্রধান কোষাধ্যক্ষ ও অডিট প্রধান',
        responsibilitiesEn: 'Lead society financial controls and internal review.',
        responsibilitiesBn: 'সোসাইটির আর্থিক নিয়ন্ত্রণ ও অভ্যন্তরীণ নিরীক্ষায় নেতৃত্ব।',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.titleEn).toBe('Senior Treasurer & Audit Chair');
    expect(res.body.data.responsibilitiesEn).toBe('Lead society financial controls and internal review.');
  });

  it('4. DELETE /api/members/governing-body/:id: Removes role and reverts Member designation to GENERAL_MEMBER', async () => {
    const currentDoc = await GoverningBodyMember.findOne({ memberId: testMember._id });
    expect(currentDoc).toBeTruthy();

    const res = await request(app)
      .delete(`/api/members/governing-body/${currentDoc!._id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify member designation was dynamically reverted
    const revertedMember = await Member.findById(testMember._id);
    expect(revertedMember?.designation).toBe(MemberDesignation.GENERAL_MEMBER);
  });
});
