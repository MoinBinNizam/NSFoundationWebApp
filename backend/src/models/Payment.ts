import mongoose, { Schema, Model } from 'mongoose';
import { IPayment, PaymentMethod, PaymentStatus } from '../types/models.js';

const paymentSchema = new Schema<IPayment>(
  {
    receiptNumber: {
      type: String,
      required: [true, 'Receipt number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required'],
      index: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver (Accountant) reference is required'],
      index: true,
    },
    custodyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      required: [true, 'Destination custody account is required'],
      index: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total paid amount is required'],
      min: [1, 'Payment total must be greater than 0'],
    },
    principalAmount: {
      type: Number,
      default: 0,
      min: [0, 'Principal cannot be negative'],
    },
    penaltyAmount: {
      type: Number,
      default: 0,
      min: [0, 'Penalty cannot be negative'],
    },
    cashoutCharge: {
      type: Number,
      default: 0,
      min: [0, 'Cashout charge cannot be negative'],
    },
    unpaidCashoutCharge: {
      type: Number,
      default: 0,
      min: [0, 'Unpaid cashout charge cannot be negative'],
    },
    advanceAmount: {
      type: Number,
      default: 0,
      min: [0, 'Advance cannot be negative'],
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: [true, 'Payment method is required'],
    },
    transactionReference: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.COLLECTED,
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

paymentSchema.index({ memberId: 1, paymentDate: -1 });

export const Payment: Model<IPayment> = mongoose.model<IPayment>('Payment', paymentSchema);
export default Payment;
