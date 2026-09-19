import mongoose, { Schema, Model } from 'mongoose';
import { IPolicy } from '../types/models.js';

const policySchema = new Schema<IPolicy>(
  {
    serialNumber: {
      type: Number,
      required: [true, 'Policy serial number is required'],
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Policy title is required'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Policy content is required'],
    },
    category: {
      type: String,
      required: [true, 'Policy category is required'],
      trim: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    currentVersion: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Policy: Model<IPolicy> = mongoose.model<IPolicy>('Policy', policySchema);
export default Policy;
