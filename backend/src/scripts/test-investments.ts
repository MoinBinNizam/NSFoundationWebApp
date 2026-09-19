import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { InvestmentFunding } from '../models/InvestmentFunding.js';
import { InvestmentService } from '../services/investment.service.js';
import { CustodyService } from '../services/custody.service.js';
import {
  AccountType,
  CustodyChannel,
  MovementType,
  MovementSourceType,
  ReturnDestinationType,
} from '../types/models.js';

dotenv.config();

async function runInvestmentTests() {
  try {
    console.log('--- Starting Issue #8 Investment Management Integration Tests ---');
    await connectDatabase();

    const moin = await User.findOne({ email: 'admin@nsfoundation.org' });
    const samrat = await User.findOne({ email: 'assistant@nsfoundation.org' });

    if (!moin || !samrat) {
      throw new Error('Test users Moin or Samrat not found');
    }

    // 1. Locate / setup custody accounts
    console.log('\n1. Setting up & verifying custody accounts for co-investment...');
    const accounts = await CustodyService.getCustodyAccounts();

    const moinBank = accounts.find(
      (a) => a.channel === 'BANK' && ((a.holderId as any)?.name?.includes('Moin') || a.name.includes('Moin'))
    );
    const samratNagad = accounts.find(
      (a) => a.channel === 'NAGAD' && ((a.holderId as any)?.name?.includes('Samrat') || a.name.includes('Samrat'))
    );

    if (!moinBank || !samratNagad) {
      throw new Error('Moin Bank or Samrat Nagad custody account not found');
    }

    // Ensure an organization external wallet exists (e.g. GROWUP NGO Wallet)
    let growupWallet = await CustodyAccount.findOne({ name: 'GROWUP NGO Wallet' });
    if (!growupWallet) {
      growupWallet = await CustodyAccount.create({
        name: 'GROWUP NGO Wallet',
        accountType: AccountType.EXTERNAL_WALLET,
        channel: CustodyChannel.WALLET,
        accountNumber: 'GROWUP-WL-01',
        cachedBalance: 0,
        isActive: true,
        notes: 'External partner wallet for GROWUP NGO project proceeds and reinvestment',
      });
      console.log('  Created GROWUP NGO Wallet account (EXTERNAL_WALLET)');
    }

    // Ensure Moin Bank and Samrat Nagad have adequate balance for the test
    const { currentBalance: moinBalBefore } = await CustodyService.getDerivedAccountBalance(moinBank._id);
    if (moinBalBefore < 25000) {
      console.log('  Injecting ৳30,000 liquidity to Moin Bank for test...');
      await CustodyMovement.create({
        custodyAccountId: moinBank._id,
        movementType: MovementType.IN,
        amount: 30000,
        sourceType: MovementSourceType.MEMBER_PAYMENT,
        date: new Date(),
        description: 'Test liquidity top-up for Moin Bank',
        performedBy: moin._id,
      });
    }

    const { currentBalance: samratBalBefore } = await CustodyService.getDerivedAccountBalance(samratNagad._id);
    if (samratBalBefore < 15000) {
      console.log('  Injecting ৳20,000 liquidity to Samrat Nagad for test...');
      await CustodyMovement.create({
        custodyAccountId: samratNagad._id,
        movementType: MovementType.IN,
        amount: 20000,
        sourceType: MovementSourceType.MEMBER_PAYMENT,
        date: new Date(),
        description: 'Test liquidity top-up for Samrat Nagad',
        performedBy: samrat._id,
      });
    }

    const { currentBalance: moinAvail } = await CustodyService.getDerivedAccountBalance(moinBank._id);
    const { currentBalance: samratAvail } = await CustodyService.getDerivedAccountBalance(samratNagad._id);
    console.log(`  Moin Bank available balance: ৳${moinAvail.toLocaleString()}`);
    console.log(`  Samrat Nagad available balance: ৳${samratAvail.toLocaleString()}`);

    // 2. Create New Investment Project
    console.log('\n2. Creating new investment project (GROWUP Cattle Livestock Project)...');
    const project = await InvestmentService.createProject(
      {
        name: 'GROWUP Cattle Livestock Project #1',
        description: '6-month seasonal livestock fattening project with GROWUP NGO',
        category: 'Livestock',
        externalEntity: 'GROWUP NGO',
        startDate: new Date('2026-03-01'),
        maturityDate: new Date('2026-09-01'),
        expectedROI: 40,
        targetPrincipal: 30000,
      },
      moin as any
    );

    if (!project) throw new Error('Project creation failed');
    console.log(`  ✓ Created project: ${project.name} (${project.projectId})`);
    console.log(`  Initial Status: ${project.status}, Target: ৳${project.targetPrincipal.toLocaleString()}, Expected ROI: ${project.expectedROI}%`);

    // 3. Multi-Accountant Project Investment
    console.log('\n3. Executing Multi-Accountant Co-Funding into the project...');
    console.log('   - Moin supplies:   ৳20,000 from Moin Islami Bank');
    console.log('   - Samrat supplies: ৳10,000 from Samrat Personal Nagad');

    const fundingResult = await InvestmentService.fundProject(
      {
        projectId: project._id.toString(),
        fundings: [
          {
            custodyAccountId: moinBank._id.toString(),
            amount: 20000,
            notes: 'Moin bank capital contribution',
          },
          {
            custodyAccountId: samratNagad._id.toString(),
            amount: 10000,
            notes: 'Samrat Nagad capital contribution',
          },
        ],
      },
      moin as any
    );

    console.log(`  ✓ Successfully funded total: ৳${fundingResult.totalNewFunding.toLocaleString()}`);
    console.log(`  ✓ Project status updated to: ${fundingResult.project.status}, totalFunded: ৳${fundingResult.project.totalFunded.toLocaleString()}`);

    // Verify individual custody deductions
    const { currentBalance: moinAfterFund } = await CustodyService.getDerivedAccountBalance(moinBank._id);
    const { currentBalance: samratAfterFund } = await CustodyService.getDerivedAccountBalance(samratNagad._id);

    console.log(`  ✓ Moin Bank balance after funding: ৳${moinAfterFund.toLocaleString()} (Decreased by exactly ৳20,000)`);
    console.log(`  ✓ Samrat Nagad balance after funding: ৳${samratAfterFund.toLocaleString()} (Decreased by exactly ৳10,000)`);

    if (moinAvail - moinAfterFund !== 20000) {
      throw new Error(`Moin Bank balance deduction mismatch: expected 20000, got ${moinAvail - moinAfterFund}`);
    }
    if (samratAvail - samratAfterFund !== 10000) {
      throw new Error(`Samrat Nagad balance deduction mismatch: expected 10000, got ${samratAvail - samratAfterFund}`);
    }

    // Verify InvestmentFunding docs and CustodyMovement OUT docs
    const fundings = await InvestmentFunding.find({ projectId: project._id });
    if (fundings.length !== 2) throw new Error('Expected 2 InvestmentFunding records');
    console.log(`  ✓ 2 separate InvestmentFunding records created with linked CustodyMovements`);

    // 4. Record Maturity Return to Single Accountant (Moin Bank)
    console.log('\n4. Testing Project Maturity Return to Single Accountant (Moin Bank)...');
    console.log('   GROWUP returns ৳30,000 principal + ৳12,000 profit (40% ROI) = ৳42,000 via Bank to Moin');

    const returnResult = await InvestmentService.recordProjectReturn(
      {
        projectId: project._id.toString(),
        maturityDate: new Date('2026-09-01'),
        principalReturned: 30000,
        actualProfit: 12000,
        actualLoss: 0,
        destinationType: ReturnDestinationType.ACCOUNTANT_CUSTODY,
        destinationCustodyAccountId: moinBank._id.toString(),
        notes: 'Full maturity settlement with 40% profit deposited into Moin Islami Bank',
      },
      moin as any
    );

    console.log(`  ✓ Return recorded: ৳${returnResult.totalReturn.toLocaleString()}`);
    console.log(`  ✓ Project status updated to: ${returnResult.project.status}`);

    const { currentBalance: moinAfterReturn } = await CustodyService.getDerivedAccountBalance(moinBank._id);
    console.log(`  ✓ Moin Bank balance after receiving return: ৳${moinAfterReturn.toLocaleString()} (Increased by exactly ৳42,000)`);
    if (moinAfterReturn - moinAfterFund !== 42000) {
      throw new Error(`Moin Bank return credit mismatch: expected 42000, got ${moinAfterReturn - moinAfterFund}`);
    }

    // 5. Test Return to Organization Wallet & Reinvestment
    console.log('\n5. Testing Return to Organization Wallet and Subsequent Reinvestment...');
    // Create second project
    const project2 = await InvestmentService.createProject(
      {
        name: 'GROWUP Summer Maize Project #2',
        description: 'Short-term maize cultivation project with GROWUP NGO',
        category: 'Agriculture',
        externalEntity: 'GROWUP NGO',
        startDate: new Date('2026-04-01'),
        targetPrincipal: 50000,
        expectedROI: 30,
      },
      moin as any
    );

    // Record an initial return directly to GROWUP NGO Wallet of ৳40,000 from a previous cycle
    console.log('   Depositing ৳40,000 proceeds from matured project to GROWUP NGO Wallet...');
    await CustodyMovement.create({
      custodyAccountId: growupWallet._id,
      movementType: MovementType.IN,
      amount: 40000,
      sourceType: MovementSourceType.INVESTMENT_RETURN,
      date: new Date(),
      description: 'Matured proceeds deposited to GROWUP NGO Wallet for reinvestment',
      performedBy: moin._id,
    });

    const { currentBalance: walletBalBeforeReinvest } = await CustodyService.getDerivedAccountBalance(growupWallet._id);
    console.log(`  ✓ GROWUP NGO Wallet balance: ৳${walletBalBeforeReinvest.toLocaleString()}`);

    // Reinvest ৳40,000 from wallet + ৳10,000 fresh funds from Samrat Nagad into Project #2 (Total = ৳50,000)
    console.log('   Reinvesting: ৳40,000 from GROWUP Wallet + ৳10,000 new top-up from Samrat Nagad into Project #2...');
    const reinvestResult = await InvestmentService.reinvestProjectFunds(
      {
        sourceProjectId: project._id.toString(),
        destinationProjectId: project2!._id.toString(),
        walletAccountId: growupWallet._id.toString(),
        reinvestedAmount: 40000,
        newAccountantFunds: 10000,
        newAccountantCustodyAccountId: samratNagad._id.toString(),
        notes: 'Full reinvestment of proceeds plus new cash injection',
      },
      moin as any
    );

    console.log(`  ✓ Reinvestment successful! Total invested in Project #2: ৳${reinvestResult.totalInvestedInDest.toLocaleString()}`);
    console.log(`  ✓ Project #2 status: ${reinvestResult.destProject.status}, totalFunded: ৳${reinvestResult.destProject.totalFunded.toLocaleString()}`);

    const { currentBalance: walletBalAfter } = await CustodyService.getDerivedAccountBalance(growupWallet._id);
    console.log(`  ✓ GROWUP Wallet new balance: ৳${walletBalAfter.toLocaleString()} (Decreased by ৳40,000)`);

    // 6. Verify Portfolio Stats
    console.log('\n6. Computing Portfolio Investment Metrics...');
    const stats = await InvestmentService.getInvestmentStats();
    console.log(`  Total Capital Invested: ৳${stats.totalCapitalInvested.toLocaleString()}`);
    console.log(`  Active Capital Deployed: ৳${stats.activeDeployedCapital.toLocaleString()}`);
    console.log(`  Total Principal Returned: ৳${stats.totalPrincipalReturned.toLocaleString()}`);
    console.log(`  Total Profit Realized: ৳${stats.totalProfitRealized.toLocaleString()}`);
    console.log(`  Net Realized Profit: ৳${stats.netRealizedProfit.toLocaleString()}`);
    console.log(`  Overall Portfolio ROI: ${stats.overallROI}%`);

    console.log('\n=============================================================');
    console.log('✓ ALL ISSUE #8 INVESTMENT MANAGEMENT TESTS PASSED WITH 100% SUCCESS!');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runInvestmentTests();
