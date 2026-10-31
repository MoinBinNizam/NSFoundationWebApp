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

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filename = `ns-foundation-backup-${timestamp}.json.gz`;
  const metaFilename = `ns-foundation-backup-${timestamp}.meta.json`;
  const backupFilePath = path.join(backupDir, filename);
  const metaFilePath = path.join(backupDir, metaFilename);

  console.log('='.repeat(60));
  console.log(`[Backup] Initiating NS Foundation Database Backup`);
  console.log(`[Backup] Target URI : ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);
  console.log(`[Backup] Destination: ${backupFilePath}`);
  console.log('='.repeat(60));

  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection object is undefined.');
    }

    const collections = await db.collections();
    console.log(`[Backup] Discovered ${collections.length} collections.`);

    const backupData: Record<string, unknown[]> = {};
    const summary: Record<string, number> = {};

    for (const col of collections) {
      const colName = col.collectionName;
      // Skip system indexes/capped internal collections
      if (colName.startsWith('system.')) continue;

      const docs = await col.find({}).toArray();
      backupData[colName] = docs;
      summary[colName] = docs.length;
      console.log(`  - [${colName}]: ${docs.length} documents`);
    }

    // Convert to JSON and Gzip compress
    const jsonString = JSON.stringify(backupData, null, 0);
    const uncompressedBytes = Buffer.byteLength(jsonString, 'utf8');
    const compressedBuffer = zlib.gzipSync(Buffer.from(jsonString, 'utf8'), { level: 9 });

    fs.writeFileSync(backupFilePath, compressedBuffer);

    const hash = crypto.createHash('sha256').update(compressedBuffer).digest('hex');

    const metadata = {
      backupDate: new Date().toISOString(),
      databaseName: mongoose.connection.name,
      uncompressedSizeBytes: uncompressedBytes,
      compressedSizeBytes: compressedBuffer.length,
      compressionRatio: `${((compressedBuffer.length / uncompressedBytes) * 100).toFixed(1)}%`,
      sha256: hash,
      collections: summary,
      totalDocuments: Object.values(summary).reduce((acc, c) => acc + c, 0),
    };

    fs.writeFileSync(metaFilePath, JSON.stringify(metadata, null, 2), 'utf8');

    console.log('='.repeat(60));
    console.log(`[Backup] Completed successfully!`);
    console.log(`[Backup] Archive Size  : ${(compressedBuffer.length / 1024).toFixed(2)} KB (Compressed from ${(uncompressedBytes / 1024).toFixed(2)} KB)`);
    console.log(`[Backup] Total Docs    : ${metadata.totalDocuments}`);
    console.log(`[Backup] SHA256 Checksum: ${hash}`);
    console.log(`[Backup] Metadata saved: ${metaFilePath}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('[Backup] FATAL ERROR:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('[Backup] Disconnected from MongoDB.');
  }
}

void runBackup();
