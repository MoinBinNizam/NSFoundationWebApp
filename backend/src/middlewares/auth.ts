import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { ModulePermission } from '../models/ModulePermission.js';
import { IUser, UserRole, AccountantType, UserStatus } from '../types/models.js';
import { createError } from './error.js';
import { HydratedDocument } from 'mongoose';

// Extend Express Request interface to include authenticated user
export interface AuthRequest extends Request {
  user?: HydratedDocument<IUser>;
}

/**
 * Middleware: Verifies the JWT bearer token from headers, fetches active user, and attaches to req.user.
 */
export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(createError('Authorization token is missing or malformed.', 401));
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return next(createError('Authentication token not provided.', 401));
    }

    let decoded: TokenPayload;
    try {
      decoded = verifyToken(token);
    } catch {
      return next(createError('Invalid or expired authentication token.', 401));
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return next(createError('User account not found.', 401));
    }

    if (user.status !== UserStatus.ACTIVE) {
      return next(createError(`User account is ${user.status.toLowerCase()}. Access denied.`, 403));
    }
    if (Number(decoded.sessionVersion || 0) !== Number(user.sessionVersion || 0)) {
      return next(createError('This session has been revoked. Please sign in again.', 401));
    }

    if (user.mustChangePassword && !req.originalUrl.startsWith('/api/auth/change-password') && !req.originalUrl.startsWith('/api/auth/me')) {
      return next(createError('Change your temporary password before accessing account data.', 403));
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * RBAC Middleware: Restricts access to users having one of the specified roles.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        createError(
          `Forbidden: Role '${req.user.role}' is not authorized to access this resource.`,
          403
        )
      );
    }

    next();
  };
}

/**
 * RBAC Middleware: Restricts access to accountants matching specific custody authority types (PRIMARY or ASSISTANT).
 * Note: Purely property-based, no hardcoded usernames.
 */
export function requireAccountant(...types: AccountantType[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    // A Super Admin may perform an accountant operation while retaining the
    // same audit identity. This keeps its UI/API capabilities consistent with
    // its unconditional module-edit permission.
    if (req.user.role === UserRole.SUPER_ADMIN) {
      return next();
    }

    // Must be either an ACCOUNTANT or an ADMIN with designated accountantType
    if (!req.user.accountantType || !types.includes(req.user.accountantType)) {
      return next(
        createError(
          `Forbidden: Accountant custody type '${req.user.accountantType || 'NONE'}' is not authorized for this financial action.`,
          403
        )
      );
    }

    next();
  };
}

/**
 * Investment data and operations are reserved for organization administrators
 * and the designated primary accountant (Moin). This is deliberately separate
 * from general accountant permissions so the assistant accountant cannot gain
 * access through a direct API request.
 */
export function requireInvestmentAccess(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(createError('Authentication required.', 401));
  }
  const isAdministrator = req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN || req.user.role === UserRole.INVESTMENT_MANAGER;
  if (!isAdministrator && req.user.accountantType !== AccountantType.PRIMARY) {
    return next(createError('Investment access is restricted to administrators and the primary accountant.', 403));
  }
  next();
}

/** Migration review is available to Super Admins and the currently assigned primary accountant. */
export function requireMigrationAccess(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user) return next(createError('Authentication required.', 401));
  const allowed = req.user.role === UserRole.SUPER_ADMIN || req.user.accountantType === AccountantType.PRIMARY;
  if (!allowed) return next(createError('Historical migration access is restricted to Super Admins and the assigned Primary Accountant.', 403));
  next();
}

/**
 * Dynamic Module RBAC Middleware:
 * Checks whether the authenticated user has permission to 'view' or 'edit' a given module.
 * 1. Super Admin has unconditional bypass.
 * 2. Checks dynamic permissions configured in ModulePermission collection.
 * 3. Enforces Director read-only restrictions on CONTRIBUTIONS/PAYMENTS, MEMBER MANAGEMENT, and CUSTODY.
 */
export function requireModuleAccess(moduleKey: string, action: 'view' | 'edit' = 'view') {
  return async (req: AuthRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(createError('Authentication required.', 401));
      }

      // Super Admin has unconditional editorial and view access
      if (req.user.role === UserRole.SUPER_ADMIN) {
        return next();
      }

      const designation = req.user.designation;
      const role = req.user.role;

      // Check dynamic ModulePermission in database
      const permDoc =
        (designation ? await ModulePermission.findOne({ roleOrDesignation: designation }).lean() : null) ||
        (await ModulePermission.findOne({ roleOrDesignation: role }).lean());

      if (permDoc && permDoc.modules && permDoc.modules[moduleKey]) {
        const mod = permDoc.modules[moduleKey];
        if (action === 'view' && mod.canView === false) {
          return next(createError(`Forbidden: Access denied to view ${moduleKey} module.`, 403));
        }
        if (action === 'edit' && mod.canEdit === false) {
          return next(createError(`Forbidden: Editorial permission denied for ${moduleKey} module.`, 403));
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
