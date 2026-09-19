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
    },
    maturityDate: {
      type: Date,
    },
    expectedROI: {
      type: Number,
      // Stored separately from actual profit/return
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
      trim: true, // e.g. "GrowUp", "Zayan"
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
