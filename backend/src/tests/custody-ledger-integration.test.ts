import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../app.js';
import { createTestUser, createTestCustodyAccount, TestAuthContext } from './setup/fixtures.js';
import { UserRole, AccountantType, CustodyChannel, MovementSourceType } from '../types/models.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';

describe('Custody & Movement Conservation Integration Tests', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let primaryAccountant: TestAuthContext;
  let samratNagad: any;
  let moinBank: any;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    primaryAccountant = await createTestUser('moin.custody@nsfoundation.org', UserRole.ACCOUNTANT, AccountantType.PRIMARY, 'Moin Uddin');
    samratNagad = await createTestCustodyAccount('Samrat Nagad Wallet', CustodyChannel.NAGAD, 80000);
    moinBank = await createTestCustodyAccount('Moin IBBL Bank', CustodyChannel.BANK, 50000, primaryAccountant.user._id);
  });

  it('1. Inter-Account Transfer Conservation: Transferring 10,000 BDT between custody accounts preserves zero net society variance', async () => {
    const initialSamrat = (await CustodyAccount.findById(samratNagad._id))?.cachedBalance || 0;
    const initialMoin = (await CustodyAccount.findById(moinBank._id))?.cachedBalance || 0;
    const initialTotalSociety = initialSamrat + initialMoin;

    const transferAmount = 10000;

    const res = await request(app)
      .post('/api/custody/transfer')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `transf_${Date.now()}`)
      .send({
        sourceAccountId: samratNagad._id,
        destinationAccountId: moinBank._id,
        amount: transferAmount,
        purpose: 'Integration test inter-account transfer',
        date: '2024-03-01T12:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const updatedSamrat = (await CustodyAccount.findById(samratNagad._id))?.cachedBalance || 0;
    const updatedMoin = (await CustodyAccount.findById(moinBank._id))?.cachedBalance || 0;
    const finalTotalSociety = updatedSamrat + updatedMoin;

    // Source reduced by transferAmount, destination increased by transferAmount
    expect(updatedSamrat).toBe(initialSamrat - transferAmount);
    expect(updatedMoin).toBe(initialMoin + transferAmount);

    // Zero society cash variance
    expect(finalTotalSociety).toBe(initialTotalSociety);

    // Verify paired OUT and IN movements exist in ledger
    const outMovement = await CustodyMovement.findOne({
      custodyAccountId: samratNagad._id,
      movementType: 'OUT',
      sourceType: MovementSourceType.INTERNAL_TRANSFER,
      amount: transferAmount,
    });
    const inMovement = await CustodyMovement.findOne({
      custodyAccountId: moinBank._id,
      movementType: 'IN',
      sourceType: MovementSourceType.INTERNAL_TRANSFER,
      amount: transferAmount,
    });

    expect(outMovement).toBeTruthy();
    expect(inMovement).toBeTruthy();
  });

  it('2. Double-Entry Balance Verification: CustodyAccount.cachedBalance equals sum(IN) - sum(OUT)', async () => {
    const balanceRes = await request(app)
      .get(`/api/custody/accounts/${moinBank._id}/balance`)
      .set('Authorization', `Bearer ${primaryAccountant.token}`);

    expect(balanceRes.status).toBe(200);
    const { currentBalance, totalInflow, totalOutflow } = balanceRes.body.data;

    expect(currentBalance).toBe(totalInflow - totalOutflow);
    const account = await CustodyAccount.findById(moinBank._id);
    expect(account?.cachedBalance).toBe(currentBalance);
  });

  it('3. Investment Funding: Deploying 25,000 BDT from custody reduces balance and records funding without operational expense', async () => {
    const initialBalance = (await CustodyAccount.findById(moinBank._id))?.cachedBalance || 0;
    const fundingAmount = 25000;

    // Create an investment project
    const projRes = await request(app)
      .post('/api/investments/projects')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .send({
        name: 'Organic Dairy Farm Test',
        category: 'Agriculture',
        externalEntity: 'Dairy Agro Corp',
        startDate: '2024-04-01',
        maturityDate: '2024-10-01',
        expectedROI: 15,
        targetPrincipal: 50000,
      });

    expect(projRes.status).toBe(201);
    const projectId = projRes.body.data._id;

    // Fund project from moinBank
    const fundRes = await request(app)
      .post(`/api/investments/projects/${projectId}/fund`)
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_fund_${Date.now()}`)
      .send({
        fundings: [
          {
            custodyAccountId: moinBank._id,
            amount: fundingAmount,
          },
        ],
        date: '2024-04-02',
      });

    expect(fundRes.status).toBe(200);

    // Verify custody balance reduced
    const updatedCustody = await CustodyAccount.findById(moinBank._id);
    expect(updatedCustody?.cachedBalance).toBe(initialBalance - fundingAmount);

    // Verify movement categorized as INVESTMENT_FUNDING (not an expense)
    const deploymentMovement = await CustodyMovement.findOne({
      custodyAccountId: moinBank._id,
      movementType: 'OUT',
      sourceType: MovementSourceType.INVESTMENT_FUNDING,
      amount: fundingAmount,
    });
    expect(deploymentMovement).toBeTruthy();
  });

  it('4. Investment Return: Recording maturity returns principal and actual profit into custody', async () => {
    // Create and fund a fast-cycle project
    const projRes = await request(app)
      .post('/api/investments/projects')
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .send({
        name: 'Quick Trade Cycle Test',
        category: 'Trading',
        startDate: '2024-05-01',
        maturityDate: '2024-06-01',
        targetPrincipal: 20000,
      });

    const projectId = projRes.body.data._id;

    await request(app)
      .post(`/api/investments/projects/${projectId}/fund`)
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_fund4_${Date.now()}`)
      .send({
        fundings: [{ custodyAccountId: moinBank._id, amount: 20000 }],
        date: '2024-05-02',
      });

    const preReturnBalance = (await CustodyAccount.findById(moinBank._id))?.cachedBalance || 0;

    // Record maturity return: 20,000 principal + 3,000 profit = 23,000 returned
    const returnRes = await request(app)
      .post(`/api/investments/projects/${projectId}/returns`)
      .set('Authorization', `Bearer ${primaryAccountant.token}`)
      .set('Idempotency-Key', `idemp_ret4_${Date.now()}`)
      .send({
        maturityDate: '2024-06-01',
        principalReturned: 20000,
        actualProfit: 3000,
        destinationType: 'ACCOUNTANT_CUSTODY',
        destinationCustodyAccountId: moinBank._id,
        notes: 'Cycle completed with profit',
      });

    expect(returnRes.status).toBe(200);

    const postReturnBalance = (await CustodyAccount.findById(moinBank._id))?.cachedBalance || 0;
    expect(postReturnBalance).toBe(preReturnBalance + 23000);
  });
});
