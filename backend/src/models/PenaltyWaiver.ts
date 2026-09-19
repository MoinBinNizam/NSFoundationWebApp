import mongoose, { Schema, Model } from 'mongoose';
import { IPenaltyWaiver } from '../types/models.js';

const penaltyWaiverSchema = new Schema<IPenaltyWaiver>(
  {
    month: {
      type: String,
      required: [true, 'Target month (YYYY-MM) is required'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Target month must be in YYYY-MM format'],
      index: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      default: null,
      index: true,
    },
    isGlobal: {
      type: Boolean,
      default: false,
      index: true,
    },
    reason: {
      type: String,
      required: [true, 'Reason for penalty waiver is required'],
      trim: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Approving user is required'],
    },
  },
  {
    timestamps: true,
  }
);

export const PenaltyWaiver: Model<IPenaltyWaiver> = mongoose.model<IPenaltyWaiver>(
  'PenaltyWaiver',
  penaltyWaiverSchema
);
export default PenaltyWaiver;
