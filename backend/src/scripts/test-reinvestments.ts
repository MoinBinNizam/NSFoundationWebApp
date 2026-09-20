import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { User } from '../models/User.js';
import { InvestmentService } from '../services/investment.service.js';
import { ReinvestmentService } from '../services/reinvestment.service.js';
import { CustodyService } from '../services/custody.service.js';
import { AccountType, CustodyChannel, MovementSourceType, MovementType, ReturnDestinationType } from '../types/models.js';

dotenv.config();

async function run() {
  try {
    console.log('--- Issue #9 Reinvestment & Project Wallet integration test ---');
    await connectDatabase();
    const actor = await User.findOne({ email: 'admin@nsfoundation.org' });
    if (!actor) throw new Error('Seeded primary accountant (admin@nsfoundation.org) was not found. Run seed:users first.');

    const accountantAccount = await CustodyAccount.findOne({ accountType: AccountType.ACCOUNTANT_CUSTODY, isActive: true });
    if (!accountantAccount) throw new Error('No active accountant custody account was found. Run seed:custody first.');
    let wallet = await CustodyAccount.findOne({ name: 'Issue #9 Test Partner Wallet' });
    if (!wallet) {
      wallet = await CustodyAccount.create({
        name: 'Issue #9 Test Partner Wallet', accountType: AccountType.EXTERNAL_WALLET,
        channel: CustodyChannel.WALLET, accountNumber: 'ISSUE9-TEST', isActive: true,
        cachedBalance: 0, notes: 'Integration-test wallet for Issue #9',
      });
    }

    const beforeAccount = await CustodyService.getDerivedAccountBalance(accountantAccount._id);
    if (beforeAccount.currentBalance < 200) {
      await CustodyMovement.create({
        custodyAccountId: accountantAccount._id, movementType: MovementType.IN, amount: 500,
        sourceType: MovementSourceType.ADJUSTMENT, date: new Date(),
        description: 'Issue #9 test liquidity top-up', performedBy: actor._id,
      });
    }

    const suffix = Date.now();
    const source = await InvestmentService.createProject({
      projectId: `I9-SRC-${suffix}`, name: `Issue #9 Source Project ${suffix}`,
      startDate: new Date(), targetPrincipal: 1000, externalEntity: 'Issue #9 Test Partner',
    }, actor as any);
    const destination = await InvestmentService.createProject({
      projectId: `I9-DST-${suffix}`, name: `Issue #9 Destination Project ${suffix}`,
      startDate: new Date(), targetPrincipal: 1200, externalEntity: 'Issue #9 Test Partner',
    }, actor as any);
    if (!source || !destination) throw new Error('Failed to create test projects');

    await InvestmentService.recordProjectReturn({
      projectId: source._id.toString(), principalReturned: 1000, actualProfit: 200,
      destinationType: ReturnDestinationType.EXTERNAL_WALLET,
      destinationCustodyAccountId: wallet._id.toString(), notes: 'Issue #9 wallet proceeds test',
    }, actor as any);
    const walletBefore = await CustodyService.getDerivedAccountBalance(wallet._id);

    const reinvestment = await ReinvestmentService.executeReinvestment({
      sourceProjectId: source._id.toString(), destinationProjectId: destination._id.toString(),
      walletAccountId: wallet._id.toString(), reinvestedAmount: 1000,
      newAccountantFunds: 200, newAccountantCustodyAccountId: accountantAccount._id.toString(),
      notes: 'Issue #9 blended reinvestment integration test',
    }, actor as any);
    const walletAfterReinvest = await CustodyService.getDerivedAccountBalance(wallet._id);
    if (walletBefore.currentBalance - walletAfterReinvest.currentBalance !== 1000) throw new Error('Wallet deduction did not equal reinvested amount');
    if (reinvestment.destinationProject.totalFunded !== 1200) throw new Error('Destination project total funding is incorrect');

    const liquidation = await ReinvestmentService.liquidateWalletFunds({
      walletAccountId: wallet._id.toString(), destinationAccountId: accountantAccount._id.toString(), amount: 200,
      notes: 'Issue #9 residual wallet liquidation integration test',
    }, actor as any);
    const walletAfterLiquidation = await CustodyService.getDerivedAccountBalance(wallet._id);
    if (walletAfterLiquidation.currentBalance !== walletAfterReinvest.currentBalance - 200) throw new Error('Wallet liquidation balance is incorrect');
    if (!liquidation.outMovement || !liquidation.inMovement) throw new Error('Liquidation did not create linked custody movements');

    const chains = await ReinvestmentService.getReinvestmentChains(source._id.toString());
    const stats = await ReinvestmentService.getReinvestmentStats();
    if (!chains.some((chain) => chain._id.toString() === reinvestment.reinvestment._id.toString())) throw new Error('Reinvestment lineage event was not returned');
    console.log(`✓ Blended reinvestment verified: wallet ৳1,000 + accountant ৳200 = ${reinvestment.destinationProject.projectId}`);
    console.log(`✓ Wallet liquidation verified: ${liquidation.transferNumber}`);
    console.log(`✓ Lineage events: ${chains.length}; tracked wallet holdings: ৳${stats.totalWalletHoldings.toLocaleString()}`);
    console.log('✓ Issue #9 integration test passed.');
  } catch (error) {
    console.error('Issue #9 test failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
