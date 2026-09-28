import { ReceiptGateway, ExtractedReceiptData } from '../../../types/receipt.js';

/**
 * Converts Bengali digits (০-৯) to Arabic ASCII digits (0-9).
 */
export function convertBengaliDigits(input: string): string {
  const bengaliToAscii: Record<string, string> = {
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
  };
  return input.replace(/[০-৯]/g, (ch) => bengaliToAscii[ch] || ch);
}

export class HeuristicRegexParser {
  /**
   * Parses raw OCR text to extract structured financial receipt values.
   */
  static parse(rawText: string): ExtractedReceiptData {
    const text = convertBengaliDigits(rawText || '');

    const gateway = this.detectGateway(text);
    const transactionId = this.extractTransactionId(text, gateway);
    const amount = this.extractAmount(text);
    const date = this.extractDate(text);
    const { sender, receiver } = this.extractPhoneNumbers(text);
    const reference = this.extractReference(text);
    const fee = this.extractFee(text);

    // Compute heuristic extraction confidence (0 - 100)
    let score = 0;
    if (transactionId) score += 35;
    if (amount && amount > 0) score += 35;
    if (date) score += 15;
    if (gateway !== ReceiptGateway.UNKNOWN) score += 10;
    if (sender || receiver) score += 5;

    return {
      memberIdentifier: null,
      memberName: null,
      senderPhone: sender,
      receiverAccount: receiver,
      amount,
      date,
      transactionId,
      reference,
      fee,
      rawText,
      confidence: Math.min(100, score),
      provider: 'HEURISTIC_PARSER',
    };
  }

  private static detectGateway(text: string): ReceiptGateway {
    const lower = text.toLowerCase();
    if (lower.includes('bkash') || lower.includes('বিকাশ')) {
      return ReceiptGateway.BKASH;
    }
    if (lower.includes('nagad') || lower.includes('নগদ') || lower.includes('*167#')) {
      return ReceiptGateway.NAGAD;
    }
    if (
      lower.includes('islami bank') ||
      lower.includes('cellfin') ||
      lower.includes('ibbl') ||
      lower.includes('bank') ||
      lower.includes('ব্যাংক')
    ) {
      return ReceiptGateway.BANK;
    }
    return ReceiptGateway.UNKNOWN;
  }

  private static extractTransactionId(text: string, gateway: ReceiptGateway): string | null {
    // 1. bKash TrxID pattern: e.g. "TrxID: BLA972XQ12" or "Transaction ID BLA972XQ12"
    const trxMatch = text.match(/(?:TrxID|TxnID|Transaction\s*ID|Txn\s*Id|Trx\s*Id|ট্রানজেকশন\s*আইডি)[:\s]*([A-Z0-9]{8,12})/i);
    if (trxMatch && trxMatch[1]) {
      return trxMatch[1].toUpperCase();
    }

    // 2. Nagad 8-character hex/alphanumeric code
    if (gateway === ReceiptGateway.NAGAD) {
      const nagadMatch = text.match(/(?:Txn\s*ID|Trx\s*ID|TXN)[:\s]*([0-9A-Z]{8,10})/i);
      if (nagadMatch && nagadMatch[1]) {
        return nagadMatch[1].toUpperCase();
      }
    }

    // 3. Fallback generic Txn pattern
    const generic = text.match(/\b([A-Z0-9]{8,12})\b/);
    if (generic && /[A-Z]/.test(generic[1]) && /[0-9]/.test(generic[1])) {
      return generic[1].toUpperCase();
    }

    return null;
  }

  private static extractAmount(text: string): number | null {
    // Matches patterns like "Amount: Tk 1,000", "Tk 500.00", "৳ ১,০০০", "৳ 500", "Total Tk 1015"
    const patterns = [
      /(?:Amount|Total|পরিমাণ|টাকা|Tk|৳|BDT)[:\s]*(?:Tk\.?|৳|BDT)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      /(?:Tk\.?|৳|BDT)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
      /\b([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*(?:Tk\.?|৳|BDT)\b/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/,/g, '');
        const val = parseFloat(cleaned);
        if (!isNaN(val) && val > 0 && val < 500000) {
          return val;
        }
      }
    }

    return null;
  }

  private static extractDate(text: string): string | null {
    // Matches DD/MM/YYYY or YYYY-MM-DD
    const isoMatch = text.match(/\b(202[4-9]-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/);
    if (isoMatch) return isoMatch[1];

    const dmyMatch = text.match(/\b([0-3]?\d)[\/\-.]([0-1]?\d)[\/\-.](202[4-9])\b/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  private static extractPhoneNumbers(text: string): { sender: string | null; receiver: string | null } {
    // Matches standard BD numbers with optional +88, spaces or hyphens: e.g. 01712-345678, 01712 345678, 01712345678
    const phoneRegex = /(?:\+?88)?\s*(01[3-9][\s\-]?[0-9]{2}[\s\-]?[0-9]{6})\b/g;
    const matches: string[] = [];
    let m;
    while ((m = phoneRegex.exec(text)) !== null) {
      const num = m[1].replace(/[\s\-]/g, '');
      if (num.length === 11 && !matches.includes(num)) {
        matches.push(num);
      }
    }

    let sender: string | null = null;
    let receiver: string | null = null;

    const senderMatch = text.match(/(?:Sender|From|প্রেরক)[:\s]*(?:\+?88)?\s*(01[3-9][\s\-]?[0-9]{2}[\s\-]?[0-9]{6})/i);
    if (senderMatch && senderMatch[1]) {
      sender = senderMatch[1].replace(/[\s\-]/g, '');
    }

    const receiverMatch = text.match(/(?:Receiver|To|প্রাপক)[:\s]*(?:\+?88)?\s*(01[3-9][\s\-]?[0-9]{2}[\s\-]?[0-9]{6})/i);
    if (receiverMatch && receiverMatch[1]) {
      receiver = receiverMatch[1].replace(/[\s\-]/g, '');
    }

    if (!sender && matches.length >= 2) {
      sender = matches[0];
      receiver = receiver || matches[1];
    } else if (!sender && matches.length === 1) {
      sender = matches[0];
    }

    return { sender, receiver };
  }

  private static extractReference(text: string): string | null {
    const refMatch = text.match(/(?:Ref|Reference|সূত্র)[:\s]*([^\n,;]{2,30})/i);
    return refMatch && refMatch[1] ? refMatch[1].trim() : null;
  }

  private static extractFee(text: string): number | null {
    const feeMatch = text.match(/(?:Fee|Charge|খরচ)[:\s]*(?:Tk\.?|৳)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (feeMatch && feeMatch[1]) {
      const cleaned = feeMatch[1].replace(/,/g, '');
      const val = parseFloat(cleaned);
      return !isNaN(val) ? val : null;
    }
    return null;
  }
}
