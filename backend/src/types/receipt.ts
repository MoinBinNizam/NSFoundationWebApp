import { Types } from 'mongoose';
import { PaymentMethod } from './models.js';

export enum ReceiptGateway {
  BKASH = 'BKASH',
  NAGAD = 'NAGAD',
  BANK = 'BANK',
  UNKNOWN = 'UNKNOWN',
}

export enum ReceiptStatus {
  RECEIPT_UPLOADED = 'RECEIPT_UPLOADED',
  PROCESSING = 'PROCESSING',
  EXTRACTED = 'EXTRACTED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  READY_TO_POST = 'READY_TO_POST',
  POSTED = 'POSTED',
  OCR_FAILED = 'OCR_FAILED',
  MATCH_FAILED = 'MATCH_FAILED',
  DUPLICATE_SUSPECTED = 'DUPLICATE_SUSPECTED',
}

export interface ExtractedReceiptData {
  memberIdentifier: string | null;
  memberName: string | null;
  senderPhone: string | null;
  receiverAccount: string | null;
  amount: number | null;
  date: string | null;
  transactionId: string | null;
  reference: string | null;
  fee: number | null;
  rawText: string;
  confidence: number;
  provider: string;
}

export interface ReviewedReceiptData {
  memberId?: Types.ObjectId | null;
  custodyAccountId?: Types.ObjectId | null;
  amount?: number;
  paymentDate?: Date;
  paymentMethod?: PaymentMethod;
  cashoutChargePaid?: number;
  transactionReference?: string;
  notes?: string;
}

export interface MemberMatchCandidate {
  memberId: Types.ObjectId;
  name: string;
  phone: string;
  score: number;
}

export interface MemberMatchResult {
  selectedMemberId: Types.ObjectId | null;
  confidence: number;
  strategy: 'EXACT_ID' | 'EXACT_PHONE' | 'EXACT_NAME' | 'TOKEN_NAME' | 'NONE';
  candidates: MemberMatchCandidate[];
}

export interface CustodyMatchCandidate {
  custodyAccountId: Types.ObjectId;
  name: string;
  accountNumber: string;
  channel: string;
  score: number;
}

export interface CustodyMatchResult {
  selectedCustodyAccountId: Types.ObjectId | null;
  confidence: number;
  strategy: 'EXACT_ACCOUNT_NUMBER' | 'CHANNEL_DEFAULT' | 'NONE';
  candidates: CustodyMatchCandidate[];
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType: 'SHA256_EXACT' | 'TRANSACTION_ID' | 'COMPOSITE_SUSPECT' | 'NONE';
  matchedReceiptId?: string | null;
  matchedPaymentId?: Types.ObjectId | null;
  overrideReason?: string | null;
  overriddenBy?: Types.ObjectId | null;
  overriddenAt?: Date | null;
}

export interface ReceiptCorrection {
  field: string;
  oldValue: any;
  newValue: any;
  changedBy: Types.ObjectId;
  changedAt: Date;
}

export interface IPaymentReceipt {
  receiptId: string;
  paymentId?: Types.ObjectId | null;
  batchId?: string | null;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  processedAt?: Date | null;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  gateway: ReceiptGateway;
  status: ReceiptStatus;
  extractedData: ExtractedReceiptData;
  reviewedData: ReviewedReceiptData;
  memberMatch: MemberMatchResult;
  custodyMatch: CustodyMatchResult;
  duplicateCheck: DuplicateCheckResult;
  corrections: ReceiptCorrection[];
  error?: {
    message: string;
    code?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
