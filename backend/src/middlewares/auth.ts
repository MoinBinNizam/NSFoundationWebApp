import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt.js';
import { User } from '../models/User.js';
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
  const isAdministrator = req.user.role === UserRole.ADMIN || req.user.role === UserRole.SUPER_ADMIN;
  if (!isAdministrator && req.user.accountantType !== AccountantType.PRIMARY) {
    return next(createError('Investment access is restricted to administrators and the primary accountant.', 403));
  }
  next();
}
