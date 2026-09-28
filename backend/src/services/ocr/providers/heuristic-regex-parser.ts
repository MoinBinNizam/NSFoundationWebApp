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
    if (lower.includes('bkash') || lower.includes('বিকাশ') || lower.includes('সেন্ড মানি')) {
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
      lower.includes('ব্যাংক') ||
      lower.includes('npsb') ||
      lower.includes('brac') ||
      lower.includes('community cash') ||
      lower.includes('fund transfer')
    ) {
      return ReceiptGateway.BANK;
    }
    return ReceiptGateway.UNKNOWN;
  }

  private static extractTransactionId(text: string, gateway: ReceiptGateway): string | null {
    // 1. bKash / Mobile money explicit labels
    const labeledTrx = text.match(/(?:TrxID|TxnID|Transaction\s*ID|Txn\s*Id|Trx\s*Id|ট্রানজেকশন\s*আইডি)[\s:_\-]*([A-Z0-9]{8,16})/i);
    if (labeledTrx && labeledTrx[1]) {
      return labeledTrx[1].toUpperCase();
    }

    // 2. Multiline labeled pattern: e.g. "ট্রানজেকশন আইডি সর্বমোট \n CHD2HS8FL5G $1,020.00"
    const multilineMatch = text.match(/ট্রানজেকশন\s*আইডি[^\n]*\n\s*([A-Z0-9]{8,16})\b/i);
    if (multilineMatch && multilineMatch[1]) {
      return multilineMatch[1].toUpperCase();
    }

    // 3. Bank Trid / Reference patterns: e.g. "Trid \n 3426011400070492" or "Reference No TXN18333"
    const bankRefMatch = text.match(/(?:Reference\s*No\.?|Reference\s*Number|Ref\s*No\.?|Trid|TRID)[\s:_\-]*\n?\s*([A-Z0-9]{6,24})/i);
    if (bankRefMatch && bankRefMatch[1]) {
      return bankRefMatch[1].toUpperCase();
    }

    // 4. Nagad code
    if (gateway === ReceiptGateway.NAGAD) {
      const nagadMatch = text.match(/(?:Txn\s*ID|Trx\s*ID|TXN)[\s:_\-]*([0-9A-Z]{8,10})/i);
      if (nagadMatch && nagadMatch[1]) {
        return nagadMatch[1].toUpperCase();
      }
    }

    // 5. Look for standard bKash 10-char TrxID token starting with letter: e.g. CHD2HS8FL5G
    const bKashToken = text.match(/\b([A-Z][A-Z0-9]{9})\b/);
    if (bKashToken && /[0-9]/.test(bKashToken[1]) && gateway === ReceiptGateway.BKASH) {
      return bKashToken[1].toUpperCase();
    }

    // 6. Fallback generic pattern
    const generic = text.match(/\b([A-Z0-9]{8,16})\b/);
    if (generic && /[A-Z]/.test(generic[1]) && /[0-9]/.test(generic[1])) {
      return generic[1].toUpperCase();
    }

    return null;
  }

  private static extractAmount(text: string): number | null {
    // Matches patterns like "Amount: Tk 1,000", "Tk 500.00", "৳ ১,০০০", "Total BDT 1,000.00", "$1,020.00"
    const patterns = [
      /(?:Amount|Total|সর্বমোট|মোট|পরিমাণ|টাকা|Tk|৳|BDT)[\s:_\-]*\n?(?:Tk\.?|৳|BDT|\$)?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
      /(?:Tk\.?|৳|BDT|\$)\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
      /\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)\s*(?:Tk\.?|৳|BDT)\b/i,
      // Table column layout: "Amount Fee \n 50,000.00 8.70"
      /(?:Amount)[\s\S]{1,30}?\n\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/,/g, '');
        const val = parseFloat(cleaned);
        if (!isNaN(val) && val > 0 && val < 10000000) {
          return val;
        }
      }
    }

    return null;
  }

  private static extractDate(text: string): string | null {
    // 1. Matches YYYY-MM-DD
    const isoMatch = text.match(/\b(202[4-9]-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/);
    if (isoMatch) return isoMatch[1];

    // 2. Matches DD/MM/YYYY
    const dmyMatch = text.match(/\b([0-3]?\d)[\/\-.]([0-1]?\d)[\/\-.](202[4-9])\b/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    // 3. Matches DD/MM/YY (e.g. 13/08/25)
    const shortDmyMatch = text.match(/\b([0-3]?\d)[\/\-.]([0-1]?\d)[\/\-.](2[4-9])\b/);
    if (shortDmyMatch) {
      const day = shortDmyMatch[1].padStart(2, '0');
      const month = shortDmyMatch[2].padStart(2, '0');
      const year = `20${shortDmyMatch[3]}`;
      return `${year}-${month}-${day}`;
    }

    return null;
  }

  private static extractPhoneNumbers(text: string): { sender: string | null; receiver: string | null } {
    // Ignore masked numbers like 017*****908
    const cleanText = text.replace(/01[3-9]\*{3,}[0-9]+/g, '');

    const phoneRegex = /(?:\+?88)?\s*(01[3-9][\s\-]?[0-9]{2}[\s\-]?[0-9]{6})\b/g;
    const matches: string[] = [];
    let m;
    while ((m = phoneRegex.exec(cleanText)) !== null) {
      const num = m[1].replace(/[\s\-]/g, '');
      if (num.length === 11 && !matches.includes(num)) {
        matches.push(num);
      }
    }

    let sender: string | null = null;
    let receiver: string | null = null;

    const senderMatch = cleanText.match(/(?:Sender|From|প্রেরক)[:\s]*(?:\+?88)?\s*(01[3-9][\s\-]?[0-9]{2}[\s\-]?[0-9]{6})/i);
    if (senderMatch && senderMatch[1]) {
      sender = senderMatch[1].replace(/[\s\-]/g, '');
    }

    const receiverMatch = cleanText.match(/(?:Receiver|To|প্রাপক)[:\s]*(?:\+?88)?\s*(01[3-9][\s\-]?[0-9]{2}[\s\-]?[0-9]{6})/i);
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
    const refMatch = text.match(/(?:Ref|Reference|সূত্র|Narration)[:\s]*([^\n,;]{2,40})/i);
    return refMatch && refMatch[1] ? refMatch[1].trim() : null;
  }

  private static extractFee(text: string): number | null {
    const feeMatch = text.match(/(?:Fee|Charge|খরচ|Vat)[:\s]*(?:Tk\.?|৳|\$)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    if (feeMatch && feeMatch[1]) {
      const cleaned = feeMatch[1].replace(/,/g, '');
      const val = parseFloat(cleaned);
      return !isNaN(val) ? val : null;
    }
    return null;
  }
}
