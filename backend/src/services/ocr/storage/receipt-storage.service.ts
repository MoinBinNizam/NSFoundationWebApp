import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import sharp from 'sharp';
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
   * Compresses image buffers (JPEG, PNG, WebP) to save storage and memory.
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
    let ext = path.extname(originalFilename).toLowerCase() || '.png';
    const uuid = crypto.randomUUID();

    // Compute SHA-256 on the original buffer for consistent duplicate detection
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    let finalBuffer = buffer;
    let finalMime = mimeType;

    // Compress image uploads to save memory and disk storage
    if (mimeType.startsWith('image/') && !mimeType.includes('pdf')) {
      try {
        const optimized = await sharp(buffer)
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        if (optimized.length < buffer.length || buffer.length > 200 * 1024) {
          logger.info(`Receipt image optimized: ${buffer.length} -> ${optimized.length} bytes (-${Math.round((1 - optimized.length / buffer.length) * 100)}%)`, {
            component: 'ReceiptStorage',
            originalSize: buffer.length,
            optimizedSize: optimized.length,
          });
          finalBuffer = optimized;
          finalMime = 'image/webp';
          ext = '.webp';
        }
      } catch (optError) {
        // Fallback gracefully for raw/dummy or non-standard image buffers
        finalBuffer = buffer;
      }
    }

    const relativeKey = `receipts/${year}/${month}/${uuid}${ext}`;
    const targetDir = path.join(this.baseDir, String(year), month);
    this.ensureDirExists(targetDir);

    const fullPath = path.join(this.baseDir, String(year), month, `${uuid}${ext}`);

    await fs.promises.writeFile(fullPath, finalBuffer);

    logger.info(`Receipt file saved: ${relativeKey} (${finalBuffer.length} bytes)`, {
      component: 'ReceiptStorage',
      sha256: hash,
    });

    return {
      storageKey: relativeKey,
      sha256: hash,
      byteSize: finalBuffer.length,
      mimeType: finalMime,
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
