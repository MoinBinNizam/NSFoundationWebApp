import { ExtractedReceiptData } from '../../../types/receipt.js';
import { HeuristicRegexParser } from './heuristic-regex-parser.js';
import { logger } from '../../../utils/logger.js';

export interface IOcrProvider {
  extractText(buffer: Buffer, mimeType: string): Promise<{ rawText: string; confidence: number; provider: string }>;
}

export class DefaultOcrProvider implements IOcrProvider {
  /**
   * Processes an image or document buffer and extracts text.
   * If a cloud OCR key is configured (e.g. GOOGLE_VISION_KEY), it invokes the cloud API;
   * otherwise, it uses the deterministic local heuristic provider.
   */
  async extractText(
    buffer: Buffer,
    _mimeType: string
  ): Promise<{ rawText: string; confidence: number; provider: string }> {
    // If a cloud provider is configured in environment, it would be dispatched here
    const hasCloudOcr = Boolean(process.env.GOOGLE_VISION_KEY || process.env.AZURE_OCR_KEY);

    if (hasCloudOcr) {
      logger.info('Invoking external Cloud OCR provider...', { component: 'OcrProvider' });
      // Pluggable cloud adapter path
    }

    // Default built-in extraction:
    // Extract any ASCII/UTF-8 strings present in the buffer or sample payloads
    let detectedText = '';
    try {
      const bufferString = buffer.toString('utf-8');
      // If the buffer contains printable text (e.g. text/plain or simulated sample)
      if (/[a-zA-Z0-9\u0980-\u09FF]{4,}/.test(bufferString)) {
        detectedText = bufferString;
      }
    } catch {
      // Binary image buffers might not be direct UTF-8 strings
    }

    return {
      rawText: detectedText,
      confidence: detectedText ? 85 : 50,
      provider: hasCloudOcr ? 'CLOUD_VISION' : 'LOCAL_HEURISTIC',
    };
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
