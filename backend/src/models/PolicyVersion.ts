import mongoose, { Schema, Model } from 'mongoose';
import { IPolicyVersion } from '../types/models.js';

const policyVersionSchema = new Schema<IPolicyVersion>(
  {
    policyId: {
      type: Schema.Types.ObjectId,
      ref: 'Policy',
      required: [true, 'Policy reference is required'],
      index: true,
    },
    versionNumber: {
      type: Number,
      required: [true, 'Version number is required'],
    },
    content: {
      type: String,
      required: [true, 'Policy version content is required'],
    },
    changeReason: {
      type: String,
      trim: true,
    },
    modifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable version history
  }
);

policyVersionSchema.index({ policyId: 1, versionNumber: -1 }, { unique: true });

export const PolicyVersion: Model<IPolicyVersion> = mongoose.model<IPolicyVersion>(
  'PolicyVersion',
  policyVersionSchema
);
export default PolicyVersion;
