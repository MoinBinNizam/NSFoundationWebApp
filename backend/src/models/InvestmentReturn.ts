import mongoose, { Schema, Model } from 'mongoose';
import { IInvestmentReturn, ReturnDestinationType } from '../types/models.js';

const investmentReturnSchema = new Schema<IInvestmentReturn>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'InvestmentProject',
      required: [true, 'Project reference is required'],
      index: true,
    },
    maturityDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    principalReturned: {
      type: Number,
      default: 0,
      min: [0, 'Principal returned cannot be negative'],
    },
    actualProfit: {
      type: Number,
      default: 0,
      min: [0, 'Actual profit cannot be negative'],
    },
    actualLoss: {
      type: Number,
      default: 0,
      min: [0, 'Actual loss cannot be negative'],
    },
    totalReturn: {
      type: Number,
      required: [true, 'Total return amount is required'],
    },
    destinationType: {
      type: String,
      enum: Object.values(ReturnDestinationType),
      required: true,
      index: true,
    },
    destinationCustodyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      default: null,
      index: true,
    },
    custodyMovementId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyMovement',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User recording return is required'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable return records
  }
);

investmentReturnSchema.index({ projectId: 1, maturityDate: -1 });

export const InvestmentReturn: Model<IInvestmentReturn> = mongoose.model<IInvestmentReturn>(
  'InvestmentReturn',
  investmentReturnSchema
);
export default InvestmentReturn;
