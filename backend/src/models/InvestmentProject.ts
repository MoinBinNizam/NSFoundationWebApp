import mongoose, { Schema, Model } from 'mongoose';
import { IInvestmentProject, ProjectStatus } from '../types/models.js';

const investmentProjectSchema = new Schema<IInvestmentProject>(
  {
    projectId: {
      type: String,
      required: [true, 'Project ID is required (e.g. PRJ-001)'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Project start date is required'],
      index: true,
    },
    plannedDuration: {
      type: String,
      trim: true,
    },
    maturityDate: {
      type: Date,
      index: true,
    },
    expectedAnnualRoiPercent: {
      type: Number,
      min: [0, 'Expected annual ROI percent cannot be negative'],
    },
    expectedROI: {
      type: Number,
      min: [0, 'Expected ROI cannot be negative'],
    },
    targetPrincipal: {
      type: Number,
      required: [true, 'Target principal is required'],
      min: [0, 'Target principal cannot be negative'],
    },
    totalFunded: {
      type: Number,
      default: 0,
      min: [0, 'Total funded cannot be negative'],
    },
    status: {
      type: String,
      enum: Object.values(ProjectStatus),
      default: ProjectStatus.PROPOSED,
      index: true,
    },
    externalEntity: {
      type: String,
      trim: true, // e.g. "GrowUp", "Zayan", "Hungry Birds Barisal"
      index: true,
    },
    invoiceNo: {
      type: String,
      trim: true,
      index: true,
    },
    invoiceTo: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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

export const InvestmentProject: Model<IInvestmentProject> = mongoose.model<IInvestmentProject>(
  'InvestmentProject',
  investmentProjectSchema
);
export default InvestmentProject;
