import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { PaymentReceipt } from '../models/PaymentReceipt.js';
import { ReceiptExtractionEngine } from '../services/ocr/providers/default-ocr.provider.js';
import { ReceiptMatchingService } from '../services/ocr/receipt-matching.service.js';
import { ReceiptGateway, ReceiptStatus } from '../types/receipt.js';
import { PaymentMethod } from '../types/models.js';

dotenv.config();

async function reprocess() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/ns-foundation';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const receipts = await PaymentReceipt.find({
    status: { $in: [ReceiptStatus.NEEDS_REVIEW, ReceiptStatus.READY_TO_POST] },
  });

  console.log(`Found ${receipts.length} receipts to evaluate`);

  const storageBase = path.resolve(process.cwd(), 'output');

  for (const rcpt of receipts) {
    const fullPath = path.resolve(storageBase, rcpt.storageKey);
    if (!fs.existsSync(fullPath)) {
      console.log(`Skipping ${rcpt.receiptId}: file not found at ${fullPath}`);
      continue;
    }

    const buffer = fs.readFileSync(fullPath);
    console.log(`Processing OCR for ${rcpt.receiptId} (${rcpt.originalFilename})...`);

    const extracted = await ReceiptExtractionEngine.extract(buffer, rcpt.mimeType);

    let gateway = rcpt.gateway;
    const lower = extracted.rawText.toLowerCase();
    if (lower.includes('bkash') || lower.includes('বিকাশ') || lower.includes('সেন্ড মানি')) {
      gateway = ReceiptGateway.BKASH;
    } else if (lower.includes('nagad') || lower.includes('নগদ') || lower.includes('*167#')) {
      gateway = ReceiptGateway.NAGAD;
    } else if (
      lower.includes('bank') ||
      lower.includes('ব্যাংক') ||
      lower.includes('npsb') ||
      lower.includes('brac') ||
      lower.includes('community cash') ||
      lower.includes('fund transfer')
    ) {
      gateway = ReceiptGateway.BANK;
    }

    const memberMatch = await ReceiptMatchingService.matchMember(extracted);
    const custodyMatch = await ReceiptMatchingService.matchCustodyAccount(extracted, gateway);

    const duplicateCheck = await ReceiptMatchingService.detectDuplicates(
      rcpt.receiptId,
      rcpt.sha256,
      extracted,
      gateway
    );

    let status = ReceiptStatus.NEEDS_REVIEW;
    if (duplicateCheck.isDuplicate) {
      status = ReceiptStatus.DUPLICATE_SUSPECTED;
    } else if (memberMatch.selectedMemberId && custodyMatch.selectedCustodyAccountId && extracted.amount) {
      status = ReceiptStatus.READY_TO_POST;
    }

    const defaultMethod =
      gateway === ReceiptGateway.BKASH
        ? PaymentMethod.BKASH
        : gateway === ReceiptGateway.NAGAD
        ? PaymentMethod.NAGAD
        : gateway === ReceiptGateway.BANK
        ? PaymentMethod.BANK_TRANSFER
        : PaymentMethod.CASH;

    rcpt.gateway = gateway;
    rcpt.status = status;
    rcpt.extractedData = extracted;
    rcpt.memberMatch = memberMatch;
    rcpt.custodyMatch = custodyMatch;
    rcpt.duplicateCheck = duplicateCheck;
    rcpt.reviewedData = {
      memberId: memberMatch.selectedMemberId || rcpt.reviewedData?.memberId || null,
      custodyAccountId: custodyMatch.selectedCustodyAccountId || rcpt.reviewedData?.custodyAccountId || null,
      amount: extracted.amount || rcpt.reviewedData?.amount || undefined,
      paymentDate: extracted.date ? new Date(extracted.date) : rcpt.reviewedData?.paymentDate || new Date(),
      paymentMethod: (defaultMethod as any) || rcpt.reviewedData?.paymentMethod,
      cashoutChargePaid: rcpt.reviewedData?.cashoutChargePaid || 0,
      transactionReference: extracted.transactionId || rcpt.reviewedData?.transactionReference || '',
      notes: rcpt.reviewedData?.notes || '',
    };

    await rcpt.save();
    console.log(`Updated ${rcpt.receiptId}: Amount=${extracted.amount}, TrxID=${extracted.transactionId}, Status=${status}`);
  }

  await mongoose.disconnect();
  console.log('Finished reprocessing all receipts.');
}

reprocess().catch((err) => {
  console.error('Reprocess error:', err);
  process.exit(1);
});
