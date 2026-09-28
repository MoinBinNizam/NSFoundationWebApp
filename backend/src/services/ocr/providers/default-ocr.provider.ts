import { createWorker } from 'tesseract.js';
import { ExtractedReceiptData } from '../../../types/receipt.js';
import { HeuristicRegexParser } from './heuristic-regex-parser.js';
import { logger } from '../../../utils/logger.js';

export interface IOcrProvider {
  extractText(buffer: Buffer, mimeType: string): Promise<{ rawText: string; confidence: number; provider: string }>;
}

export class DefaultOcrProvider implements IOcrProvider {
  private static workerPromise: Promise<any> | null = null;

  private static async getWorker() {
    if (!this.workerPromise) {
      this.workerPromise = createWorker(['eng', 'ben']).catch((err) => {
        logger.warn('Failed to load eng+ben worker, falling back to eng:', err);
        return createWorker('eng');
      });
    }
    return this.workerPromise;
  }

  /**
   * Processes an image or document buffer and extracts text.
   * If plain text is supplied (e.g. unit tests or text files), parses directly.
   * For binary image buffers, uses Tesseract.js optical character recognition.
   */
  async extractText(
    buffer: Buffer,
    mimeType: string
  ): Promise<{ rawText: string; confidence: number; provider: string }> {
    // 1. Fast-path: simulated text payloads / non-binary test files
    try {
      const bufferString = buffer.toString('utf-8');
      const isBinary = /[\x00-\x08\x0E-\x1F]/.test(bufferString.slice(0, 50));
      if (!isBinary && /[a-zA-Z0-9\u0980-\u09FF]{4,}/.test(bufferString)) {
        return {
          rawText: bufferString,
          confidence: 85,
          provider: 'LOCAL_HEURISTIC',
        };
      }
    } catch {
      // Binary stream
    }

    // 2. Optical Character Recognition via Tesseract.js
    try {
      logger.info('Processing receipt image with Tesseract.js OCR...', {
        component: 'DefaultOcrProvider',
        mimeType,
        byteSize: buffer.length,
      });

      const worker = await DefaultOcrProvider.getWorker();
      const ret = await worker.recognize(buffer);
      const rawText = ret.data?.text || '';
      const confidence = Math.round(ret.data?.confidence || 60);

      logger.info(`Tesseract OCR finished: ${rawText.length} characters extracted (confidence: ${confidence}%)`, {
        component: 'DefaultOcrProvider',
      });

      return {
        rawText,
        confidence,
        provider: 'TESSERACT_OCR',
      };
    } catch (err: any) {
      logger.error(`Tesseract OCR execution error: ${err.message}`, {
        component: 'DefaultOcrProvider',
      });

      return {
        rawText: '',
        confidence: 0,
        provider: 'OCR_ERROR',
      };
    }
  }
}

export class ReceiptExtractionEngine {
  private static provider: IOcrProvider = new DefaultOcrProvider();

  static setProvider(customProvider: IOcrProvider): void {
    this.provider = customProvider;
  }

  /**
   * Runs OCR and applies the heuristic parser to produce a normalized result.
   */
  static async extract(buffer: Buffer, mimeType: string): Promise<ExtractedReceiptData> {
    const { rawText, provider } = await this.provider.extractText(buffer, mimeType);
    const parsed = HeuristicRegexParser.parse(rawText);

    return {
      ...parsed,
      provider,
    };
  }
}
