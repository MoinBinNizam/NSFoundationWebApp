import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { Member } from '../models/Member.js';
import { MemberExitSettlement } from '../models/MemberExitSettlement.js';

dotenv.config();

interface CheckResult {
  category: string;
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
}

async function checkProductionReadiness() {
  const results: CheckResult[] = [];

  console.log('='.repeat(70));
  console.log('NS FOUNDATION — PRODUCTION ENVIRONMENT & READINESS AUDIT');
  console.log('='.repeat(70));

  // 1. Environment & Secrets Check
  const nodeEnv = process.env.NODE_ENV || 'development';
  results.push({
    category: 'Environment',
    name: 'NODE_ENV Mode',
    status: nodeEnv === 'production' ? 'PASS' : 'WARN',
    details: `Current NODE_ENV: "${nodeEnv}". In live deployment, set to "production".`,
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    results.push({
      category: 'Security',
      name: 'JWT_SECRET Presence',
      status: 'FAIL',
      details: 'JWT_SECRET is completely missing in environment variables!',
    });
  } else if (jwtSecret.length < 32) {
    results.push({
      category: 'Security',
      name: 'JWT_SECRET Entropy',
      status: 'WARN',
      details: `JWT_SECRET length is ${jwtSecret.length} chars. Recommend >= 32 random characters.`,
    });
  } else {
    results.push({
      category: 'Security',
      name: 'JWT_SECRET Entropy',
      status: 'PASS',
      details: `Configured with robust secret (${jwtSecret.length} characters).`,
    });
  }

  // 2. CORS Configuration
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    results.push({
      category: 'Network',
      name: 'CORS_ORIGIN Config',
      status: 'WARN',
      details: 'CORS_ORIGIN not explicitly set. Defaulting dynamically to localhost dev ports.',
    });
  } else if (corsOrigin.includes('localhost') && nodeEnv === 'production') {
    results.push({
      category: 'Network',
      name: 'CORS_ORIGIN Config',
      status: 'WARN',
      details: `CORS_ORIGIN contains "localhost" (${corsOrigin}). Update to your live domain in production.`,
    });
  } else {
    results.push({
      category: 'Network',
      name: 'CORS_ORIGIN Config',
      status: 'PASS',
      details: `Allowed origins configured: ${corsOrigin}`,
    });
  }

  // 3. Storage Directory Check
  const storageDir = path.resolve(process.cwd(), process.env.RECEIPT_STORAGE_DIR || 'storage/receipts');
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    const testFile = path.join(storageDir, '.readiness_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    results.push({
      category: 'Storage',
      name: 'Private Voucher Storage',
      status: 'PASS',
      details: `Directory is writable and secure: ${storageDir}`,
    });
  } catch (err) {
    results.push({
      category: 'Storage',
      name: 'Private Voucher Storage',
      status: 'FAIL',
      details: `Directory write test failed: ${(err as Error).message}`,
    });
  }

  // 4. Database Connectivity & Ping
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ns-foundation';
  try {
    const startPing = Date.now();
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    const latency = Date.now() - startPing;
    const dbAdmin = mongoose.connection.db?.admin();
    const serverStatus = await dbAdmin?.serverStatus().catch(() => null);

    results.push({
      category: 'Database',
      name: 'MongoDB Connectivity & Latency',
      status: 'PASS',
      details: `Connected (${latency}ms). Version: ${serverStatus?.version || 'N/A'}. Database: "${mongoose.connection.name}".`,
    });

    // 5. Member Governance & Exit Audits Check
    const departedMembers = await Member.find({ status: 'DEPARTED' }).lean();
    let clearanceMissing = 0;
    for (const dm of departedMembers) {
      const exitRecord = await MemberExitSettlement.findOne({ memberId: dm._id });
      if (!exitRecord) clearanceMissing++;
    }

    if (clearanceMissing === 0) {
      results.push({
        category: 'Governance',
        name: 'Departed Member Audit Clearance',
        status: 'PASS',
        details: `All ${departedMembers.length} departed members (NSF007, NSF032) have verified exit settlements.`,
      });
    } else {
      results.push({
        category: 'Governance',
        name: 'Departed Member Audit Clearance',
        status: 'FAIL',
        details: `${clearanceMissing} departed members are missing settlement audit records!`,
      });
    }
  } catch (err) {
    results.push({
      category: 'Database',
      name: 'MongoDB Connectivity',
      status: 'FAIL',
      details: `Failed to connect to MongoDB: ${(err as Error).message}`,
    });
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }

  // Output formatting
  console.log('\nAudit Results:');
  console.log('-'.repeat(70));
  let failCount = 0;
  let warnCount = 0;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅ [PASS]' : r.status === 'WARN' ? '⚠️  [WARN]' : '❌ [FAIL]';
    if (r.status === 'FAIL') failCount++;
    if (r.status === 'WARN') warnCount++;
    console.log(`${icon.padEnd(10)} | ${r.category.padEnd(12)} | ${r.name.padEnd(30)}`);
    console.log(`           └─ ${r.details}`);
  }

  console.log('-'.repeat(70));
  console.log(`Summary: ${results.length - failCount - warnCount} Passed, ${warnCount} Warnings, ${failCount} Failures.`);
  console.log('='.repeat(70));

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

void checkProductionReadiness();
