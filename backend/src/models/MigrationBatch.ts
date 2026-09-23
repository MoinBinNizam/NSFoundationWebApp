import { Schema, Model, Types, model } from 'mongoose';

export interface IMigrationBatch {
  name: string;
  sourceYear: number;
  sourceMonth?: string;
  sourceSheet?: string;
  sourceReference: string;
  createdBy: Types.ObjectId;
  totalRows: number;
  verifiedRows: number;
  reviewRows: number;
  unresolvedRows: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IMigrationBatch>({
  name: { type: String, required: true, trim: true },
  sourceYear: { type: Number, required: true, min: 2000, max: 2100, index: true },
  sourceMonth: { type: String, trim: true, match: /^$|^\d{4}-(0[1-9]|1[0-2])$/ },
  sourceSheet: { type: String, trim: true },
  sourceReference: { type: String, required: true, trim: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  totalRows: { type: Number, default: 0, min: 0 },
  verifiedRows: { type: Number, default: 0, min: 0 },
  reviewRows: { type: Number, default: 0, min: 0 },
  unresolvedRows: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

schema.index({ sourceReference: 1, createdAt: -1 });
export const MigrationBatch: Model<IMigrationBatch> = model<IMigrationBatch>('MigrationBatch', schema);
