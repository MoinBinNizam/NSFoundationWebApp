import mongoose, { Schema, Model } from 'mongoose';
import {
  ICustodyMovement,
  MovementType,
  MovementSourceType,
} from '../types/models.js';

const custodyMovementSchema = new Schema<ICustodyMovement>(
  {
    custodyAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'CustodyAccount',
      required: [true, 'Custody account reference is required'],
      index: true,
    },
    movementType: {
      type: String,
      enum: Object.values(MovementType),
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Movement amount is required'],
      min: [0.01, 'Movement amount must be greater than 0'],
    },
    sourceType: {
      type: String,
      enum: Object.values(MovementSourceType),
      required: true,
      index: true,
    },
    sourceRefId: {
      type: Schema.Types.ObjectId,
      default: null,
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
      trim: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User performing the movement is required'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable financial ledger
  }
);

custodyMovementSchema.index({ custodyAccountId: 1, date: -1 });

export const CustodyMovement: Model<ICustodyMovement> = mongoose.model<ICustodyMovement>(
  'CustodyMovement',
  custodyMovementSchema
);
export default CustodyMovement;
