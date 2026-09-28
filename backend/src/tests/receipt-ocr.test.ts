import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose, { Types } from 'mongoose';
import { HeuristicRegexParser, convertBengaliDigits } from '../services/ocr/providers/heuristic-regex-parser.js';
import { ReceiptStorageService } from '../services/ocr/storage/receipt-storage.service.js';
import { ReceiptMatchingService } from '../services/ocr/receipt-matching.service.js';
import { ReceiptService } from '../services/ocr/receipt.service.js';
import { Member } from '../models/Member.js';
import { ShareHistory } from '../models/ShareHistory.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { PaymentReceipt } from '../models/PaymentReceipt.js';
import { Payment } from '../models/Payment.js';
import { CustodyChannel, PaymentMethod, AccountType } from '../types/models.js';
import { ReceiptGateway, ReceiptStatus } from '../types/receipt.js';

describe('Payment Receipt OCR & Auto-Extraction Test Suite', () => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';
  let testMemberId: string;
  let testCustodyAccountId: string;
  let testUserId: Types.ObjectId;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }

    testUserId = new mongoose.Types.ObjectId();

    // Clean up any stale data from previous runs
    await PaymentReceipt.deleteMany({ 'extractedData.transactionId': /^BK/ });
    await Payment.deleteMany({ transactionReference: /^BK/ });

    // 1. Create a test member
    const member = await Member.create({
      memberId: 'NS-OCR-001',
      name: 'Rahim Uddin',
      phone: '+8801712345678',
      status: 'ACTIVE',
      totalShares: 2,
      sharePurchaseAmount: 1000,
      monthlyPayable: 1000,
      joinDate: new Date('2024-01-01'),
    });
    testMemberId = String(member._id);

    // Initial shares
    await ShareHistory.create({
      memberId: member._id,
      shareCount: 2,
      previousShareCount: 0,
      effectiveMonth: '2024-01',
      eventType: 'TEMPORARY_CHANGE',
      changedBy: testUserId,
      notes: 'Initial test shares for OCR test',
    });

    // 2. Create test custody account (bKash)
    const custody = await CustodyAccount.create({
      name: 'bKash Merchant OCR',
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      channel: CustodyChannel.BKASH,
      accountNumber: '01712345678',
      cachedBalance: 10000,
      isActive: true,
    });
    testCustodyAccountId = String(custody._id);
  });

  afterAll(async () => {
    if (testMemberId) {
      await Member.findByIdAndDelete(testMemberId);
      await ShareHistory.deleteMany({ memberId: testMemberId });
    }
    if (testCustodyAccountId) {
      await CustodyAccount.findByIdAndDelete(testCustodyAccountId);
    }
    await PaymentReceipt.deleteMany({ uploadedBy: testUserId });
    await Payment.deleteMany({ createdBy: testUserId });
  });

  describe('1. Heuristic Regex Parser & Digit Normalization', () => {
    it('normalizes Bengali numerals to standard ASCII numerals', () => {
      const bengaliText = 'মোট টাকা: ১২,৫০০.৫০';
      const normalized = convertBengaliDigits(bengaliText);
      expect(normalized).toContain('12,500.50');
    });

    it('extracts bKash transaction receipt details accurately', () => {
      const bKashRawText = `
        bKash Statement
        Transaction Successful
        TrxID: 9K72JLA89X
        Amount: Tk 2,000.00
        Sender: 01712-345678
        Receiver: 01800-000000
        Date: 15/05/2024 14:32:10
        Reference: NS-OCR-001 Rahim
      `;

      const result = HeuristicRegexParser.parse(bKashRawText);

      expect(result.transactionId).toBe('9K72JLA89X');
      expect(result.amount).toBe(2000);
      expect(result.date).toBe('2024-05-15');
      expect(result.senderPhone).toContain('01712345678');
      expect(result.reference).toContain('NS-OCR-001');
      expect(result.confidence).toBeGreaterThan(60);
    });

    it('extracts Nagad transaction receipt details', () => {
      const nagadRawText = `
        Nagad Digital Payment
        TxnID: 72B00X9A
        Total: 1,500 BDT
        Date: 2024-06-10
        From: 01911-223344
      `;

      const result = HeuristicRegexParser.parse(nagadRawText);

      expect(result.transactionId).toBe('72B00X9A');
      expect(result.amount).toBe(1500);
      expect(result.date).toBe('2024-06-10');
      expect(result.senderPhone).toContain('01911223344');
    });

    it('handles unknown receipt text gracefully with fallback', () => {
      const unstructuredText = `Unknown receipt receipt with random text and no figures`;
      const result = HeuristicRegexParser.parse(unstructuredText);
      expect(result.confidence).toBeLessThan(40);
    });
  });

  describe('2. Receipt Storage Service', () => {
    it('computes consistent SHA-256 and stores file safely', async () => {
      const testBuffer = Buffer.from('TEST_RECEIPT_PDF_CONTENT_' + Date.now());
      const stored = await ReceiptStorageService.putBuffer(testBuffer, 'test-receipt.pdf', 'application/pdf');

      expect(stored.sha256).toBeDefined();
      expect(stored.sha256.length).toBe(64);
      expect(stored.mimeType).toBe('application/pdf');
      expect(stored.byteSize).toBe(testBuffer.length);
      expect(stored.storageKey).toContain('receipts/');

      // Test stream reading
      const stream = await ReceiptStorageService.getStream(stored.storageKey);
      expect(stream).toBeDefined();
      await new Promise<void>((resolve, reject) => {
        stream.on('data', () => {});
        stream.on('end', () => resolve());
        stream.on('error', reject);
      });

      // Clean up test file
      await ReceiptStorageService.delete(stored.storageKey);
    });
  });

  describe('3. Candidate Matching & Duplicate Detection', () => {
    it('matches candidate members by phone number, memberId, and name', async () => {
      const extracted = {
        memberIdentifier: 'NS-OCR-001',
        memberName: 'Rahim',
        senderPhone: '01712345678',
        receiverAccount: null,
        amount: 2000,
        date: '2024-05-15',
        transactionId: '9K72JLA89X',
        reference: 'NS-OCR-001 Rahim',
        fee: null,
        rawText: 'bKash receipt for NS-OCR-001 Rahim phone 01712345678',
        confidence: 90,
        provider: 'HEURISTIC_PARSER',
      };

      const memberMatch = await ReceiptMatchingService.matchMember(extracted);
      expect(memberMatch.candidates.length).toBeGreaterThan(0);
      expect(memberMatch.candidates[0].memberId.toString()).toBe(testMemberId);
      expect(memberMatch.candidates[0].name).toBe('Rahim Uddin');

      const custodyMatch = await ReceiptMatchingService.matchCustodyAccount(extracted, ReceiptGateway.BKASH);
      expect(custodyMatch.candidates.length).toBeGreaterThan(0);
      expect(custodyMatch.candidates[0].channel).toBe(CustodyChannel.BKASH);
    });

    it('detects SHA-256 duplicate files', async () => {
      const fakeSha = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
      
      const doc = await PaymentReceipt.create({
        receiptId: 'rcpt_dup_01',
        originalFilename: 'dup.png',
        mimeType: 'image/png',
        storageKey: 'receipts/2026/09/dup.png',
        sha256: fakeSha,
        byteSize: 1024,
        gateway: ReceiptGateway.BKASH,
        status: ReceiptStatus.NEEDS_REVIEW,
        extractedData: {
          memberIdentifier: null,
          memberName: null,
          senderPhone: null,
          receiverAccount: null,
          amount: 1000,
          date: '2024-05-01',
          transactionId: 'TRX-DUP-99',
          reference: null,
          fee: null,
          rawText: 'dup',
          confidence: 90,
          provider: 'HEURISTIC_PARSER',
        },
        uploadedBy: testUserId,
      });

      const dupResult = await ReceiptMatchingService.detectDuplicates(
        'rcpt_new_02',
        fakeSha,
        {
          memberIdentifier: null,
          memberName: null,
          senderPhone: null,
          receiverAccount: null,
          amount: 1000,
          date: '2024-05-01',
          transactionId: 'TRX-OTHER',
          reference: null,
          fee: null,
          rawText: '',
          confidence: 80,
          provider: 'HEURISTIC_PARSER',
        },
        ReceiptGateway.BKASH
      );

      expect(dupResult.isDuplicate).toBe(true);
      expect(dupResult.duplicateType).toBe('SHA256_EXACT');
      expect(dupResult.matchedReceiptId).toBe('rcpt_dup_01');

      await PaymentReceipt.findByIdAndDelete(doc._id);
    });
  });

  describe('4. End-to-End Receipt Service Lifecycle & Payment Posting', () => {
    let createdReceiptId: string;
    const dynamicTrx = 'BK' + Date.now().toString().slice(-8);

    it('uploads receipt buffer, extracts data, and puts in NEEDS_REVIEW queue', async () => {
      const sampleReceiptText = `
        bKash Payment Completed
        TrxID: ${dynamicTrx}
        Amount: Tk 2,000.00
        From: 01712-345678
        Date: 2024-05-20
        Reference: NS-OCR-001
      `;
      const fileBuffer = Buffer.from(sampleReceiptText, 'utf-8');

      const receipt = await ReceiptService.uploadReceipt(
        fileBuffer,
        'bkash-sample.pdf',
        'application/pdf',
        testUserId
      );

      createdReceiptId = receipt.receiptId;

      expect(receipt.receiptId).toMatch(/^rcpt_\d+_[a-z0-9]+$/);
      expect([ReceiptStatus.NEEDS_REVIEW, ReceiptStatus.READY_TO_POST]).toContain(receipt.status);
      expect(receipt.extractedData.transactionId).toBe(dynamicTrx);
      expect(receipt.extractedData.amount).toBe(2000);
      expect(receipt.memberMatch.candidates.length).toBeGreaterThan(0);
      expect(receipt.custodyMatch.candidates.length).toBeGreaterThan(0);
    });

    it('allows accountant to review receipt and preview allocation', async () => {
      // 1. Accountant reviews and selects member + custody account
      const reviewed = await ReceiptService.reviewReceipt(
        createdReceiptId,
        {
          memberId: new Types.ObjectId(testMemberId),
          custodyAccountId: new Types.ObjectId(testCustodyAccountId),
          paymentMethod: PaymentMethod.BKASH,
          amount: 2000,
          paymentDate: new Date('2024-05-20'),
          transactionReference: dynamicTrx,
          notes: 'Verified from OCR screenshot',
        },
        testUserId
      );

      expect(reviewed.status).toBe(ReceiptStatus.READY_TO_POST);
      expect(reviewed.reviewedData?.memberId?.toString()).toBe(testMemberId);
      expect(reviewed.reviewedData?.custodyAccountId?.toString()).toBe(testCustodyAccountId);

      // 2. Preview allocation
      const preview = await ReceiptService.calculateReceiptAllocationPreview(createdReceiptId);

      expect(preview.allocations).toBeDefined();
      expect(preview.allocations.length).toBeGreaterThan(0);
    });

    it('posts payment into authoritative ledger and links paymentId to receipt', async () => {
      const mockUser = {
        _id: testUserId,
        role: 'ADMIN',
        name: 'Accountant Admin',
        email: 'admin@nsfoundation.org',
      } as any;

      const result = await ReceiptService.postPaymentFromReceipt(createdReceiptId, mockUser);

      expect(result.receipt.status).toBe(ReceiptStatus.POSTED);
      expect(result.receipt.paymentId).toBeDefined();
      expect(result.payment._id.toString()).toBe(result.receipt.paymentId!.toString());
      expect(result.payment.totalAmount).toBe(2000);
      expect(result.payment.transactionReference).toBe(dynamicTrx);

      // Verify receipt is no longer postable (idempotent / duplicate safety)
      await expect(
        ReceiptService.postPaymentFromReceipt(createdReceiptId, mockUser)
      ).rejects.toThrow();

      // Verify the payment exists in Payment collection
      const postedPayment = await Payment.findById(result.receipt.paymentId);
      expect(postedPayment).not.toBeNull();
      expect(postedPayment?.memberId.toString()).toBe(testMemberId);
    });
  });
});
