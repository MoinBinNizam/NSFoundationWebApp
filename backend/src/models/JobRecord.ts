import mongoose, { Schema, Document } from 'mongoose';
import { JobType, JobStatus, IJobRecord } from '../types/jobs.js';

export interface JobRecordDocument extends Omit<IJobRecord, 'createdAt' | 'updatedAt'>, Document {}

const JobRecordSchema = new Schema<JobRecordDocument>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(JobType),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.QUEUED,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    progressMessage: {
      type: String,
    },
    result: {
      type: Schema.Types.Mixed,
    },
    error: {
      message: { type: String },
      code: { type: String },
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    correlationId: {
      type: String,
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    workerId: {
      type: String,
    },
    queuedAt: {
      type: Date,
      default: Date.now,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    nextRunAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient worker polling
JobRecordSchema.index({ status: 1, nextRunAt: 1 });
JobRecordSchema.index({ type: 1, createdAt: -1 });

export const JobRecord = mongoose.model<JobRecordDocument>('JobRecord', JobRecordSchema);
export default JobRecord;
