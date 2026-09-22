import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { GatewayRate } from '../models/GatewayRate.js';
import { PenaltyRule } from '../models/PenaltyRule.js';
import { PenaltyWaiver } from '../models/PenaltyWaiver.js';
import {
  AccountType,
  CustodyChannel,
} from '../types/models.js';

dotenv.config();

async function seed() {
  try {
    console.log('Connecting to database for seeding custody accounts and gateway rules...');
    await connectDatabase();

    // 1. Locate Moin and Samrat
    const moin = await User.findOne({ email: 'admin@nsfoundation.org' });
    const samrat = await User.findOne({ email: 'assistant@nsfoundation.org' });

    if (!moin || !samrat) {
      throw new Error('Moin or Samrat user not found. Please run seed:users first.');
    }

    // 2. Seed Custody Accounts
    const custodyAccounts = [
      {
        name: 'Moin Cash',
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: moin._id,
        channel: CustodyChannel.CASH,
        accountNumber: 'CASH-MOIN',
        notes: 'Primary Accountant physical cash custody',
      },
      {
        name: 'Moin Personal bKash',
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: moin._id,
        channel: CustodyChannel.BKASH,
        accountNumber: '+8801700000001',
        notes: 'Moin personal bKash wallet used for member collections',
      },
      {
        name: 'Moin Islami Bank',
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: moin._id,
        channel: CustodyChannel.BANK,
        accountNumber: 'IBBL-205012345678',
        notes: 'Moin Islami Bank account for Foundation collections',
      },
      {
        name: 'Samrat Cash',
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: samrat._id,
        channel: CustodyChannel.CASH,
        accountNumber: 'CASH-SAMRAT',
        notes: 'Assistant Accountant physical cash custody',
      },
      {
        name: 'Samrat Personal Nagad',
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: samrat._id,
        channel: CustodyChannel.NAGAD,
        accountNumber: '+8801700000002',
        notes: 'Samrat personal Nagad wallet for collections',
      },
      {
        name: 'Samrat Personal bKash',
        accountType: AccountType.ACCOUNTANT_CUSTODY,
        holderId: samrat._id,
        channel: CustodyChannel.BKASH,
        accountNumber: '+8801700000003',
        notes: 'Samrat personal bKash wallet for collections',
      },
    ];

    for (const acc of custodyAccounts) {
      const existing = await CustodyAccount.findOne({ name: acc.name });
      if (existing) {
        existing.holderId = acc.holderId;
        existing.channel = acc.channel;
        existing.accountNumber = acc.accountNumber;
        existing.notes = acc.notes;
        await existing.save();
        console.log(`[UPDATED] Custody Account '${acc.name}'`);
      } else {
        await CustodyAccount.create(acc);
        console.log(`[CREATED] Custody Account '${acc.name}'`);
      }
    }

    // 3. Seed Gateway Rates
    const gatewayRates = [
      {
        channel: CustodyChannel.BKASH,
        cashoutRatePercentage: 1.85,
        fixedFee: 0,
        roundingIncrement: 0,
        description: 'Standard bKash Personal Cash Out Rate (1.85% / 18.5 BDT per 1000), exact fee without rounding',
      },
      {
        channel: CustodyChannel.NAGAD,
        cashoutRatePercentage: 1.49,
        fixedFee: 0,
        roundingIncrement: 0,
        description: 'Nagad app cash-out rate (1.49%), exact fee without rounding; update the rule to 1.70% for USSD cash-out.',
      },
      {
        channel: CustodyChannel.BANK,
        cashoutRatePercentage: 0,
        fixedFee: 0,
        roundingIncrement: 0,
        description: 'Direct Bank Deposit (No cash out fee applied)',
      },
      {
        channel: CustodyChannel.CASH,
        cashoutRatePercentage: 0,
        fixedFee: 0,
        roundingIncrement: 0,
        description: 'Direct Physical Cash Handover (No cash out fee applied)',
      },
    ];

    for (const gw of gatewayRates) {
      const existing = await GatewayRate.findOne({ channel: gw.channel });
      if (existing) {
        existing.cashoutRatePercentage = gw.cashoutRatePercentage;
        existing.fixedFee = gw.fixedFee;
        existing.roundingIncrement = gw.roundingIncrement;
        existing.description = gw.description;
        await existing.save();
        console.log(`[UPDATED] Gateway Rate for '${gw.channel}'`);
      } else {
        await GatewayRate.create(gw);
        console.log(`[CREATED] Gateway Rate for '${gw.channel}'`);
      }
    }

    // 4. Seed Authoritative Penalty Rules
    const penaltyRules = [
      {
        effectiveFrom: '2024-01',
        effectiveTo: '2025-01',
        ratePerShare: 20,
        graceDayOfMonth: 15,
        description: 'Historical 2024 to January 2025: 20 BDT per share penalty (after 15th)',
      },
      {
        effectiveFrom: '2025-02',
        effectiveTo: null,
        ratePerShare: 40,
        graceDayOfMonth: 15,
        description: 'February 2025 onward: 40 BDT per share penalty (after 15th)',
      },
    ];

    for (const pr of penaltyRules) {
      const existing = await PenaltyRule.findOne({ effectiveFrom: pr.effectiveFrom });
      if (existing) {
        existing.effectiveTo = pr.effectiveTo;
        existing.ratePerShare = pr.ratePerShare;
        existing.graceDayOfMonth = pr.graceDayOfMonth;
        existing.description = pr.description;
        await existing.save();
        console.log(`[UPDATED] Penalty Rule from '${pr.effectiveFrom}' (${pr.ratePerShare} BDT/share)`);
      } else {
        await PenaltyRule.create(pr);
        console.log(`[CREATED] Penalty Rule from '${pr.effectiveFrom}' (${pr.ratePerShare} BDT/share)`);
      }
    }

    // 5. Seed Authoritative Penalty Waivers
    const penaltyWaivers = [
      {
        month: '2024-01',
        isGlobal: true,
        reason: 'Society foundation launch initial month penalty waiver',
        approvedBy: moin._id,
      },
      {
        month: '2024-08',
        isGlobal: true,
        reason: 'National political/economic situation organizational penalty waiver',
        approvedBy: moin._id,
      },
    ];

    for (const pw of penaltyWaivers) {
      const existing = await PenaltyWaiver.findOne({ month: pw.month, isGlobal: true });
      if (!existing) {
        await PenaltyWaiver.create(pw);
        console.log(`[CREATED] Penalty Waiver for '${pw.month}'`);
      } else {
        console.log(`[SKIP] Penalty Waiver for '${pw.month}' already exists`);
      }
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

seed();
