import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { hashPassword } from '../utils/password.js';
import { UserRole, AccountantType, UserStatus } from '../types/models.js';

dotenv.config();

async function seed() {
  try {
    console.log('Connecting to database for seeding...');
    await connectDatabase();

    const usersToSeed = [
      {
        name: 'Moin Bin Nizam (Primary Admin & Accountant)',
        email: 'admin@nsfoundation.org',
        password: process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
        phone: '+8801700000001',
        role: UserRole.ADMIN,
        accountantType: AccountantType.PRIMARY,
        status: UserStatus.ACTIVE,
      },
      {
        name: 'Samrat (Assistant Accountant)',
        email: 'assistant@nsfoundation.org',
        password: process.env.SEED_ASSISTANT_PASSWORD || 'Assistant@123456',
        phone: '+8801700000002',
        role: UserRole.ACCOUNTANT,
        accountantType: AccountantType.ASSISTANT,
        status: UserStatus.ACTIVE,
      },
    ];

    for (const u of usersToSeed) {
      const existing = await User.findOne({ email: u.email });
      if (existing) {
        console.log(`[SKIP] User '${u.email}' already exists.`);
      } else {
        const passwordHash = await hashPassword(u.password);
        await User.create({
          name: u.name,
          email: u.email,
          phone: u.phone,
          passwordHash,
          role: u.role,
          accountantType: u.accountantType,
          status: u.status,
        });
        console.log(`[CREATED] Seeded user: ${u.email} (${u.role} - ${u.accountantType})`);
      }
    }

    console.log('User seeding completed successfully.');
  } catch (error) {
    console.error('Error during seeding:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Database disconnected.');
  }
}

seed();
