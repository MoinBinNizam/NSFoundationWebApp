import { Schema, Model, Types, model } from 'mongoose';

export interface IIdempotencyKey {
  actorId: Types.ObjectId;
  operation: string;
  key: string;
  status: 'PENDING' | 'COMPLETED';
  responseStatus?: number;
  responseBody?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IIdempotencyKey>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  operation: { type: String, required: true, trim: true },
  key: { type: String, required: true, trim: true, minlength: 16, maxlength: 200 },
  status: { type: String, required: true, enum: ['PENDING', 'COMPLETED'], default: 'PENDING' },
  responseStatus: { type: Number }, responseBody: { type: Schema.Types.Mixed },
}, { timestamps: true });
schema.index({ actorId: 1, operation: 1, key: 1 }, { unique: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const IdempotencyKey: Model<IIdempotencyKey> = model<IIdempotencyKey>('IdempotencyKey', schema);
