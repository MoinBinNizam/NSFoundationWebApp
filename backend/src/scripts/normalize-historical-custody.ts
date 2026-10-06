/** Align the January self-cash custody label with the standard petty-cash type. */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { CustodyAccount } from '../models/index.js';
import { AccountType, CustodyChannel } from '../types/models.js';

dotenv.config();

async function main() {
  await connectDatabase();
  const legacy = await CustodyAccount.findOne({ name: 'Samrat Historical Cash Custody' });
  const normalized = await CustodyAccount.findOne({ name: 'Samrat Physical Petty Cash' });
  if (legacy && normalized) throw new Error('Both legacy and normalized Samrat cash accounts exist; manual reconciliation is required.');
  if (legacy) {
    legacy.name = 'Samrat Physical Petty Cash';
    legacy.accountType = AccountType.ACCOUNTANT_CUSTODY;
    legacy.channel = CustodyChannel.CASH;
    legacy.accountNumber = 'CASH-VAULT-02';
    legacy.notes = 'Physical petty cash custody for approved January 2024 historical self-cash collection.';
    await legacy.save();
  }
  const account = normalized || legacy;
  const historicalBkash = await CustodyAccount.findOne({ name: 'Nurul Amin Samrat bKash Wallet' });
  const configuredBkash = await CustodyAccount.findOne({ name: 'Samrat Personal bKash' });
  if (historicalBkash && configuredBkash) throw new Error('Both historical and configured Samrat bKash custody accounts exist; manual reconciliation is required.');
  if (historicalBkash) {
    historicalBkash.name = 'Samrat Personal bKash';
    historicalBkash.notes = 'Samrat personal bKash wallet for member collections, including the February 2024 historical import.';
    await historicalBkash.save();
  }
  console.log(JSON.stringify({ updatedCash: Boolean(legacy), updatedBkash: Boolean(historicalBkash), cashAccount: account ? { name: account.name, accountNumber: account.accountNumber, channel: account.channel, accountType: account.accountType } : null, bkashAccount: (configuredBkash || historicalBkash)?.name || null }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => mongoose.disconnect());
