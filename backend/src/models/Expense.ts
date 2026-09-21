import mongoose, { Schema, Model } from 'mongoose';
import { IExpense } from '../types/models.js';

const expenseSchema = new Schema<IExpense>(
  {
    expenseNumber: {
      type: String,
      required: [true, 'Expense reference number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    custodyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      required: [true, 'Custody account paying the expense is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Expense amount is required'],
      min: [0.01, 'Expense amount must be greater than 0'],
    },
    category: {
      type: String,
      required: [true, 'Expense category is required'],
      trim: true,
      index: true,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Expense description is required'],
      trim: true,
    },
    custodyMovementId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyMovement',
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User recording the expense is required'],
    },
    receiptUrl: {
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

expenseSchema.index({ custodyAccountId: 1, date: -1 });

export const Expense: Model<IExpense> = mongoose.model<IExpense>('Expense', expenseSchema);
export default Expense;
