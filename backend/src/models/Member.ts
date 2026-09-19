import mongoose, { Schema, Model } from 'mongoose';
import { IMember, MemberStatus } from '../types/models.js';

const memberSchema = new Schema<IMember>(
  {
    memberId: {
      type: String,
      required: [true, 'Member ID is required (e.g. NS-001)'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Member name is required'],
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Member phone number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: Object.values(MemberStatus),
      default: MemberStatus.ACTIVE,
      index: true,
    },
    joinDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    address: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    cashoutDue: {
      type: Number,
      default: 0,
      min: [0, 'Cash out due cannot be negative'],
    },
  },
  {
    timestamps: true,
  }
);

export const Member: Model<IMember> = mongoose.model<IMember>('Member', memberSchema);
export default Member;
