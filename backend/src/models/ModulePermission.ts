import mongoose, { Schema, Model } from 'mongoose';
import { IModulePermission } from '../types/models.js';

const modulePermissionSchema = new Schema<IModulePermission>(
  {
    roleOrDesignation: {
      type: String,
      required: [true, 'Role or Designation key is required'],
      unique: true,
      trim: true,
      index: true,
    },
    modules: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const ModulePermission: Model<IModulePermission> = mongoose.model<IModulePermission>(
  'ModulePermission',
  modulePermissionSchema
);
export default ModulePermission;
