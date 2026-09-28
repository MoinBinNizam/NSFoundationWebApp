import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { logger } from '../../../utils/logger.js';

export interface StoragePutResult {
  storageKey: string;
  sha256: string;
  byteSize: number;
  mimeType: string;
}

export class ReceiptStorageService {
  private static baseDir: string = process.env.RECEIPT_STORAGE_DIR || path.resolve(process.cwd(), 'output', 'receipts');

  private static ensureDirExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Saves a buffer or stream to private local storage.
   * Generates a date-partitioned UUID key: receipts/YYYY/MM/<uuid>.<ext>
   */
  static async putBuffer(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string
  ): Promise<StoragePutResult> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const ext = path.extname(originalFilename).toLowerCase() || '.png';
    const uuid = crypto.randomUUID();

    const relativeKey = `receipts/${year}/${month}/${uuid}${ext}`;
    const targetDir = path.join(this.baseDir, String(year), month);
    this.ensureDirExists(targetDir);

    const fullPath = path.join(this.baseDir, String(year), month, `${uuid}${ext}`);

    // Compute SHA-256
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    await fs.promises.writeFile(fullPath, buffer);

    logger.info(`Receipt file saved: ${relativeKey} (${buffer.length} bytes)`, {
      component: 'ReceiptStorage',
      sha256: hash,
    });

    return {
      storageKey: relativeKey,
      sha256: hash,
      byteSize: buffer.length,
      mimeType,
    };
  }

  /**
   * Returns a readable stream to stream protected files to authorized staff.
   */
  static async getReadStream(storageKey: string): Promise<{ stream: Readable; fullPath: string }> {
    // Sanitize storage key to avoid path traversal
    const safeKey = storageKey.replace(/\.\./g, '');
    const fullPath = path.resolve(this.baseDir, '..', safeKey);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Receipt file not found on disk: ${storageKey}`);
    }

    const stream = fs.createReadStream(fullPath);
    return { stream, fullPath };
  }

  static async getStream(storageKey: string): Promise<Readable> {
    const { stream } = await this.getReadStream(storageKey);
    return stream;
  }

  /**
   * Deletes a receipt file from storage.
   */
  static async deleteFile(storageKey: string): Promise<void> {
    const safeKey = storageKey.replace(/\.\./g, '');
    const fullPath = path.resolve(this.baseDir, '..', safeKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  static async delete(storageKey: string): Promise<void> {
    return this.deleteFile(storageKey);
  }
}
