import { describe, it, expect } from 'vitest';
import {
  calculateSegmentedProfitFromData,
  toDhakaDateString,
  getDaysBetween,
} from '../services/investment-calculation.service.js';
import { ProjectStatus } from '../types/models.js';

describe('Investment Calculation Service — Business Rules & Scenarios', () => {
  it('TEST 27 & TEST 26: Calculates profit using project-specific ROI without hardcoding 40%', () => {
    // Project with 25% ROI
    const calc25 = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      expectedAnnualRoiPercent: 25,
      returns: [],
      asOfDate: '2027-01-01', // exactly 365 days
    });
    expect(calc25.expectedAnnualRoiPercent).toBe(25);
    // 100,000 * 25% * 365/365 = 25,000
    expect(calc25.expectedProfitAccrued).toBe(25000);

    // Project with 60% ROI
    const calc60 = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      expectedAnnualRoiPercent: 60,
      returns: [],
      asOfDate: '2027-01-01',
    });
    expect(calc60.expectedAnnualRoiPercent).toBe(60);
    // 100,000 * 60% * 365/365 = 60,000
    expect(calc60.expectedProfitAccrued).toBe(60000);
  });

  it('TEST 1: Full principal + full profit returned in one transaction', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-07-01',
      expectedAnnualRoiPercent: 40,
      returns: [
        {
          maturityDate: '2026-07-01',
          principalReturned: 100000,
          actualProfit: 20000,
        },
      ],
      asOfDate: '2026-07-01',
    });

    expect(calc.outstandingPrincipal).toBe(0);
    expect(calc.totalPrincipalReturned).toBe(100000);
    expect(calc.actualProfitReturned).toBe(20000);
    expect(calc.derivedStatus).toBe(ProjectStatus.FULLY_SETTLED);
  });

  it('TEST 2: Profit returned only; principal remains outstanding and profit return does not reduce principal', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-07-01',
      expectedAnnualRoiPercent: 40,
      returns: [
        {
          maturityDate: '2026-04-01',
          principalReturned: 0,
          actualProfit: 10000,
        },
      ],
      asOfDate: '2026-04-01',
    });

    // Profit returned does NOT reduce principal
    expect(calc.outstandingPrincipal).toBe(100000);
    expect(calc.actualProfitReturned).toBe(10000);
    expect(calc.totalPrincipalReturned).toBe(0);
    expect(calc.derivedStatus).toBe(ProjectStatus.ACTIVE);
  });

  it('TEST 3: Principal returned partially', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-07-01',
      expectedAnnualRoiPercent: 40,
      returns: [
        {
          maturityDate: '2026-04-01',
          principalReturned: 30000,
          actualProfit: 0,
        },
      ],
      asOfDate: '2026-04-01',
    });

    expect(calc.totalPrincipalReturned).toBe(30000);
    expect(calc.outstandingPrincipal).toBe(70000);
    expect(calc.derivedStatus).toBe(ProjectStatus.PRINCIPAL_PARTIALLY_RETURNED);
  });

  it('TEST 4: Principal returned in multiple transactions', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-12-31',
      expectedAnnualRoiPercent: 40,
      returns: [
        { maturityDate: '2026-03-01', principalReturned: 20000, actualProfit: 0 },
        { maturityDate: '2026-06-01', principalReturned: 30000, actualProfit: 0 },
      ],
      asOfDate: '2026-06-01',
    });

    expect(calc.totalPrincipalReturned).toBe(50000);
    expect(calc.outstandingPrincipal).toBe(50000);
    expect(calc.derivedStatus).toBe(ProjectStatus.PRINCIPAL_PARTIALLY_RETURNED);
  });

  it('TEST 5: Profit returned in multiple transactions', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-12-31',
      expectedAnnualRoiPercent: 40,
      returns: [
        { maturityDate: '2026-03-01', principalReturned: 0, actualProfit: 5000 },
        { maturityDate: '2026-06-01', principalReturned: 0, actualProfit: 7000 },
      ],
      asOfDate: '2026-06-01',
    });

    expect(calc.actualProfitReturned).toBe(12000);
    expect(calc.outstandingPrincipal).toBe(100000);
  });

  it('TEST 6: Principal and profit returned together in multiple transactions', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-12-31',
      expectedAnnualRoiPercent: 40,
      returns: [
        { maturityDate: '2026-03-01', principalReturned: 20000, actualProfit: 5000 },
        { maturityDate: '2026-06-01', principalReturned: 30000, actualProfit: 8000 },
      ],
      asOfDate: '2026-06-01',
    });

    expect(calc.totalPrincipalReturned).toBe(50000);
    expect(calc.outstandingPrincipal).toBe(50000);
    expect(calc.actualProfitReturned).toBe(13000);
    expect(calc.totalReturnReceived).toBe(63000);
  });

  it('TEST 7 & TEST 8: Principal remains outstanding and expected profit continues after planned duration', () => {
    // 181 days from 2026-01-01 to 2026-07-01
    // As of date is 2026-09-01 (62 days beyond planned end date)
    const calcPlanned = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-07-01',
      expectedAnnualRoiPercent: 40,
      returns: [],
      asOfDate: '2026-07-01',
    });

    const calcOverdue = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-07-01',
      expectedAnnualRoiPercent: 40,
      returns: [],
      asOfDate: '2026-09-01',
    });

    expect(calcOverdue.isOverdue).toBe(true);
    expect(calcOverdue.overdueDays).toBe(62);
    // Profit must continue accruing
    expect(calcOverdue.expectedProfitAccrued).toBeGreaterThan(calcPlanned.expectedProfitAccrued);
    expect(calcOverdue.derivedStatus).toBe(ProjectStatus.DURATION_COMPLETED);
  });

  it('TEST 9 & TEST 10: Date-sensitive segmentation recalculates expected profit on reduced principal', () => {
    // Scenario from Specification Section 28 & 44:
    // Initial: 100,000, ROI 40%
    // 2026-01-01 to 2026-08-01: Principal = 100,000
    // 2026-08-01: Return 30,000 principal
    // 2026-08-01 to 2026-09-15: Principal = 70,000
    // 2026-09-15: Return 20,000 principal
    // 2026-09-15 to 2026-10-01: Principal = 50,000
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-07-01',
      expectedAnnualRoiPercent: 40,
      returns: [
        { maturityDate: '2026-08-01', principalReturned: 30000, actualProfit: 5000 },
        { maturityDate: '2026-09-15', principalReturned: 20000, actualProfit: 8000 },
      ],
      asOfDate: '2026-10-01',
    });

    expect(calc.outstandingPrincipal).toBe(50000);
    expect(calc.totalPrincipalReturned).toBe(50000);
    expect(calc.segments.length).toBe(3);

    // Segment 1: 2026-01-01 -> 2026-08-01 with 100,000 principal
    expect(calc.segments[0].principal).toBe(100000);
    expect(calc.segments[0].startDate).toBe('2026-01-01');
    expect(calc.segments[0].endDate).toBe('2026-08-01');

    // Segment 2: 2026-08-01 -> 2026-09-15 with 70,000 principal
    expect(calc.segments[1].principal).toBe(70000);
    expect(calc.segments[1].startDate).toBe('2026-08-01');
    expect(calc.segments[1].endDate).toBe('2026-09-15');

    // Segment 3: 2026-09-15 -> 2026-10-01 with 50,000 principal
    expect(calc.segments[2].principal).toBe(50000);
    expect(calc.segments[2].startDate).toBe('2026-09-15');
    expect(calc.segments[2].endDate).toBe('2026-10-01');

    expect(calc.derivedStatus).toBe(ProjectStatus.OVERDUE_PRINCIPAL);
  });

  it('TEST 11: Principal fully returned before planned duration stops profit accrual', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-12-31',
      expectedAnnualRoiPercent: 40,
      returns: [
        { maturityDate: '2026-06-01', principalReturned: 100000, actualProfit: 16000 },
      ],
      asOfDate: '2026-12-31', // 6 months later
    });

    expect(calc.outstandingPrincipal).toBe(0);
    expect(calc.derivedStatus).toBe(ProjectStatus.FULLY_SETTLED);
    // Since principal became 0 on 2026-06-01, no segments exist after 2026-06-01
    expect(calc.segments.length).toBe(1);
    expect(calc.segments[0].endDate).toBe('2026-06-01');
  });

  it('TEST 12: Multiple returns on the same date handled deterministically', () => {
    const calc = calculateSegmentedProfitFromData({
      originalPrincipal: 100000,
      startDate: '2026-01-01',
      maturityDate: '2026-12-31',
      expectedAnnualRoiPercent: 40,
      returns: [
        { maturityDate: '2026-06-01', principalReturned: 20000, actualProfit: 2000 },
        { maturityDate: '2026-06-01', principalReturned: 30000, actualProfit: 3000 },
      ],
      asOfDate: '2026-06-01',
    });

    expect(calc.totalPrincipalReturned).toBe(50000);
    expect(calc.actualProfitReturned).toBe(5000);
    expect(calc.outstandingPrincipal).toBe(50000);
  });
});
