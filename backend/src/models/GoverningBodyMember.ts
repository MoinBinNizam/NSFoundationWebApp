import mongoose, { Schema, Model, Types } from 'mongoose';

export interface IGoverningBodyMember {
  _id: Types.ObjectId;
  memberId: Types.ObjectId; // Reference to Member
  role: string; // e.g. 'DIRECTOR', 'PRESIDENT', 'ACCOUNTANT', etc.
  titleEn: string;
  titleBn: string;
  responsibilitiesEn?: string;
  responsibilitiesBn?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'FORMER';
  order: number;
  termStart?: Date;
  termEnd?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const governingBodyMemberSchema = new Schema<IGoverningBodyMember>(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required'],
      index: true,
    },
    role: {
      type: String,
      required: [true, 'Executive role is required'],
      trim: true,
      index: true,
    },
    titleEn: {
      type: String,
      required: [true, 'English title is required'],
      trim: true,
    },
    titleBn: {
      type: String,
      required: [true, 'Bengali title is required'],
      trim: true,
    },
    responsibilitiesEn: {
      type: String,
      trim: true,
      default: '',
    },
    responsibilitiesBn: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'FORMER'],
      default: 'ACTIVE',
      index: true,
    },
    order: {
      type: Number,
      default: 1,
      index: true,
    },
    termStart: {
      type: Date,
      default: Date.now,
    },
    termEnd: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

governingBodyMemberSchema.index({ order: 1, status: 1 });

export const GoverningBodyMember: Model<IGoverningBodyMember> =
  mongoose.models.GoverningBodyMember ||
  mongoose.model<IGoverningBodyMember>('GoverningBodyMember', governingBodyMemberSchema);

export default GoverningBodyMember;
