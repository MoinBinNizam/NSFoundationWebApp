import mongoose, { Schema, Model } from 'mongoose';
import { IAuditLog } from '../types/models.js';

const auditLogSchema = new Schema<IAuditLog>(
  {
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
    beforeState: {
      type: Schema.Types.Mixed,
      default: null,
    },
    afterState: {
      type: Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable audit log
  }
);

auditLogSchema.index({ entityName: 1, entityId: 1, createdAt: -1 });

export const AuditLog: Model<IAuditLog> = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
export default AuditLog;
