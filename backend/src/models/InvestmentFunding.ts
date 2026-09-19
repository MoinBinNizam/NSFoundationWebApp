import mongoose, { Schema, Model } from 'mongoose';
import { IInvestmentFunding } from '../types/models.js';

const investmentFundingSchema = new Schema<IInvestmentFunding>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'InvestmentProject',
      required: [true, 'Project reference is required'],
      index: true,
    },
    custodyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      required: [true, 'Supplying custody account is required (Moin or Samrat custody)'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Funding amount is required'],
      min: [0.01, 'Funding amount must be greater than 0'],
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    transactionRef: {
      type: String,
      trim: true,
    },
    custodyMovementId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyMovement',
    },
    fundedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User recording funding is required'],
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable funding events
  }
);

investmentFundingSchema.index({ projectId: 1, date: -1 });

export const InvestmentFunding: Model<IInvestmentFunding> = mongoose.model<IInvestmentFunding>(
  'InvestmentFunding',
  investmentFundingSchema
);
export default InvestmentFunding;
