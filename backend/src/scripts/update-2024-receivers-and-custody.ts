import XLSX from 'xlsx';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Payment } from '../models/Payment.js';
import { CustodyMovement } from '../models/CustodyMovement.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { Expense } from '../models/Expense.js';
import { User } from '../models/User.js';
import { PaymentMethod, MovementType, CustodyChannel, AccountType, MovementSourceType } from '../types/models.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ns-foundation';
const EXCEL_PATH = path.resolve('..', 'docs', 'updated-payments-files', 'Updated-NS FOUNDATION 2024.xlsx');

export async function update2024ReceiversAndCustody() {
  console.log('Connecting to MongoDB:', MONGODB_URI);
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGODB_URI);
  }
  console.log('Connected.');

  // 1. Resolve Users: Moin and Samrat
  const moinUser = await User.findOne({
    $or: [{ name: /moin/i }, { email: /admin@nsfoundation\.org/i }, { role: 'SUPER_ADMIN' }],
  });
  const samratUser = await User.findOne({
    $or: [{ name: /samrat/i }, { email: /assistant@nsfoundation\.org/i }, { role: 'ACCOUNTANT' }],
  });

  if (!moinUser) throw new Error('Accountant/Admin Moin Uddin not found in database.');
  if (!samratUser) throw new Error('Accountant/Assistant Nurul Amin Samrat not found in database.');

  console.log(`Resolved Moin: ${moinUser.name} (${moinUser._id}, ${moinUser.email})`);
  console.log(`Resolved Samrat: ${samratUser.name} (${samratUser._id}, ${samratUser.email})`);

  // 2. Ensure / Resolve Custody Accounts
  let bankCustody = await CustodyAccount.findOne({ channel: CustodyChannel.BANK });
  if (!bankCustody) {
    bankCustody = await CustodyAccount.create({
      name: 'Islami Bank Bangladesh Ltd (IBBL)',
      channel: CustodyChannel.BANK,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let moinBkashCustody = await CustodyAccount.findOne({
    channel: CustodyChannel.BKASH,
    $or: [{ holderId: moinUser._id }, { name: /moin/i }],
  });
  if (!moinBkashCustody) {
    moinBkashCustody = await CustodyAccount.create({
      name: 'Moin Uddin Personal bKash',
      channel: CustodyChannel.BKASH,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let samratBkashCustody = await CustodyAccount.findOne({
    channel: CustodyChannel.BKASH,
    $or: [{ holderId: samratUser._id }, { name: /samrat.*bkash/i }],
  });
  if (!samratBkashCustody) {
    samratBkashCustody = await CustodyAccount.create({
      name: 'Samrat Personal bKash',
      channel: CustodyChannel.BKASH,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: samratUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let samratNagadCustody = await CustodyAccount.findOne({ channel: CustodyChannel.NAGAD });
  if (!samratNagadCustody) {
    samratNagadCustody = await CustodyAccount.create({
      name: 'Samrat Nagad Wallet',
      channel: CustodyChannel.NAGAD,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: samratUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let moinCashCustody = await CustodyAccount.findOne({
    channel: CustodyChannel.CASH,
    $or: [{ holderId: moinUser._id }, { name: /^Physical Petty Cash/i }],
  });
  if (!moinCashCustody) {
    moinCashCustody = await CustodyAccount.create({
      name: 'Physical Petty Cash',
      channel: CustodyChannel.CASH,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: moinUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  let samratCashCustody = await CustodyAccount.findOne({
    channel: CustodyChannel.CASH,
    $or: [{ holderId: samratUser._id }, { name: /samrat.*cash/i }],
  });
  if (!samratCashCustody) {
    samratCashCustody = await CustodyAccount.create({
      name: 'Samrat Physical Petty Cash',
      channel: CustodyChannel.CASH,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      holderId: samratUser._id,
      cachedBalance: 0,
      isActive: true,
    });
  }

  console.log('\nCustody accounts mapped:');
  console.log(` - Bank: ${bankCustody.name} (${bankCustody._id})`);
  console.log(` - Moin bKash: ${moinBkashCustody.name} (${moinBkashCustody._id})`);
  console.log(` - Samrat bKash: ${samratBkashCustody.name} (${samratBkashCustody._id})`);
  console.log(` - Samrat Nagad: ${samratNagadCustody.name} (${samratNagadCustody._id})`);
  console.log(` - Moin Cash: ${moinCashCustody.name} (${moinCashCustody._id})`);
  console.log(` - Samrat Cash: ${samratCashCustody.name} (${samratCashCustody._id})`);

  // 3. Read Workbook & Update 2024 Payments
  console.log('\nReading Workbook:', EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);

  const monthConfigs = [
    { key: '2024-01', name: 'January, 2024' },
    { key: '2024-02', name: 'February, 2024' },
    { key: '2024-03', name: 'March, 2024' },
    { key: '2024-04', name: 'April, 2024' },
    { key: '2024-05', name: 'May, 2024' },
    { key: '2024-06', name: 'June, 2024' },
    { key: '2024-07', name: 'July, 2024' },
    { key: '2024-08', name: 'August, 2024' },
    { key: '2024-09', name: 'Sept, 2024' },
    { key: '2024-10', name: 'Oct, 2024' },
    { key: '2024-11', name: 'Nov, 2024' },
    { key: '2024-12', name: 'Dec, 2024' },
  ];

  let updatedPayments = 0;
  let updatedMovements = 0;
  const receiverCounts = { Moin: 0, Samrat: 0 };
  const custodyCounts: Record<string, number> = {};

  for (const cfg of monthConfigs) {
    const sheet = wb.Sheets[cfg.name];
    if (!sheet) {
      console.warn(`Sheet ${cfg.name} not found!`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    const dataRows = rows.slice(1).filter((r) => r && r[0] && String(r[0]).startsWith('NSF'));

    for (const r of dataRows) {
      const code = String(r[0]).trim();
      const totalAmount = Number(r[3]);
      if (isNaN(totalAmount) || totalAmount <= 0) continue;

      const gatewayStr = String(r[4] || 'Bkash').trim().toUpperCase();
      const receiverStr = String(r[5] || 'Moin').trim();

      const isSamratReceiver = /samrat/i.test(receiverStr);
      const receiverUser = isSamratReceiver ? samratUser : moinUser;
      const receiverLabel = isSamratReceiver ? 'Samrat' : 'Moin';
      receiverCounts[receiverLabel]++;

      let custodyAcc = isSamratReceiver ? samratBkashCustody : moinBkashCustody;
      let method = PaymentMethod.BKASH;

      if (gatewayStr.includes('BANK')) {
        method = PaymentMethod.BANK_TRANSFER;
        custodyAcc = bankCustody;
      } else if (gatewayStr.includes('NAGAD')) {
        method = PaymentMethod.NAGAD;
        custodyAcc = samratNagadCustody;
      } else if (gatewayStr.includes('CASH')) {
        method = PaymentMethod.CASH;
        custodyAcc = isSamratReceiver ? samratCashCustody : moinCashCustody;
      } else if (gatewayStr.includes('SELF')) {
        if (isSamratReceiver) {
          method = PaymentMethod.NAGAD;
          custodyAcc = samratNagadCustody;
        } else {
          method = PaymentMethod.BKASH;
          custodyAcc = moinBkashCustody;
        }
      } else if (gatewayStr.includes('BKASH')) {
        method = PaymentMethod.BKASH;
        custodyAcc = isSamratReceiver ? samratBkashCustody : moinBkashCustody;
      }

      custodyCounts[custodyAcc.name] = (custodyCounts[custodyAcc.name] || 0) + 1;

      const receiptNumber = `HIST-${cfg.key}-${code}`;

      // Update Payment
      const payment = await Payment.findOne({ receiptNumber });
      if (payment) {
        payment.receiverId = receiverUser._id;
        payment.custodyAccountId = custodyAcc._id;
        payment.paymentMethod = method;
        await payment.save();
        updatedPayments++;

        // Update corresponding CustodyMovement
        const movement = await CustodyMovement.findOne({ sourceRefId: payment._id });
        if (movement) {
          movement.custodyAccountId = custodyAcc._id;
          movement.performedBy = receiverUser._id;
          await movement.save();
          updatedMovements++;
        }
      }
    }
  }

  console.log(`\nUpdated ${updatedPayments} payments and ${updatedMovements} payment custody movements.`);
  console.log('Receiver breakdown:', receiverCounts);
  console.log('Custody accounts breakdown in payments:', custodyCounts);

  // 4. Update Expenses & Expense Custody Movements
  console.log('\n--- Aligning Expenses & Expense Movements to Moin bKash ---');
  const expUpdate = await Expense.updateMany(
    {},
    { $set: { custodyAccountId: moinBkashCustody._id, createdBy: moinUser._id } }
  );
  console.log(`Updated ${expUpdate.modifiedCount} Expense records.`);

  const expMovUpdate = await CustodyMovement.updateMany(
    { sourceType: MovementSourceType.EXPENSE },
    { $set: { custodyAccountId: moinBkashCustody._id, performedBy: moinUser._id } }
  );
  console.log(`Updated ${expMovUpdate.modifiedCount} Expense CustodyMovement records.`);

  // 5. Update Investment Funding Movements paid by Moin
  console.log('\n--- Aligning Investment Funding Disbursements paid by Moin ---');
  const fundingMovUpdate = await CustodyMovement.updateMany(
    {
      sourceType: MovementSourceType.INVESTMENT_FUNDING,
      description: /paid by Moin/i,
    },
    { $set: { custodyAccountId: moinBkashCustody._id, performedBy: moinUser._id } }
  );
  console.log(`Updated ${fundingMovUpdate.modifiedCount} Moin Investment Funding movements.`);

  // 6. Synchronize Custody Balances
  console.log('\n--- Synchronizing Custody Balances ---');
  const allAccounts = await CustodyAccount.find();
  for (const acc of allAccounts) {
    const movements = await CustodyMovement.find({ custodyAccountId: acc._id });
    const inTotal = movements.filter((m) => m.movementType === MovementType.IN).reduce((s, m) => s + m.amount, 0);
    const outTotal = movements.filter((m) => m.movementType === MovementType.OUT).reduce((s, m) => s + m.amount, 0);
    acc.cachedBalance = Math.round((inTotal - outTotal) * 100) / 100;
    await acc.save();
    console.log(`   Account: ${acc.name} | IN: ৳${inTotal} | OUT: ৳${outTotal} | Balance: ৳${acc.cachedBalance}`);
  }

  console.log('\n=== ALL 2024 RECEIVERS & CUSTODY UPDATED DYNAMICALLY AND BALANCED ===\n');
}

if (process.argv[1] && process.argv[1].endsWith('update-2024-receivers-and-custody.ts')) {
  update2024ReceiversAndCustody()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error updating receivers and custody:', err);
      process.exit(1);
    });
}
