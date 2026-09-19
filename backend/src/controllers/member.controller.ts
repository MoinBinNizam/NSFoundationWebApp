import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import {
  createMember,
  getMembers,
  getMemberById,
  updateMember,
  deleteMember,
  getMemberStats,
  generateNextMemberId,
} from '../services/member.service.js';
import { createError } from '../middlewares/error.js';

/**
 * POST /api/members
 * Creates a new member. Requires ADMIN or ACCOUNTANT role.
 */
export async function createMemberHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    const { name, phone } = req.body;
    if (!name || !phone) {
      return next(createError('Member name and phone number are required.', 400));
    }

    const member = await createMember(req.body, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      success: true,
      message: `Member ${member.memberId} registered successfully.`,
      data: member,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/members
 * Retrieves a list of members with search, status filter, and pagination.
 */
export async function getMembersHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { search, status, page, limit, sortBy, sortOrder } = req.query;

    const result = await getMembers({
      search: search as string,
      status: status as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 10,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    res.status(200).json({
      success: true,
      data: result.members,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/members/stats
 * Returns member metrics (total, active, inactive, dropped).
 */
export async function getMemberStatsHandler(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getMemberStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/members/next-id
 * Returns the preview of the next available Member ID (e.g. NSF001).
 */
export async function getNextIdHandler(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const nextId = await generateNextMemberId();
    res.status(200).json({
      success: true,
      data: { nextId },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/members/:id
 * Retrieves a single member by ID.
 */
export async function getMemberByIdHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const member = await getMemberById(req.params.id);
    res.status(200).json({
      success: true,
      data: member,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/members/:id
 * Updates an existing member profile. Requires ADMIN or ACCOUNTANT.
 */
export async function updateMemberHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    const member = await updateMember(req.params.id, req.body, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: `Member ${member.memberId} updated successfully.`,
      data: member,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/members/:id
 * Soft-deletes / marks member as DROPPED. Requires ADMIN role.
 */
export async function deleteMemberHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    const member = await deleteMember(req.params.id, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: `Member ${member.memberId} marked as DROPPED.`,
      data: member,
    });
  } catch (error) {
    next(error);
  }
}
