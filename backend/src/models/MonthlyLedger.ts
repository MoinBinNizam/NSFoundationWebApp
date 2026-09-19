import mongoose, { Schema, Model } from 'mongoose';
import { IMonthlyLedger, MonthlyLedgerStatus } from '../types/models.js';

const monthlyLedgerSchema = new Schema<IMonthlyLedger>(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required'],
      index: true,
    },
    month: {
      type: String,
      required: [true, 'Accounting month (YYYY-MM) is required'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Accounting month must be in YYYY-MM format'],
      index: true,
    },
    shareCount: {
      type: Number,
      required: true,
      min: 1,
    },
    principalDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyDue: {
      type: Number,
      default: 0,
      min: 0,
    },
    principalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    advanceApplied: {
      type: Number,
      default: 0,
      min: 0,
    },
    excessAdvance: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(MonthlyLedgerStatus),
      default: MonthlyLedgerStatus.DUE,
      index: true,
    },
    lastRebuiltAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Exactly one ledger cache entry per member per month
monthlyLedgerSchema.index({ memberId: 1, month: 1 }, { unique: true });

export const MonthlyLedger: Model<IMonthlyLedger> = mongoose.model<IMonthlyLedger>(
  'MonthlyLedger',
  monthlyLedgerSchema
);
export default MonthlyLedger;
