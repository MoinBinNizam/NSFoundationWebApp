import dotenv from 'dotenv';
import http from 'http';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

dotenv.config();

async function run() {
  let server: http.Server | null = null;
  try {
    await connectDatabase();
    const [admin, assistant] = await Promise.all([
      User.findOne({ email: 'admin@nsfoundation.org' }),
      User.findOne({ email: 'assistant@nsfoundation.org' }),
    ]);
    if (!admin || !assistant) throw new Error('Seeded administrator and assistant accountant users are required.');

    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Could not allocate test port.');
    const tokenFor = (user: any) => generateToken({ userId: user._id.toString(), email: user.email, role: user.role, accountantType: user.accountantType });
    const baseUrl = `http://127.0.0.1:${address.port}/api`;

    const [settingResponse, memberResponse, gatewayResponse, custodyResponse, deniedUpdateResponse] = await Promise.all([
      fetch(`${baseUrl}/settings/share-amount`, { headers: { Authorization: `Bearer ${tokenFor(admin)}` } }),
      fetch(`${baseUrl}/members?limit=10`, { headers: { Authorization: `Bearer ${tokenFor(admin)}` } }),
      fetch(`${baseUrl}/settings/gateway-rates`, { headers: { Authorization: `Bearer ${tokenFor(admin)}` } }),
      fetch(`${baseUrl}/payments/custody-accounts`, { headers: { Authorization: `Bearer ${tokenFor(admin)}` } }),
      fetch(`${baseUrl}/settings/share-amount`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor(assistant)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 999 }),
      }),
    ]);
    if (!settingResponse.ok || !memberResponse.ok || !gatewayResponse.ok || !custodyResponse.ok || deniedUpdateResponse.status !== 403) {
      throw new Error('Settings route authorization or member-list route contract failed.');
    }
    const setting = await settingResponse.json() as { data?: { value?: unknown } };
    const members = await memberResponse.json() as { data?: Array<{ shareCount?: unknown; monthlyPayable?: unknown }> };
    const gateways = await gatewayResponse.json() as { data?: Array<{ channel: string; cashoutRatePercentage: number; roundingIncrement: number }> };
    const custodyAccounts = await custodyResponse.json() as { data?: Array<{ _id: string; channel: string }> };
    if (typeof setting.data?.value !== 'number' || !Array.isArray(members.data) || !members.data.every((member) => typeof member.shareCount === 'number' && typeof member.monthlyPayable === 'number')) {
      throw new Error('Settings amount or member share/payable data is malformed.');
    }
    const bkashRule = gateways.data?.find((rate) => rate.channel === 'BKASH');
    const bkashAccount = custodyAccounts.data?.find((account) => account.channel === 'BKASH');
    if (!bkashRule || bkashRule.cashoutRatePercentage !== 1.85 || bkashRule.roundingIncrement !== 10 || !bkashAccount || !members.data[0]) {
      throw new Error('Configured bKash rule or test payment account is unavailable.');
    }
    const previewResponse = await fetch(`${baseUrl}/payments/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenFor(admin)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: (members.data[0] as any)._id, totalAmount: 1000, paymentMethod: 'BKASH', custodyAccountId: bkashAccount._id, cashoutChargePaid: 0 }),
    });
    const preview = await previewResponse.json() as { data?: { gateway?: { requiredCharge?: number } } };
    if (!previewResponse.ok || preview.data?.gateway?.requiredCharge !== 20) throw new Error('bKash fee preview did not round BDT 18.50 to BDT 20.');

    console.log('✓ Settings share amount is readable by authenticated staff.');
    console.log('✓ Assistant accountant is blocked from changing organization rules (HTTP 403).');
    console.log('✓ Member List returns numeric share counts and monthly payable amounts.');
    console.log('✓ bKash preview calculates a BDT 20 rounded charge for a BDT 1,000 payment.');
  } catch (error) {
    console.error('Settings and members test failed:', error);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await mongoose.disconnect();
  }
}

run();
