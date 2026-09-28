import mongoose, { Schema, Document } from 'mongoose';
import {
  IPaymentReceipt,
  ReceiptGateway,
  ReceiptStatus,
} from '../types/receipt.js';

export interface PaymentReceiptDocument extends Omit<IPaymentReceipt, 'createdAt' | 'updatedAt'>, Document {}

const ExtractedDataSchema = new Schema(
  {
    memberIdentifier: { type: String, default: null },
    memberName: { type: String, default: null },
    senderPhone: { type: String, default: null },
    receiverAccount: { type: String, default: null },
    amount: { type: Number, default: null },
    date: { type: String, default: null },
    transactionId: { type: String, default: null },
    reference: { type: String, default: null },
    fee: { type: Number, default: null },
    rawText: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    provider: { type: String, default: 'HEURISTIC' },
  },
  { _id: false }
);

const ReviewedDataSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    custodyAccountId: { type: Schema.Types.ObjectId, ref: 'CustodyAccount', default: null },
    amount: { type: Number },
    paymentDate: { type: Date },
    paymentMethod: { type: String },
    cashoutChargePaid: { type: Number, default: 0 },
    transactionReference: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const MemberMatchCandidateSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    score: { type: Number, required: true },
  },
  { _id: false }
);

const MemberMatchSchema = new Schema(
  {
    selectedMemberId: { type: Schema.Types.ObjectId, ref: 'Member', default: null },
    confidence: { type: Number, default: 0 },
    strategy: {
      type: String,
      enum: ['EXACT_ID', 'EXACT_PHONE', 'EXACT_NAME', 'TOKEN_NAME', 'NONE'],
      default: 'NONE',
    },
    candidates: [MemberMatchCandidateSchema],
  },
  { _id: false }
);

const CustodyMatchCandidateSchema = new Schema(
  {
    custodyAccountId: { type: Schema.Types.ObjectId, ref: 'CustodyAccount', required: true },
    name: { type: String, required: true },
    accountNumber: { type: String, default: '' },
    channel: { type: String, required: true },
    score: { type: Number, required: true },
  },
  { _id: false }
);

const CustodyMatchSchema = new Schema(
  {
    selectedCustodyAccountId: { type: Schema.Types.ObjectId, ref: 'CustodyAccount', default: null },
    confidence: { type: Number, default: 0 },
    strategy: {
      type: String,
      enum: ['EXACT_ACCOUNT_NUMBER', 'CHANNEL_DEFAULT', 'NONE'],
      default: 'NONE',
    },
    candidates: [CustodyMatchCandidateSchema],
  },
  { _id: false }
);

const DuplicateCheckSchema = new Schema(
  {
    isDuplicate: { type: Boolean, default: false },
    duplicateType: {
      type: String,
      enum: ['SHA256_EXACT', 'TRANSACTION_ID', 'COMPOSITE_SUSPECT', 'NONE'],
      default: 'NONE',
    },
    matchedReceiptId: { type: String, default: null },
    matchedPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    overrideReason: { type: String, default: null },
    overriddenBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    overriddenAt: { type: Date, default: null },
  },
  { _id: false }
);

const CorrectionSchema = new Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PaymentReceiptSchema = new Schema<PaymentReceiptDocument>(
  {
    receiptId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true,
    },
    batchId: {
      type: String,
      default: null,
      index: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    originalFilename: {
      type: String,
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    byteSize: {
      type: Number,
      required: true,
    },
    sha256: {
      type: String,
      required: true,
      index: true,
    },
    gateway: {
      type: String,
      enum: Object.values(ReceiptGateway),
      default: ReceiptGateway.UNKNOWN,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ReceiptStatus),
      default: ReceiptStatus.RECEIPT_UPLOADED,
      index: true,
    },
    extractedData: {
      type: ExtractedDataSchema,
      default: () => ({}),
    },
    reviewedData: {
      type: ReviewedDataSchema,
      default: () => ({}),
    },
    memberMatch: {
      type: MemberMatchSchema,
      default: () => ({}),
    },
    custodyMatch: {
      type: CustodyMatchSchema,
      default: () => ({}),
    },
    duplicateCheck: {
      type: DuplicateCheckSchema,
      default: () => ({}),
    },
    corrections: [CorrectionSchema],
    error: {
      message: { type: String },
      code: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
PaymentReceiptSchema.index({ status: 1, createdAt: -1 });
PaymentReceiptSchema.index({ uploadedBy: 1, createdAt: -1 });
PaymentReceiptSchema.index(
  { 'extractedData.transactionId': 1, gateway: 1 },
  { sparse: true }
);

export const PaymentReceipt = mongoose.model<PaymentReceiptDocument>(
  'PaymentReceipt',
  PaymentReceiptSchema
);
export default PaymentReceipt;
