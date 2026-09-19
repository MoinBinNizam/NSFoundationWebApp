import mongoose, { Schema, Model } from 'mongoose';
import { IMemberYearAccount } from '../types/models.js';

const memberYearAccountSchema = new Schema<IMemberYearAccount>(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required'],
      index: true,
    },
    year: {
      type: Number,
      required: [true, 'Accounting year is required'],
      min: [2020, 'Year must be valid'],
      index: true,
    },
    finalShares: {
      type: Number,
      required: [true, 'Closing/final shares count for the year is required'],
      min: [0, 'Shares cannot be negative'],
    },
    annualObligation: {
      type: Number,
      required: [true, 'Annual principal obligation is required'],
      min: [0, 'Obligation cannot be negative'],
    },
    totalPrincipalPaid: {
      type: Number,
      default: 0,
      min: [0, 'Paid principal cannot be negative'],
    },
    shortfall: {
      type: Number,
      default: 0,
      min: [0, 'Shortfall cannot be negative'],
    },
    excessAdvance: {
      type: Number,
      default: 0,
      min: [0, 'Advance credit cannot be negative'],
    },
    isSettled: {
      type: Boolean,
      default: false,
      index: true,
    },
    settledAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// One reconciliation record per member per year
memberYearAccountSchema.index({ memberId: 1, year: 1 }, { unique: true });

export const MemberYearAccount: Model<IMemberYearAccount> = mongoose.model<IMemberYearAccount>(
  'MemberYearAccount',
  memberYearAccountSchema
);
export default MemberYearAccount;
