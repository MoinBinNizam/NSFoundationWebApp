import { Types } from 'mongoose';
import { InvestmentProject } from '../models/InvestmentProject.js';
import { InvestmentReturn } from '../models/InvestmentReturn.js';
import { ProjectStatus } from '../types/models.js';

export interface ProfitSegment {
  segmentIndex: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  principal: number;
  annualRoiPercent: number;
  segmentProfit: number;
}

export interface SegmentedProfitCalculation {
  asOfDate: string; // YYYY-MM-DD
  originalPrincipal: number;
  totalPrincipalReturned: number;
  outstandingPrincipal: number;
  expectedAnnualRoiPercent: number;
  plannedStartDate: string;
  plannedEndDate: string | null;
  plannedDurationDays: number;
  isOverdue: boolean;
  overdueDays: number;
  expectedProfitAccrued: number;
  actualProfitReturned: number;
  expectedProfitOutstanding: number;
  totalReturnReceived: number;
  derivedStatus: ProjectStatus;
  segments: ProfitSegment[];
}

/**
 * Format a Date object to YYYY-MM-DD in Asia/Dhaka (+06:00) timezone
 */
export function toDhakaDateString(d: Date | string): string {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  // Shift to Dhaka UTC+6
  const utc = dateObj.getTime() + dateObj.getTimezoneOffset() * 60000;
  const dhakaTime = new Date(utc + 6 * 3600000);
  const y = dhakaTime.getUTCFullYear();
  const m = String(dhakaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dhakaTime.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Difference in calendar days between two YYYY-MM-DD strings
 */
export function getDaysBetween(startStr: string, endStr: string): number {
  if (startStr >= endStr) return 0;
  const d1 = new Date(`${startStr}T00:00:00Z`);
  const d2 = new Date(`${endStr}T00:00:00Z`);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Pure calculation function that accepts project data and returns array of transactions.
 * Enables deterministic testing without database dependencies.
 */
export function calculateSegmentedProfitFromData(input: {
  originalPrincipal: number;
  startDate: Date | string;
  maturityDate?: Date | string | null;
  expectedAnnualRoiPercent: number;
  returns: Array<{
    maturityDate: Date | string;
    principalReturned: number;
    actualProfit: number;
    actualLoss?: number;
    totalReturn?: number;
  }>;
  asOfDate?: Date | string;
}): SegmentedProfitCalculation {
  const originalPrincipal = Math.max(0, Number(input.originalPrincipal) || 0);
  const roiPercent = Math.max(0, Number(input.expectedAnnualRoiPercent) || 0);
  const startStr = toDhakaDateString(input.startDate);
  const maturityStr = input.maturityDate ? toDhakaDateString(input.maturityDate) : null;
  const asOfStr = input.asOfDate ? toDhakaDateString(input.asOfDate) : toDhakaDateString(new Date());

  // Sort returns chronologically
  const sortedReturns = [...input.returns].sort((a, b) => {
    const da = toDhakaDateString(a.maturityDate);
    const db = toDhakaDateString(b.maturityDate);
    return da.localeCompare(db);
  });

  const totalPrincipalReturnedAll = sortedReturns.reduce(
    (sum, r) => sum + (Number(r.principalReturned) || 0),
    0
  );
  const totalActualProfitAll = sortedReturns.reduce(
    (sum, r) => sum + (Number(r.actualProfit) || 0),
    0
  );
  const totalReturnReceivedAll = sortedReturns.reduce(
    (sum, r) => sum + (Number(r.totalReturn) || (Number(r.principalReturned) || 0) + (Number(r.actualProfit) || 0)),
    0
  );

  const segments: ProfitSegment[] = [];
  let currentPrincipal = originalPrincipal;
  let currentSegmentStart = startStr;
  let segmentIndex = 1;

  // Filter returns that have principal reduction up to asOfStr
  for (const ret of sortedReturns) {
    const returnDateStr = toDhakaDateString(ret.maturityDate);
    const pReturned = Math.max(0, Number(ret.principalReturned) || 0);

    // If this return is beyond asOfDate, stop segmenting
    if (returnDateStr > asOfStr) break;

    // If time elapsed and principal > 0, record a segment prior to this principal return
    if (returnDateStr > currentSegmentStart && currentPrincipal > 0) {
      const days = getDaysBetween(currentSegmentStart, returnDateStr);
      if (days > 0) {
        // Expected Profit = Principal * (ROI / 100) * (days / 365)
        const profit = currentPrincipal * (roiPercent / 100) * (days / 365);
        segments.push({
          segmentIndex: segmentIndex++,
          startDate: currentSegmentStart,
          endDate: returnDateStr,
          days,
          principal: currentPrincipal,
          annualRoiPercent: roiPercent,
          segmentProfit: Math.round(profit * 100) / 100,
        });
        currentSegmentStart = returnDateStr;
      }
    } else if (returnDateStr >= currentSegmentStart) {
      currentSegmentStart = returnDateStr;
    }

    // Principal is reduced by principalReturned only! (Profit returned does NOT reduce principal)
    currentPrincipal = Math.max(0, currentPrincipal - pReturned);
  }

  // Final segment from latest boundary to asOfStr
  if (asOfStr > currentSegmentStart && currentPrincipal > 0) {
    const days = getDaysBetween(currentSegmentStart, asOfStr);
    if (days > 0) {
      const profit = currentPrincipal * (roiPercent / 100) * (days / 365);
      segments.push({
        segmentIndex: segmentIndex++,
        startDate: currentSegmentStart,
        endDate: asOfStr,
        days,
        principal: currentPrincipal,
        annualRoiPercent: roiPercent,
        segmentProfit: Math.round(profit * 100) / 100,
      });
    }
  }

  const rawExpectedProfit = segments.reduce((sum, s) => sum + s.segmentProfit, 0);
  const expectedProfitAccrued = Math.round(rawExpectedProfit * 100) / 100;

  const outstandingPrincipal = Math.max(0, originalPrincipal - totalPrincipalReturnedAll);
  const expectedProfitOutstanding = Math.max(0, Math.round((expectedProfitAccrued - totalActualProfitAll) * 100) / 100);

  // Overdue calculation
  let isOverdue = false;
  let overdueDays = 0;
  let plannedDurationDays = 0;
  if (maturityStr) {
    plannedDurationDays = getDaysBetween(startStr, maturityStr);
    if (asOfStr > maturityStr && outstandingPrincipal > 0) {
      isOverdue = true;
      overdueDays = getDaysBetween(maturityStr, asOfStr);
    }
  }

  // Derived financial status
  let derivedStatus = ProjectStatus.ACTIVE;
  if (originalPrincipal === 0) {
    derivedStatus = ProjectStatus.PROPOSED;
  } else if (outstandingPrincipal === 0) {
    derivedStatus = ProjectStatus.FULLY_SETTLED;
  } else if (isOverdue) {
    derivedStatus = totalPrincipalReturnedAll > 0
      ? ProjectStatus.OVERDUE_PRINCIPAL
      : ProjectStatus.DURATION_COMPLETED;
  } else if (totalPrincipalReturnedAll > 0) {
    derivedStatus = ProjectStatus.PRINCIPAL_PARTIALLY_RETURNED;
  } else {
    derivedStatus = ProjectStatus.ACTIVE;
  }

  return {
    asOfDate: asOfStr,
    originalPrincipal,
    totalPrincipalReturned: totalPrincipalReturnedAll,
    outstandingPrincipal,
    expectedAnnualRoiPercent: roiPercent,
    plannedStartDate: startStr,
    plannedEndDate: maturityStr,
    plannedDurationDays,
    isOverdue,
    overdueDays,
    expectedProfitAccrued,
    actualProfitReturned: totalActualProfitAll,
    expectedProfitOutstanding,
    totalReturnReceived: totalReturnReceivedAll,
    derivedStatus,
    segments,
  };
}

export class InvestmentCalculationService {
  /**
   * Calculate segmented expected profit for a given project up to asOfDate.
   */
  static async calculateExpectedProfit(
    projectId: string | Types.ObjectId,
    asOfDate?: Date | string
  ): Promise<SegmentedProfitCalculation> {
    const project = await InvestmentProject.findById(projectId);
    if (!project) {
      throw new Error(`Investment project not found with ID '${projectId}'`);
    }

    const returns = await InvestmentReturn.find({ projectId: project._id }).sort({ maturityDate: 1 });

    const originalPrincipal = project.totalFunded > 0 ? project.totalFunded : project.targetPrincipal;
    const roi = project.expectedAnnualRoiPercent ?? project.expectedROI ?? 0;

    return calculateSegmentedProfitFromData({
      originalPrincipal,
      startDate: project.startDate,
      maturityDate: project.maturityDate,
      expectedAnnualRoiPercent: roi,
      returns: returns.map((r) => ({
        maturityDate: r.maturityDate,
        principalReturned: r.principalReturned,
        actualProfit: r.actualProfit,
        actualLoss: r.actualLoss,
        totalReturn: r.totalReturn,
      })),
      asOfDate,
    });
  }
}
