import { Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { AuthRequest } from '../middlewares/auth.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { createError } from '../middlewares/error.js';
import { UserRole, AccountantType, UserStatus } from '../types/models.js';
import { normalizePhone } from '../middlewares/sanitize.js';
import { CustodyChannel } from '../types/models.js';
import crypto from 'crypto';

/**
 * POST /api/auth/login
 * Public endpoint for user login.
 */
export async function login(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(createError('Email and password are required.', 400));
    }

    // Must explicitly select passwordHash because select: false in schema
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
    if (!user) {
      return next(createError('Invalid email or password.', 401));
    }

    if (user.status !== UserStatus.ACTIVE) {
      return next(createError(`Account is ${user.status.toLowerCase()}. Please contact administrator.`, 403));
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return next(createError('Invalid email or password.', 401));
    }

    // Generate JWT
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      accountantType: user.accountantType,
      sessionVersion: user.sessionVersion || 0,
    });

    // Audit log login event
    await AuditLog.create({
      performedBy: user._id,
      action: 'LOGIN',
      entityName: 'User',
      entityId: user._id,
      reason: 'User logged in successfully',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          accountantType: user.accountantType,
          status: user.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/** Lists operational staff without exposing credentials or raw routing keys. */
export async function listStaff(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const staff = await User.find({ accountantType: { $in: Object.values(AccountantType) } })
      .select('name email phone role accountantType linkedGatewayChannels gatewayAccessKeyPrefix status createdAt offboardedAt')
      .sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: staff });
  } catch (error) { next(error); }
}

/** Provisions an accountant profile and returns the generated routing key once. */
export async function provisionStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next(createError('Authentication required.', 401));
    const { name, email, password, phone, accountantType, linkedGatewayChannels = [] } = req.body;
    if (!name || !email || !password || !accountantType) return next(createError('Name, email, password, and staff type are required.', 400));
    if (!Object.values(AccountantType).includes(accountantType)) return next(createError('Staff type must be PRIMARY or ASSISTANT.', 400));
    if (password.length < 10) return next(createError('Staff passwords must contain at least 10 characters.', 400));
    if (!Array.isArray(linkedGatewayChannels) || linkedGatewayChannels.some((channel) => !Object.values(CustodyChannel).includes(channel))) return next(createError('One or more linked gateway channels are invalid.', 400));
    if (await User.exists({ email: email.toLowerCase() })) return next(createError('A user with this email address already exists.', 409));
    const rawGatewayKey = `NSF_${crypto.randomBytes(18).toString('base64url')}`;
    const staff = await User.create({ name, email, passwordHash: await hashPassword(password), phone: normalizePhone(phone), role: UserRole.ACCOUNTANT, accountantType, linkedGatewayChannels, gatewayAccessKeyHash: crypto.createHash('sha256').update(rawGatewayKey).digest('hex'), gatewayAccessKeyPrefix: rawGatewayKey.slice(0, 10), status: UserStatus.ACTIVE, sessionVersion: 0 });
    await AuditLog.create({ performedBy: req.user._id, action: 'PROVISION_STAFF', entityName: 'User', entityId: staff._id, afterState: { email: staff.email, accountantType, linkedGatewayChannels }, reason: `Provisioned ${accountantType.toLowerCase()} accountant access.`, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Staff profile provisioned. Save the routing key now; it will not be shown again.', data: { id: staff._id, name: staff.name, email: staff.email, accountantType: staff.accountantType, gatewayAccessKey: rawGatewayKey } });
  } catch (error) { next(error); }
}

/** Immediately revokes staff sessions and operational gateway permissions. */
export async function offboardStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next(createError('Authentication required.', 401));
    const staff = await User.findById(req.params.id).select('+gatewayAccessKeyHash');
    if (!staff || !staff.accountantType) return next(createError('Operational staff member not found.', 404));
    if (String(staff._id) === String(req.user._id)) return next(createError('You cannot offboard your own active account.', 400));
    const beforeState = { role: staff.role, accountantType: staff.accountantType, linkedGatewayChannels: staff.linkedGatewayChannels, status: staff.status };
    staff.status = UserStatus.SUSPENDED; staff.role = UserRole.MEMBER; staff.accountantType = null; staff.linkedGatewayChannels = []; staff.gatewayAccessKeyHash = null; staff.gatewayAccessKeyPrefix = null; staff.sessionVersion = Number(staff.sessionVersion || 0) + 1; staff.offboardedAt = new Date(); staff.offboardedBy = req.user._id;
    await staff.save();
    await AuditLog.create({ performedBy: req.user._id, action: 'OFFBOARD_STAFF', entityName: 'User', entityId: staff._id, beforeState, afterState: { status: staff.status, sessionVersion: staff.sessionVersion }, reason: 'Immediate operational role, session, and gateway access revocation.', ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Staff access was revoked and linked gateway access disconnected.' });
  } catch (error) { next(error); }
}

/**
 * GET /api/auth/me
 * Protected endpoint returning the profile of the currently logged-in user.
 */
export async function getMe(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      return next(createError('Authentication required.', 401));
    }

    res.status(200).json({
      success: true,
      data: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        accountantType: req.user.accountantType,
        status: req.user.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/register
 * Admin-only endpoint for creating new system accounts (e.g. Accountants, Members, Admins).
 */
export async function register(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, email, password, phone, role, accountantType } = req.body;

    if (!name || !email || !password) {
      return next(createError('Name, email, and password are required.', 400));
    }

    if (password.length < 6) {
      return next(createError('Password must be at least 6 characters long.', 400));
    }

    // Validate role if supplied
    if (role && !Object.values(UserRole).includes(role)) {
      return next(createError(`Invalid role: ${role}`, 400));
    }

    // Validate accountantType if supplied
    if (accountantType && !Object.values(AccountantType).includes(accountantType)) {
      return next(createError(`Invalid accountant type: ${accountantType}`, 400));
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return next(createError('A user with this email address already exists.', 409));
    }

    const passwordHash = await hashPassword(password);

    const newUser = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: normalizePhone(phone),
      passwordHash,
      role: role || UserRole.MEMBER,
      accountantType: accountantType || null,
      status: UserStatus.ACTIVE,
    });

    // Audit log creation event
    if (req.user) {
      await AuditLog.create({
        performedBy: req.user._id,
        action: 'CREATE_USER',
        entityName: 'User',
        entityId: newUser._id,
        afterState: {
          id: newUser._id,
          email: newUser.email,
          role: newUser.role,
          accountantType: newUser.accountantType,
        },
        reason: `User account created by ${req.user.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
        accountantType: newUser.accountantType,
        status: newUser.status,
      },
    });
  } catch (error) {
    next(error);
  }
}
