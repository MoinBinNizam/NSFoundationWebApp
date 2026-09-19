import mongoose, { Schema, Model } from 'mongoose';
import { ISystemConfig } from '../types/models.js';

const systemConfigSchema = new Schema<ISystemConfig>(
  {
    key: {
      type: String,
      required: [true, 'Configuration key is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: [true, 'Configuration value is required'],
    },
    effectiveFrom: {
      type: Date,
    },
    effectiveTo: {
      type: Date,
    },
    description: {
      type: String,
      trim: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export const SystemConfig: Model<ISystemConfig> = mongoose.model<ISystemConfig>(
  'SystemConfig',
  systemConfigSchema
);
export default SystemConfig;
