import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import {
  getShareStats,
  getShareHistory,
  getMembersWithShares,
  getMemberCurrentShares,
  recordShareChange,
  recordShareTransfer,
  reconcileMemberYearAccount,
  getYearAccounts,
} from '../services/share.service.js';
import { createError } from '../middlewares/error.js';

/**
 * GET /api/shares/stats
 * Global share statistics.
 */
export async function getShareStatsHandler(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getShareStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/shares/history
 * Chronological share event log with filters.
 */
export async function getShareHistoryHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { memberId, effectiveMonth, eventType, page, limit } = req.query;

    const result = await getShareHistory({
      memberId: memberId as string,
      effectiveMonth: effectiveMonth as string,
      eventType: eventType as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });

    res.status(200).json({
      success: true,
      data: result.history,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/shares/members-shares
 * List of members with current share count and monthly obligation.
 */
export async function getMembersWithSharesHandler(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getMembersWithShares();
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/shares/member/:memberId
 * Detail of a member's current shares.
 */
export async function getMemberShareDetailHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getMemberCurrentShares(req.params.memberId);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/shares/change
 * Record a normal share change or administrative adjustment.
 */
export async function recordShareChangeHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    const { memberId, effectiveMonth, shareCount } = req.body;
    if (!memberId || !effectiveMonth || shareCount === undefined) {
      return next(createError('memberId, effectiveMonth, and shareCount are required.', 400));
    }

    const shareEvent = await recordShareChange(req.body, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      message: 'Share change recorded successfully.',
      data: shareEvent,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/shares/transfer
 * Transfer shares between existing members.
 */
export async function recordShareTransferHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    const { fromMemberId, toMemberId, shareCount, effectiveMonth } = req.body;
    if (!fromMemberId || !toMemberId || !shareCount || !effectiveMonth) {
      return next(
        createError('fromMemberId, toMemberId, shareCount, and effectiveMonth are required.', 400)
      );
    }

    const result = await recordShareTransfer(req.body, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      message: `Successfully transferred ${shareCount} shares.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/shares/reconcile-year
 * Reconcile a member's annual account for a year.
 */
export async function reconcileYearAccountHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    const { memberId, year } = req.body;
    if (!memberId || !year) {
      return next(createError('memberId and year are required.', 400));
    }

    const yearAccount = await reconcileMemberYearAccount(
      memberId,
      parseInt(year, 10),
      req.user,
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      }
    );

    res.status(200).json({
      success: true,
      message: `Annual account for ${year} reconciled successfully.`,
      data: yearAccount,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/shares/annual-accounts
 * List of annual reconciled accounts.
 */
export async function getYearAccountsHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { year, memberId } = req.query;
    const accounts = await getYearAccounts({
      year: year ? parseInt(year as string, 10) : undefined,
      memberId: memberId as string,
    });

    res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
}
