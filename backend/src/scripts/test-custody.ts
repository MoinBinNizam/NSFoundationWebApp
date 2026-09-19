import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { CustodyService } from '../services/custody.service.js';
import {
  MovementType,
  MovementSourceType,
} from '../types/models.js';

dotenv.config();

async function runCustodyTests() {
  try {
    console.log('--- Starting Issue #7 Custody Ledger Integration Tests ---');
    await connectDatabase();

    const moin = await User.findOne({ email: 'admin@nsfoundation.org' });
    const samrat = await User.findOne({ email: 'assistant@nsfoundation.org' });

    if (!moin || !samrat) {
      throw new Error('Test users Moin or Samrat not found');
    }

    // 1. Check existing accounts
    console.log('\n1. Fetching custody accounts & live derived balances...');
    const accounts = await CustodyService.getCustodyAccounts();
    console.log(`Found ${accounts.length} custody accounts:`);
    for (const acc of accounts) {
      console.log(
        `  - [${acc.channel}] ${acc.name}: Derived Balance = ৳${acc.derivedBalance.toLocaleString()} (In: ৳${acc.totalInflow.toLocaleString()}, Out: ৳${acc.totalOutflow.toLocaleString()})`
      );
    }

    // 2. Custody summary metrics
    console.log('\n2. Computing society-wide custody summary...');
    const summary = await CustodyService.getCustodySummary();
    console.log(`  Total Liquid Funds: ৳${summary.totalLiquidFunds.toLocaleString()}`);
    console.log(`  Moin Custody: ৳${summary.totalMoinCustody.toLocaleString()}`);
    console.log(`  Samrat Custody: ৳${summary.totalSamratCustody.toLocaleString()}`);
    console.log(`  Channel Totals:`, summary.channelTotals);

    // 3. Test Cross-Channel Inter-Account Transfer
    // Ensure Samrat Nagad has sufficient funds to transfer
    const samratNagad = accounts.find(
      (a) => a.name.toLowerCase().includes('nagad') || (a.channel === 'NAGAD' && (a.holderId as any)?.name?.includes('Samrat'))
    );
    const moinBank = accounts.find(
      (a) => a.name.toLowerCase().includes('bank') || (a.channel === 'BANK' && (a.holderId as any)?.name?.includes('Moin'))
    );

    if (!samratNagad || !moinBank) {
      throw new Error('Required accounts (Samrat Nagad or Moin Bank) not found for transfer test');
    }

    console.log(`\n3. Testing Inter-Account Cross-Channel Transfer:`);
    console.log(`  From: ${samratNagad.name} (${samratNagad.channel}) - Balance: ৳${samratNagad.derivedBalance.toLocaleString()}`);
    console.log(`  To:   ${moinBank.name} (${moinBank.channel}) - Balance: ৳${moinBank.derivedBalance.toLocaleString()}`);

    // Ensure samratNagad has sufficient funds for the test transfer
    if (samratNagad.derivedBalance < 5000) {
      console.log('  Adding initial collection inflow of ৳10,000 to Samrat Nagad for test...');
      await CustodyMovement.create({
        custodyAccountId: samratNagad._id,
        movementType: MovementType.IN,
        amount: 10000,
        sourceType: MovementSourceType.MEMBER_PAYMENT,
        date: new Date(),
        description: 'Initial member payment test deposit',
        performedBy: samrat._id,
      });
    }

    const testTransferAmount = 5000;
    console.log(`  Executing transfer of ৳${testTransferAmount.toLocaleString()}...`);
    const transferResult = await CustodyService.transferFunds(
      {
        sourceAccountId: samratNagad._id.toString(),
        destinationAccountId: moinBank._id.toString(),
        amount: testTransferAmount,
        purpose: 'Consolidation of Nagad member collections to Islami Bank for project investment',
      },
      samrat as any
    );

    console.log(`  ✓ Transfer successful! Voucher: ${transferResult.transferNumber}`);
    console.log(`  ✓ Source (${samratNagad.name}) new balance: ৳${transferResult.sourceBalanceAfter.toLocaleString()}`);
    console.log(`  ✓ Destination (${moinBank.name}) new balance: ৳${transferResult.destinationBalanceAfter.toLocaleString()}`);

    // Verify Twin Movements
    console.log('\n4. Verifying Twin Synchronized Movements...');
    const outMovement = await CustodyMovement.findById(transferResult.outMovement._id);
    const inMovement = await CustodyMovement.findById(transferResult.inMovement._id);

    if (!outMovement || outMovement.movementType !== MovementType.OUT || outMovement.amount !== testTransferAmount) {
      throw new Error('OUT movement verification failed');
    }
    if (!inMovement || inMovement.movementType !== MovementType.IN || inMovement.amount !== testTransferAmount) {
      throw new Error('IN movement verification failed');
    }
    console.log(`  ✓ Twin movements verified: OUT (-৳${outMovement.amount}) & IN (+৳${inMovement.amount})`);

    // Verify Movement Ledger API
    console.log('\n5. Verifying Movement Ledger Query...');
    const movementQuery = await CustodyService.getMovements({ limit: 5 });
    console.log(`  Total movements in ledger: ${movementQuery.pagination.total}`);
    console.log(`  Most recent movement: [${movementQuery.movements[0]?.movementType}] ৳${movementQuery.movements[0]?.amount} - ${movementQuery.movements[0]?.description}`);

    // Verify Transfer History Query
    console.log('\n6. Verifying Transfer History Query...');
    const transferQuery = await CustodyService.getTransfers({ search: transferResult.transferNumber });
    if (transferQuery.transfers.length === 0) {
      throw new Error('Transfer record search failed');
    }
    console.log(`  ✓ Found transfer record by voucher: ${transferQuery.transfers[0].transferNumber}`);

    // 7. Test Reconciliation
    console.log('\n7. Testing Account Reconciliation (Admin variance adjustment)...');
    const { currentBalance: balBeforeReconcile } = await CustodyService.getDerivedAccountBalance(samratNagad._id);
    const auditedCount = balBeforeReconcile + 200; // Audited found ৳200 surplus
    console.log(`  Samrat Nagad ledger before: ৳${balBeforeReconcile.toLocaleString()}, Audited: ৳${auditedCount.toLocaleString()}`);

    const reconcileResult = await CustodyService.reconcileCustodyAccount(
      {
        accountId: samratNagad._id.toString(),
        verifiedAmount: auditedCount,
        reason: 'Monthly petty cash count variance adjustment (+৳200 surplus)',
      },
      moin as any
    );

    console.log(`  ✓ Reconciliation executed: ${reconcileResult.message}`);
    const { currentBalance: balAfterReconcile } = await CustodyService.getDerivedAccountBalance(samratNagad._id);
    console.log(`  ✓ Samrat Nagad new derived balance after reconciliation: ৳${balAfterReconcile.toLocaleString()}`);
    if (balAfterReconcile !== auditedCount) {
      throw new Error('Reconciliation derived balance does not match audited count');
    }

    console.log('\n======================================================');
    console.log('✓ ALL ISSUE #7 CUSTODY LEDGER TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runCustodyTests();
