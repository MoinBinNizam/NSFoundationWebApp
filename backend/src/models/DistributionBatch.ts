import mongoose, { Schema, Model } from 'mongoose';
import {
  IDistributionBatch,
  DistributionBatchStatus,
  DistributionBasis,
} from '../types/models.js';

const distributionBatchSchema = new Schema<IDistributionBatch>(
  {
    batchNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    year: {
      type: Number,
      required: [true, 'Accounting year is required'],
      min: [2020, 'Year must be at least 2020'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Batch title is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(DistributionBatchStatus),
      default: DistributionBatchStatus.DRAFT,
      required: true,
      index: true,
    },
    basis: {
      type: String,
      enum: Object.values(DistributionBasis),
      default: DistributionBasis.FINALIZED_SHARES,
      required: true,
    },
    totalPool: {
      type: Number,
      required: true,
      min: 0,
    },
    totalPrincipalReturned: {
      type: Number,
      default: 0,
      min: 0,
    },
    netRealizedProfit: {
      type: Number,
      default: 0,
    },
    totalExpenses: {
      type: Number,
      default: 0,
      min: 0,
    },
    retainedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    distributableAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalShares: {
      type: Number,
      required: true,
      min: 1,
    },
    amountPerShare: {
      type: Number,
      required: true,
      min: 0,
    },
    memberCount: {
      type: Number,
      required: true,
      min: 1,
    },
    custodyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      index: true,
    },
    preparedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    paidBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    paidAt: {
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

distributionBatchSchema.index({ year: 1, status: 1 });

export const DistributionBatch: Model<IDistributionBatch> = mongoose.model<IDistributionBatch>(
  'DistributionBatch',
  distributionBatchSchema
);
export default DistributionBatch;
