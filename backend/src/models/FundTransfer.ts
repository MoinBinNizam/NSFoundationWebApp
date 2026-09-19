import mongoose, { Schema, Model } from 'mongoose';
import { IFundTransfer } from '../types/models.js';

const fundTransferSchema = new Schema<IFundTransfer>(
  {
    transferNumber: {
      type: String,
      required: [true, 'Transfer number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    sourceAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      required: [true, 'Source custody account is required'],
      index: true,
    },
    destinationAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      required: [true, 'Destination custody account is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Transfer amount is required'],
      min: [0.01, 'Transfer amount must be greater than 0'],
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      trim: true,
    },
    outMovementId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyMovement',
    },
    inMovementId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyMovement',
    },
    transferredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User authorizing/executing transfer is required'],
    },
  },
  {
    timestamps: true,
  }
);

export const FundTransfer: Model<IFundTransfer> = mongoose.model<IFundTransfer>(
  'FundTransfer',
  fundTransferSchema
);
export default FundTransfer;
