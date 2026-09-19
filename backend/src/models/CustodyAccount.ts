import mongoose, { Schema, Model } from 'mongoose';
import { ICustodyAccount, AccountType, CustodyChannel } from '../types/models.js';

const custodyAccountSchema = new Schema<ICustodyAccount>(
  {
    name: {
      type: String,
      required: [true, 'Custody account name is required (e.g. Moin Islami Bank, Samrat Nagad)'],
      trim: true,
      unique: true,
      index: true,
    },
    accountType: {
      type: String,
      enum: Object.values(AccountType),
      required: true,
      index: true,
    },
    holderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    channel: {
      type: String,
      enum: Object.values(CustodyChannel),
      required: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    cachedBalance: {
      type: Number,
      default: 0,
      // Cached projection from CustodyMovement ledger
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
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

export const CustodyAccount: Model<ICustodyAccount> = mongoose.model<ICustodyAccount>(
  'CustodyAccount',
  custodyAccountSchema
);
export default CustodyAccount;
