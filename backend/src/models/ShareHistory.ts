import mongoose, { Schema, Model } from 'mongoose';
import { IShareHistory, ShareEventType } from '../types/models.js';

const shareHistorySchema = new Schema<IShareHistory>(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required'],
      index: true,
    },
    effectiveMonth: {
      type: String,
      required: [true, 'Effective month (YYYY-MM) is required'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Effective month must be in YYYY-MM format'],
      index: true,
    },
    shareCount: {
      type: Number,
      required: [true, 'Share count is required'],
      min: [1, 'Share count must be at least 1'],
    },
    previousShareCount: {
      type: Number,
      required: [true, 'Previous share count is required'],
      min: [0, 'Previous share count cannot be negative'],
    },
    eventType: {
      type: String,
      enum: Object.values(ShareEventType),
      required: true,
      index: true,
    },
    transferDetails: {
      fromMemberId: {
        type: Schema.Types.ObjectId,
        ref: 'Member',
      },
      toMemberId: {
        type: Schema.Types.ObjectId,
        ref: 'Member',
      },
      transferNote: {
        type: String,
        trim: true,
      },
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who made this change is required'],
    },
    isAdministrativeOverride: {
      type: Boolean,
      default: false,
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

// Compound index for history lookup per member by month
shareHistorySchema.index({ memberId: 1, effectiveMonth: -1 });

// Pre-validate & pre-save validation hooks enforcing post-2024 share lock
shareHistorySchema.pre('validate', function (next) {
  if (
    this.eventType === ShareEventType.TEMPORARY_CHANGE &&
    this.effectiveMonth >= '2025-01' &&
    !this.isAdministrativeOverride
  ) {
    const err = new Error(
      `Business Rule Violation: Normal share adjustments are permanently locked starting from January 2025 (effectiveMonth: ${this.effectiveMonth}). Post-2024 modifications require TRANSFER or authorized administrative override.`
    );
    return next(err);
  }
  next();
});

shareHistorySchema.pre('save', function (next) {
  if (
    this.eventType === ShareEventType.TEMPORARY_CHANGE &&
    this.effectiveMonth >= '2025-01' &&
    !this.isAdministrativeOverride
  ) {
    const err = new Error(
      `Business Rule Violation: Normal share adjustments are permanently locked starting from January 2025 (effectiveMonth: ${this.effectiveMonth}). Post-2024 modifications require TRANSFER or authorized administrative override.`
    );
    return next(err);
  }
  next();
});

export const ShareHistory: Model<IShareHistory> = mongoose.model<IShareHistory>(
  'ShareHistory',
  shareHistorySchema
);
export default ShareHistory;
