import { Schema, Model, Types, model } from 'mongoose';
import { MigrationRecordStatus } from '../types/models.js';

export interface IMigrationRecord {
  batchId: Types.ObjectId;
  rowNumber: number;
  recordType: 'MEMBER' | 'PAYMENT' | 'EXPENSE' | 'INVESTMENT_RETURN' | 'CUSTODY_MOVEMENT';
  status: MigrationRecordStatus;
  sourceYear: number;
  sourceMonth?: string;
  sourceSheet?: string;
  sourceRow: number;
  sourceReference: string;
  rawData: Record<string, string>;
  normalizedData: Record<string, unknown>;
  validationErrors: string[];
  duplicateOf?: string;
  reviewReason?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IMigrationRecord>({
  batchId: { type: Schema.Types.ObjectId, ref: 'MigrationBatch', required: true, index: true },
  rowNumber: { type: Number, required: true, min: 1 },
  recordType: { type: String, required: true, enum: ['MEMBER', 'PAYMENT', 'EXPENSE', 'INVESTMENT_RETURN', 'CUSTODY_MOVEMENT'], index: true },
  status: { type: String, required: true, enum: Object.values(MigrationRecordStatus), index: true },
  sourceYear: { type: Number, required: true, min: 2000, max: 2100 },
  sourceMonth: { type: String, trim: true }, sourceSheet: { type: String, trim: true }, sourceRow: { type: Number, required: true, min: 1 },
  sourceReference: { type: String, required: true, trim: true, index: true },
  rawData: { type: Schema.Types.Mixed, required: true }, normalizedData: { type: Schema.Types.Mixed, required: true },
  validationErrors: { type: [String], default: [] }, duplicateOf: { type: String, trim: true }, reviewReason: { type: String, trim: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }, reviewedAt: { type: Date },
}, { timestamps: true });

schema.index({ batchId: 1, rowNumber: 1 }, { unique: true });
schema.index({ sourceReference: 1, recordType: 1 });
export const MigrationRecord: Model<IMigrationRecord> = model<IMigrationRecord>('MigrationRecord', schema);
