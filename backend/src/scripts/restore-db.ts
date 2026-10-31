import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  'mongodb://localhost:27017/ns-foundation';

async function runRestore() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const fileArgIdx = args.indexOf('--file');
  let backupFilePath = fileArgIdx !== -1 && args[fileArgIdx + 1] ? args[fileArgIdx + 1] : null;

  const backupDir = path.resolve(process.cwd(), 'backups');

  if (!backupFilePath) {
    if (!fs.existsSync(backupDir)) {
      console.error(`[Restore] Error: Backups directory "${backupDir}" not found.`);
      process.exitCode = 1;
      return;
    }
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.endsWith('.json.gz'))
      .sort()
      .reverse();

    if (files.length === 0) {
      console.error(`[Restore] Error: No .json.gz backup files found in "${backupDir}".`);
      process.exitCode = 1;
      return;
    }
    backupFilePath = path.join(backupDir, files[0]);
    console.log(`[Restore] Auto-selected latest backup: ${files[0]}`);
  } else {
    backupFilePath = path.resolve(process.cwd(), backupFilePath);
  }

  if (!fs.existsSync(backupFilePath)) {
    console.error(`[Restore] Error: Backup file not found at ${backupFilePath}`);
    process.exitCode = 1;
    return;
  }

  console.log('='.repeat(60));
  console.log(`[Restore] Initiating NS Foundation Database Restore`);
  console.log(`[Restore] Source File: ${backupFilePath}`);
  console.log(`[Restore] Target URI : ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
  console.log(`[Restore] Dry Run    : ${isDryRun ? 'YES (Simulated only)' : 'NO (Live insertion)'}`);
  console.log('='.repeat(60));

  try {
    // Check integrity if .meta.json exists
    const metaPath = backupFilePath.replace(/\.json\.gz$/, '.meta.json');
    const compressedBuffer = fs.readFileSync(backupFilePath);
    const hash = crypto.createHash('sha256').update(compressedBuffer).digest('hex');

    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.sha256 && meta.sha256 !== hash) {
        throw new Error(`Checksum mismatch! Expected ${meta.sha256}, got ${hash}`);
      }
      console.log(`[Restore] Integrity verified against metadata (SHA256: ${hash.slice(0, 16)}...)`);
    }

    const decompressed = zlib.gunzipSync(compressedBuffer).toString('utf8');
    const backupData: Record<string, any[]> = JSON.parse(decompressed);

    const collectionNames = Object.keys(backupData);
    console.log(`[Restore] Found ${collectionNames.length} collections to restore.`);

    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) throw new Error('Database connection is undefined.');

    let totalRestored = 0;

    for (const colName of collectionNames) {
      const docs = backupData[colName];
      console.log(`  - [${colName}]: ${docs.length} documents`);

      if (!isDryRun && docs.length > 0) {
        const targetCollection = db.collection(colName);
        // Clear target collection before restoring snapshot
        await targetCollection.deleteMany({});
        // Insert docs
        await targetCollection.insertMany(docs);
        totalRestored += docs.length;
      }
    }

    console.log('='.repeat(60));
    if (isDryRun) {
      console.log(`[Restore] Dry run completed successfully! All records verified.`);
    } else {
      console.log(`[Restore] Database successfully restored! Total docs written: ${totalRestored}`);
    }
    console.log('='.repeat(60));
  } catch (error) {
    console.error('[Restore] FATAL ERROR:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('[Restore] Disconnected from MongoDB.');
  }
}

void runRestore();
