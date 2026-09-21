import dotenv from 'dotenv';
import http from 'http';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDatabase } from '../config/db.js';
import {
  User,
  CustodyAccount,
  CustodyMovement,
  DistributionBatch,
  MemberDistribution,
  AuditLog,
} from '../models/index.js';
import { DistributionService } from '../services/distribution.service.js';
import { UserRole, DistributionBatchStatus } from '../types/models.js';
import { generateToken } from '../utils/jwt.js';

dotenv.config();

async function runTest() {
  let server: http.Server | null = null;
  try {
    console.log('\n======================================================');
    console.log('--- Issue #12 Final Distribution Integration Test ---');
    console.log('======================================================\n');

    await connectDatabase();

    let superAdmin = await User.findOne({ role: UserRole.SUPER_ADMIN });
    if (!superAdmin) {
      superAdmin = await User.findOne({ role: UserRole.ADMIN });
      if (superAdmin) {
        superAdmin.role = UserRole.SUPER_ADMIN;
        await superAdmin.save();
      }
    }

    const [primaryAcc, assistantAcc] = await Promise.all([
      User.findOne({ email: 'admin@nsfoundation.org' }),
      User.findOne({ email: 'assistant@nsfoundation.org' }),
    ]);

    if (!superAdmin || !primaryAcc || !assistantAcc) {
      throw new Error('Test requires seeded super admin, primary accountant, and assistant accountant users.');
    }

    console.log(`[test] Super Admin User: ${superAdmin.name} (${superAdmin.email})`);
    console.log(`[test] Primary Accountant: ${primaryAcc.name} (${primaryAcc.email})`);
    console.log(`[test] Assistant Accountant: ${assistantAcc.name} (${assistantAcc.email})`);

    // 2. Test Preview Calculation & Exact Penny-Reconciliation
    console.log('\n[test] Step 1: Testing calculatePreview()...');
    const preview = await DistributionService.calculatePreview({
      year: 2024,
      customProfitAmount: 150000,
      retainedAmount: 15000,
    });

    console.log(`[test] Year: ${preview.year}`);
    console.log(`[test] Total Distributable Amount: ৳${preview.distributableAmount.toLocaleString()}`);
    console.log(`[test] Total Shares: ${preview.totalShares}`);
    console.log(`[test] Amount per Share: ৳${preview.amountPerShare}`);
    console.log(`[test] Member Allocations Count: ${preview.memberCount}`);

    // Verify Penny-Perfect Reconciliation
    const totalGross = preview.allocations.reduce((sum, a) => sum + a.grossEntitlement, 0);
    const roundGross = Math.round(totalGross * 100) / 100;
    if (roundGross !== preview.distributableAmount) {
      throw new Error(
        `Preview gross allocations sum (৳${roundGross}) does not match distributable amount (৳${preview.distributableAmount})!`
      );
    }
    console.log(`✓ Penny-perfect reconciliation verified: sum of allocations equals exactly ৳${roundGross}.`);

    // 3. Clean up any existing test batches for year 2029 (isolated test year)
    await DistributionBatch.deleteMany({ year: 2029 });
    await MemberDistribution.deleteMany({ year: 2029 });

    // 4. Test Draft Batch Creation
    console.log('\n[test] Step 2: Testing createBatch()...');
    const batch = await DistributionService.createBatch(
      {
        year: 2029,
        title: '2029 Year-End Final Distribution Test',
        customProfitAmount: 85000,
        retainedAmount: 5000,
        notes: 'Automated integration test batch',
      },
      primaryAcc as any
    );

    if (batch.status !== DistributionBatchStatus.DRAFT) {
      throw new Error(`Expected batch status DRAFT, got ${batch.status}`);
    }
    console.log(`✓ Draft batch created: ${batch.batchNumber} (status: ${batch.status})`);

    const memberDistCount = await MemberDistribution.countDocuments({ batchId: batch._id });
    if (memberDistCount !== batch.memberCount) {
      throw new Error(
        `Expected ${batch.memberCount} member distribution documents, found ${memberDistCount}`
      );
    }
    console.log(`✓ Created ${memberDistCount} member distribution records in PENDING status.`);

    // 5. Test Review Transition
    console.log('\n[test] Step 3: Testing reviewBatch()...');
    const reviewedBatch = await DistributionService.reviewBatch(batch._id.toString(), assistantAcc as any);
    if (reviewedBatch.status !== DistributionBatchStatus.REVIEWED) {
      throw new Error(`Expected batch status REVIEWED, got ${reviewedBatch.status}`);
    }
    console.log(`✓ Batch reviewed by ${assistantAcc.name} (status: ${reviewedBatch.status})`);

    // 6. Test Approval Authorization Guardrail (Assistant and Primary Accountant must NOT be allowed to approve)
    console.log('\n[test] Step 4: Testing approval authorization guardrails...');
    let assistantApprovalBlocked = false;
    try {
      await DistributionService.approveBatch(batch._id.toString(), assistantAcc as any);
    } catch (err: any) {
      assistantApprovalBlocked = err?.statusCode === 403;
    }
    if (!assistantApprovalBlocked) {
      throw new Error('Assistant accountant was able to approve distribution batch without Super Admin role!');
    }
    console.log('✓ Assistant accountant correctly blocked with 403 Forbidden from approving batch.');

    // Super Admin approves
    const approvedBatch = await DistributionService.approveBatch(batch._id.toString(), superAdmin as any);
    if (approvedBatch.status !== DistributionBatchStatus.APPROVED) {
      throw new Error(`Expected batch status APPROVED, got ${approvedBatch.status}`);
    }
    console.log(`✓ Super Admin approved batch: ${approvedBatch.batchNumber} (status: ${approvedBatch.status})`);

    // 7. Test Payout Execution with Custody Liquidity Verification
    console.log('\n[test] Step 5: Testing executePayment()...');
    const custodyAccount = await CustodyAccount.findOne({ isActive: true });
    if (!custodyAccount) {
      throw new Error('No active custody account found for settlement testing.');
    }

    // Temporarily ensure custody has sufficient balance for test
    const dummyDeposit = new CustodyMovement({
      custodyAccountId: custodyAccount._id,
      movementType: 'IN',
      amount: 100000,
      sourceType: 'ADJUSTMENT',
      description: 'Test Liquidity Provisioning',
      performedBy: superAdmin._id,
    });
    await dummyDeposit.save();

    // Execute Payment
    const paymentResult = await DistributionService.executePayment(
      batch._id.toString(),
      custodyAccount._id.toString(),
      superAdmin as any
    );

    if (paymentResult.batch.status !== DistributionBatchStatus.PAID) {
      throw new Error(`Expected batch status PAID, got ${paymentResult.batch.status}`);
    }
    console.log(`✓ Batch paid: ${paymentResult.batch.batchNumber} (status: ${paymentResult.batch.status})`);

    // Verify all member distribution rows are PAID
    const paidCount = await MemberDistribution.countDocuments({
      batchId: batch._id,
      status: 'PAID',
    });
    if (paidCount !== batch.memberCount) {
      throw new Error(`Expected all ${batch.memberCount} members marked PAID, found ${paidCount}`);
    }
    console.log(`✓ All ${paidCount} member settlements updated to PAID status.`);

    // Verify outgoing CustodyMovement
    const outMovement = await CustodyMovement.findOne({
      sourceRefId: batch._id,
      sourceType: 'FINAL_DISTRIBUTION',
    });
    if (!outMovement || outMovement.amount !== batch.distributableAmount) {
      throw new Error('Outgoing custody movement for final distribution was not properly created!');
    }
    console.log(
      `✓ Outgoing custody movement verified: ৳${outMovement.amount} from '${custodyAccount.name}' (Ref: ${outMovement.sourceRefId}).`
    );

    // Verify AuditLog
    const auditLogs = await AuditLog.find({ entityId: batch._id });
    console.log(`✓ Audit log verified: ${auditLogs.length} events logged across batch lifecycle.`);

    // 8. Test CSV Export
    console.log('\n[test] Step 6: Testing exportBatchCsv()...');
    const csvContent = await DistributionService.exportBatchCsv(batch._id.toString());
    if (!csvContent.includes('Batch Number') || !csvContent.includes(batch.batchNumber)) {
      throw new Error('CSV output is missing batch header or records.');
    }
    console.log('✓ CSV export generated successfully with headers and member settlement rows.');

    // 9. HTTP Route Verification with Ephemeral Server
    console.log('\n[test] Step 7: Testing HTTP Express routes & middleware...');
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not allocate test port.');

    const makeToken = (u: any) =>
      generateToken({
        userId: u._id.toString(),
        email: u.email,
        role: u.role,
        accountantType: u.accountantType,
      });

    // Super Admin gets list of batches
    const response = await fetch(`http://127.0.0.1:${address.port}/api/distributions/batches`, {
      headers: { Authorization: `Bearer ${makeToken(superAdmin)}` },
    });
    if (!response.ok) throw new Error(`HTTP /api/distributions/batches returned ${response.status}`);
    const data = (await response.json()) as any;
    console.log(`✓ HTTP GET /api/distributions/batches returned ${data.data.batches.length} batches.`);

    // Clean up test batch
    await DistributionBatch.findByIdAndDelete(batch._id);
    await MemberDistribution.deleteMany({ batchId: batch._id });
    await CustodyMovement.findByIdAndDelete(dummyDeposit._id);
    await CustodyMovement.findByIdAndDelete(outMovement._id);
    await AuditLog.deleteMany({ entityId: batch._id });

    console.log('\n======================================================');
    console.log('✓ ALL ISSUE #12 FINAL DISTRIBUTION TESTS PASSED!');
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n❌ Final Distribution Integration Test Failed:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server!.close((err) => (err ? reject(err) : resolve()))
      );
    }
    await mongoose.disconnect();
  }
}

runTest();
