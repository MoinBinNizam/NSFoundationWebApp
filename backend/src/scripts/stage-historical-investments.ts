/** Staging script for Authoritative Historical Investments from NS Foundation Investments.xlsx */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../models/index.js';
import { UserRole } from '../types/models.js';
import { connectDatabase } from '../config/db.js';
import { InvestmentService } from '../services/investment.service.js';

dotenv.config();

async function main() {
  await connectDatabase();

  const adminUser =
    (await User.findOne({ role: UserRole.SUPER_ADMIN })) ||
    (await User.findOne({ role: UserRole.ADMIN })) ||
    (await User.findOne({ name: { $regex: 'Moin', $options: 'i' } }));

  if (!adminUser) {
    throw new Error('No administrator user found in MongoDB to perform staging.');
  }

  const dryRun = process.env.STAGE_INVESTMENTS !== 'YES';
  console.log(`Starting Authoritative Historical Investment sync (dryRun: ${dryRun})...`);

  const result = await InvestmentService.syncAuthoritativeInvestments(dryRun, adminUser);
  console.log('Result:', JSON.stringify(result, null, 2));

  if (dryRun) {
    console.log('Dry run complete. Staged in staged database (MigrationBatch & MigrationRecord). Set STAGE_INVESTMENTS=YES to commit to production.');
  } else {
    console.log('Production synchronization and staging completed successfully.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
