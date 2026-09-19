import mongoose, { Schema, Model } from 'mongoose';
import { IGatewayRate, CustodyChannel } from '../types/models.js';

const gatewayRateSchema = new Schema<IGatewayRate>(
  {
    channel: {
      type: String,
      enum: Object.values(CustodyChannel),
      required: [true, 'Payment gateway/channel is required'],
      index: true,
    },
    cashoutRatePercentage: {
      type: Number,
      required: [true, 'Cashout rate percentage is required (e.g. 1.85)'],
      min: [0, 'Rate cannot be negative'],
      default: 0,
    },
    fixedFee: {
      type: Number,
      default: 0,
      min: [0, 'Fixed fee cannot be negative'],
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
      required: true,
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

export const GatewayRate: Model<IGatewayRate> = mongoose.model<IGatewayRate>(
  'GatewayRate',
  gatewayRateSchema
);
export default GatewayRate;
