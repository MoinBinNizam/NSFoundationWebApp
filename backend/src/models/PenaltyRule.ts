import mongoose, { Schema, Model } from 'mongoose';
import { IPenaltyRule } from '../types/models.js';

const penaltyRuleSchema = new Schema<IPenaltyRule>(
  {
    effectiveFrom: {
      type: String,
      required: [true, 'Effective from month (YYYY-MM) is required'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Effective month must be in YYYY-MM format'],
      index: true,
    },
    effectiveTo: {
      type: String,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Effective month must be in YYYY-MM format'],
      default: null,
    },
    ratePerShare: {
      type: Number,
      required: [true, 'Penalty rate per share is required (e.g. 20 or 40 BDT)'],
      min: [0, 'Penalty rate cannot be negative'],
    },
    graceDayOfMonth: {
      type: Number,
      required: [true, 'Grace day of month is required (e.g. 10 or 15)'],
      min: [1, 'Grace day must be between 1 and 31'],
      max: [31, 'Grace day must be between 1 and 31'],
      default: 10,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const PenaltyRule: Model<IPenaltyRule> = mongoose.model<IPenaltyRule>(
  'PenaltyRule',
  penaltyRuleSchema
);
export default PenaltyRule;
