import mongoose, { Schema, Model } from 'mongoose';
import { IReinvestment } from '../types/models.js';

const reinvestmentSchema = new Schema<IReinvestment>(
  {
    sourceProjectId: {
      type: Schema.Types.ObjectId,
      ref: 'InvestmentProject',
      required: [true, 'Source investment project is required'],
      index: true,
    },
    destinationProjectId: {
      type: Schema.Types.ObjectId,
      ref: 'InvestmentProject',
      required: [true, 'Destination investment project is required'],
      index: true,
    },
    walletAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      required: [true, 'Wallet/Holding custody account is required'],
      index: true,
    },
    reinvestedAmount: {
      type: Number,
      required: [true, 'Reinvested amount from wallet/project is required'],
      min: [0, 'Reinvested amount cannot be negative'],
    },
    newAccountantFunds: {
      type: Number,
      default: 0,
      min: [0, 'New accountant funds cannot be negative'],
    },
    newAccountantCustodyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      default: null,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Authorizing user is required'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable reinvestment chain record
  }
);

export const Reinvestment: Model<IReinvestment> = mongoose.model<IReinvestment>(
  'Reinvestment',
  reinvestmentSchema
);
export default Reinvestment;
