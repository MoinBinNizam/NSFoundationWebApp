import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { GatewayRate } from '../models/GatewayRate.js';
import { CustodyChannel } from '../types/models.js';

dotenv.config();

const rules = [
  { channel: CustodyChannel.BKASH, cashoutRatePercentage: 1.85, fixedFee: 0, roundingIncrement: 0, description: 'Standard bKash agent cash-out rate; exact calculated charge without rounding.' },
  { channel: CustodyChannel.NAGAD, cashoutRatePercentage: 1.49, fixedFee: 0, roundingIncrement: 0, description: 'Nagad app cash-out rate; exact calculated charge without rounding.' },
  { channel: CustodyChannel.BANK, cashoutRatePercentage: 0, fixedFee: 0, roundingIncrement: 0, description: 'Incoming Islami Bank / CellFin transfers carry no cash-out charge.' },
  { channel: CustodyChannel.CASH, cashoutRatePercentage: 0, fixedFee: 0, roundingIncrement: 0, description: 'Direct physical cash handover carries no cash-out charge.' },
];

async function run() {
  try {
    await connectDatabase();
    for (const rule of rules) {
      await GatewayRate.findOneAndUpdate({ channel: rule.channel }, rule, { upsert: true, new: true, setDefaultsOnInsert: true });
      console.log(`✓ ${rule.channel} gateway rule synchronized.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => { console.error('Gateway rule synchronization failed:', error); process.exitCode = 1; });
