import mongoose, { Schema, Model } from 'mongoose';
import { IPaymentAllocation, AllocationType } from '../types/models.js';

const paymentAllocationSchema = new Schema<IPaymentAllocation>(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      required: [true, 'Payment reference is required'],
      index: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required'],
      index: true,
    },
    targetMonth: {
      type: String,
      required: [true, 'Target month (YYYY-MM) is required'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Target month must be in YYYY-MM format'],
      index: true,
    },
    allocationType: {
      type: String,
      enum: Object.values(AllocationType),
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Allocation amount must be greater than 0'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable allocation line items
  }
);

paymentAllocationSchema.index({ memberId: 1, targetMonth: 1 });

export const PaymentAllocation: Model<IPaymentAllocation> = mongoose.model<IPaymentAllocation>(
  'PaymentAllocation',
  paymentAllocationSchema
);
export default PaymentAllocation;
