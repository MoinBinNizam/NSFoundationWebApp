import mongoose, { Schema, Model } from 'mongoose';
import { IMemberDistribution } from '../types/models.js';

const memberDistributionSchema = new Schema<IMemberDistribution>(
  {
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'DistributionBatch',
      required: [true, 'Distribution batch reference is required'],
      index: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required'],
      index: true,
    },
    memberCode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    memberName: {
      type: String,
      required: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    finalShares: {
      type: Number,
      required: true,
      min: 0,
    },
    shareRatio: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    grossEntitlement: {
      type: Number,
      required: true,
      min: 0,
    },
    shortfallDeduction: {
      type: Number,
      default: 0,
      min: 0,
    },
    advanceCredit: {
      type: Number,
      default: 0,
      min: 0,
    },
    penaltyAdjustment: {
      type: Number,
      default: 0,
    },
    netDistributionAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'REVERSED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    custodyMovementId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyMovement',
      index: true,
    },
    paidAt: {
      type: Date,
    },
    paymentReference: {
      type: String,
      trim: true,
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

memberDistributionSchema.index({ batchId: 1, memberId: 1 }, { unique: true });
memberDistributionSchema.index({ year: 1, memberId: 1 });

export const MemberDistribution: Model<IMemberDistribution> = mongoose.model<IMemberDistribution>(
  'MemberDistribution',
  memberDistributionSchema
);
export default MemberDistribution;
