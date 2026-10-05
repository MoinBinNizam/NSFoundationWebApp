import { Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { CustodyAccount } from '../models/CustodyAccount.js';
import { AuthRequest } from '../middlewares/auth.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateToken } from '../utils/jwt.js';
import { createError } from '../middlewares/error.js';
import { UserRole, AccountantType, UserStatus } from '../types/models.js';
import { normalizePhone } from '../middlewares/sanitize.js';
import { CustodyChannel } from '../types/models.js';
import { CustodyService } from '../services/custody.service.js';
import crypto from 'crypto';

function validatePassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 12) throw createError('Password must contain at least 12 characters.', 400);
  return password;
}

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createGatewayKey(): { raw: string; hash: string; prefix: string } {
  const raw = `NSF_${crypto.randomBytes(18).toString('base64url')}`;
  return { raw, hash: crypto.createHash('sha256').update(raw).digest('hex'), prefix: raw.slice(0, 10) };
}

async function assertCustodyHandoverReady(staffId: string) {
  const accounts = await CustodyAccount.find({ holderId: staffId, isActive: true });
  const unsettled: Array<{ id: string; name: string; balance: number }> = [];
  for (const account of accounts) {
    const { currentBalance } = await CustodyService.getDerivedAccountBalance(account._id);
    if (Math.abs(currentBalance) >= 0.01) unsettled.push({ id: String(account._id), name: account.name, balance: currentBalance });
  }
  if (unsettled.length) {
    throw createError(`Transfer or reconcile all outgoing custody balances before changing responsibility: ${unsettled.map((item) => `${item.name} (৳${item.balance.toFixed(2)})`).join(', ')}.`, 409);
  }
  return accounts;
}

async function deactivateCustodyAccounts(accounts: Array<{ isActive: boolean; save: () => Promise<unknown> }>) {
  for (const account of accounts) { account.isActive = false; await account.save(); }
}

/** Closed 2024 roster: public self-registration is intentionally disabled. */
export async function publicRegister(_req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  return next(createError('Member self-registration is closed. NS Foundation accounts are provisioned by an administrator from the approved 2024 roster.', 403));
}

/** Starts password recovery without revealing whether an email is registered. */
export async function requestPasswordReset(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpiresAt');
    let resetToken: string | undefined;
    if (user) { resetToken = crypto.randomBytes(32).toString('hex'); user.passwordResetTokenHash = hashResetToken(resetToken); user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000); await user.save(); }
    const data = process.env.NODE_ENV === 'development' && resetToken ? { developmentResetToken: resetToken } : undefined;
    res.json({ success: true, message: 'If an account exists, password recovery instructions have been issued.', data });
  } catch (error) { next(error); }
}

export async function resetPassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = String(req.body.token || ''); const safePassword = validatePassword(req.body.password);
    if (!token) return next(createError('Reset token is required.', 400));
    const user = await User.findOne({ passwordResetTokenHash: hashResetToken(token), passwordResetExpiresAt: { $gt: new Date() } }).select('+passwordResetTokenHash +passwordResetExpiresAt');
    if (!user) return next(createError('Reset token is invalid or expired.', 400));
    user.passwordHash = await hashPassword(safePassword); user.passwordResetTokenHash = null; user.passwordResetExpiresAt = null; user.sessionVersion = Number(user.sessionVersion || 0) + 1; await user.save();
    await AuditLog.create({ performedBy: user._id, action: 'PASSWORD_RESET', entityName: 'User', entityId: user._id, reason: 'Password reset token redeemed.', ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Password reset successful. Please sign in again.' });
  } catch (error) { next(error); }
}

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
    const loginId = String(email).trim();
    let normalizedPhone: string | undefined;
    try { normalizedPhone = normalizePhone(loginId); } catch { normalizedPhone = undefined; }
    // Imported members receive a non-deliverable placeholder email until they add
    // their own address. It must never become a second, guessable sign-in name.
    const canUseEmail = !loginId.toLowerCase().endsWith('@member.local');
    const user = await User.findOne({ $or: [...(canUseEmail ? [{ email: loginId.toLowerCase() }] : []), ...(normalizedPhone ? [{ phone: normalizedPhone }] : [])] }).select('+passwordHash');
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

    user.lastLoginAt = new Date(); await user.save();
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
          designation: user.designation || null,
          memberId: user.memberId || null,
          accountantType: user.accountantType,
          status: user.status,
          mustChangePassword: Boolean(user.mustChangePassword),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

/** First-login activation: only available to the authenticated account itself. */
export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next(createError('Authentication required.', 401));
    const password = validatePassword(req.body.password);
    if (req.user.temporaryPasswordExpiresAt && req.user.temporaryPasswordExpiresAt < new Date()) return next(createError('Your temporary activation password has expired. Please contact an administrator for recovery.', 403));
    req.user.passwordHash = await hashPassword(password);
    req.user.mustChangePassword = false; req.user.temporaryPasswordExpiresAt = null; req.user.passwordChangedAt = new Date();
    await req.user.save();
    await AuditLog.create({ performedBy: req.user._id, action: 'MEMBER_ACTIVATED_PASSWORD_CHANGED', entityName: 'User', entityId: req.user._id, reason: 'Temporary activation password replaced.', ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Password changed. Your member account is now active.' });
  } catch (error) { next(error); }
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

/** Lists active member accounts eligible to receive an operational responsibility. */
export async function listStaffCandidates(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const candidates = await User.find({ memberId: { $ne: null }, status: UserStatus.ACTIVE })
      .populate('memberId', 'memberId name')
      .select('name email phone role designation accountantType memberId')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data: candidates });
  } catch (error) { next(error); }
}

/** Appoints an existing active member to a vacant accountant responsibility without duplicating their identity. */
export async function appointMemberStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next(createError('Authentication required.', 401));
    const { userId, accountantType, linkedGatewayChannels = [], reason } = req.body;
    if (!userId || !accountantType || !reason?.trim()) return next(createError('Member, responsibility type, and appointment reason are required.', 400));
    if (!Object.values(AccountantType).includes(accountantType)) return next(createError('Staff type must be PRIMARY or ASSISTANT.', 400));
    if (!Array.isArray(linkedGatewayChannels) || linkedGatewayChannels.some((channel) => !Object.values(CustodyChannel).includes(channel))) return next(createError('One or more linked gateway channels are invalid.', 400));
    const [candidate, occupied] = await Promise.all([
      User.findById(userId).select('+gatewayAccessKeyHash'),
      User.findOne({ _id: { $ne: userId }, accountantType, status: UserStatus.ACTIVE }),
    ]);
    if (!candidate?.memberId || candidate.status !== UserStatus.ACTIVE) return next(createError('Select an active member account for this responsibility.', 400));
    if (occupied) return next(createError(`The ${accountantType.toLowerCase()} responsibility is already occupied. Use the controlled handover action.`, 409));
    const beforeState = { role: candidate.role, accountantType: candidate.accountantType, linkedGatewayChannels: candidate.linkedGatewayChannels };
    const routingKey = createGatewayKey();
    if (candidate.role === UserRole.MEMBER) candidate.role = UserRole.ACCOUNTANT;
    candidate.accountantType = accountantType;
    candidate.linkedGatewayChannels = linkedGatewayChannels;
    candidate.gatewayAccessKeyHash = routingKey.hash;
    candidate.gatewayAccessKeyPrefix = routingKey.prefix;
    candidate.offboardedAt = null;
    candidate.offboardedBy = null;
    candidate.sessionVersion = Number(candidate.sessionVersion || 0) + 1;
    await candidate.save();
    await AuditLog.create({ performedBy: req.user._id, action: 'APPOINT_MEMBER_STAFF', entityName: 'User', entityId: candidate._id, beforeState, afterState: { role: candidate.role, accountantType, linkedGatewayChannels }, reason: reason.trim(), ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(200).json({ success: true, message: 'Member appointed. Create and verify the new custody accounts before collecting payments.', data: { id: candidate._id, name: candidate.name, accountantType, gatewayAccessKey: routingKey.raw } });
  } catch (error) { next(error); }
}

/** Hands a responsibility to an existing member after all outgoing custody balances are transferred/reconciled. */
export async function handoverStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next(createError('Authentication required.', 401));
    const { outgoingStaffId, successorUserId, successorCustodyAccountIds, linkedGatewayChannels = [], reason } = req.body;
    if (!outgoingStaffId || !successorUserId || !Array.isArray(successorCustodyAccountIds) || !reason?.trim()) return next(createError('Outgoing staff, successor, successor custody accounts, and handover reason are required.', 400));
    if (outgoingStaffId === successorUserId) return next(createError('Outgoing staff and successor must be different people.', 400));
    if (!Array.isArray(linkedGatewayChannels) || linkedGatewayChannels.some((channel) => !Object.values(CustodyChannel).includes(channel))) return next(createError('One or more linked gateway channels are invalid.', 400));
    const outgoing = await User.findById(outgoingStaffId).select('+gatewayAccessKeyHash');
    const successor = await User.findById(successorUserId).select('+gatewayAccessKeyHash');
    if (!outgoing?.accountantType || outgoing.status !== UserStatus.ACTIVE) return next(createError('Outgoing operational staff member is not active.', 404));
    if (!successor?.memberId || successor.status !== UserStatus.ACTIVE) return next(createError('Successor must be an active member account.', 400));
    if (successor.accountantType) return next(createError('Successor already holds an accountant responsibility.', 409));
    const successorAccounts = await CustodyAccount.find({ _id: { $in: successorCustodyAccountIds }, holderId: successor._id, isActive: true });
    if (successorAccounts.length !== new Set(successorCustodyAccountIds).size) return next(createError('Every selected successor custody account must be active and belong to the successor.', 400));
    const missingChannels = linkedGatewayChannels.filter((channel) => !successorAccounts.some((account) => account.channel === channel));
    if (missingChannels.length) return next(createError(`Create/select successor custody accounts for: ${missingChannels.join(', ')}.`, 400));
    const outgoingAccounts = await assertCustodyHandoverReady(String(outgoing._id));
    const outgoingBefore = { role: outgoing.role, accountantType: outgoing.accountantType, linkedGatewayChannels: outgoing.linkedGatewayChannels, status: outgoing.status };
    const successorBefore = { role: successor.role, accountantType: successor.accountantType, linkedGatewayChannels: successor.linkedGatewayChannels, status: successor.status };
    const routingKey = createGatewayKey();
    await deactivateCustodyAccounts(outgoingAccounts);
    outgoing.role = UserRole.MEMBER;
    outgoing.accountantType = null;
    outgoing.linkedGatewayChannels = [];
    outgoing.gatewayAccessKeyHash = null;
    outgoing.gatewayAccessKeyPrefix = null;
    outgoing.sessionVersion = Number(outgoing.sessionVersion || 0) + 1;
    outgoing.offboardedAt = new Date();
    outgoing.offboardedBy = req.user._id;
    outgoing.status = outgoing.memberId ? UserStatus.ACTIVE : UserStatus.SUSPENDED;
    if (successor.role === UserRole.MEMBER) successor.role = UserRole.ACCOUNTANT;
    successor.accountantType = outgoingBefore.accountantType;
    successor.linkedGatewayChannels = linkedGatewayChannels;
    successor.gatewayAccessKeyHash = routingKey.hash;
    successor.gatewayAccessKeyPrefix = routingKey.prefix;
    successor.offboardedAt = null;
    successor.offboardedBy = null;
    successor.sessionVersion = Number(successor.sessionVersion || 0) + 1;
    await Promise.all([outgoing.save(), successor.save()]);
    await AuditLog.create({ performedBy: req.user._id, action: 'HANDOVER_ACCOUNTANT_RESPONSIBILITY', entityName: 'User', entityId: successor._id, beforeState: { outgoing: outgoingBefore, successor: successorBefore, outgoingCustodyAccounts: outgoingAccounts.map((account) => account._id) }, afterState: { outgoing: { id: outgoing._id, status: outgoing.status, role: outgoing.role }, successor: { id: successor._id, role: successor.role, accountantType: successor.accountantType, linkedGatewayChannels }, successorCustodyAccounts: successorAccounts.map((account) => account._id) }, reason: reason.trim(), ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(200).json({ success: true, message: 'Responsibility handed over. Historical records remain with the former custodian; future activity uses the successor custody accounts.', data: { successorId: successor._id, gatewayAccessKey: routingKey.raw } });
  } catch (error) { next(error); }
}

/** Provisions an accountant profile and returns the generated routing key once. */
export async function provisionStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next(createError('Authentication required.', 401));
    const { name, email, password, phone, accountantType, linkedGatewayChannels = [] } = req.body;
    if (!name || !email || !password || !accountantType) return next(createError('Name, email, password, and staff type are required.', 400));
    if (!Object.values(AccountantType).includes(accountantType)) return next(createError('Staff type must be PRIMARY or ASSISTANT.', 400));
    if (password.length < 12) return next(createError('Staff passwords must contain at least 12 characters.', 400));
    if (!Array.isArray(linkedGatewayChannels) || linkedGatewayChannels.some((channel) => !Object.values(CustodyChannel).includes(channel))) return next(createError('One or more linked gateway channels are invalid.', 400));
    if (await User.exists({ email: email.toLowerCase() })) return next(createError('A user with this email address already exists.', 409));
    if (await User.exists({ accountantType, status: UserStatus.ACTIVE })) return next(createError(`The ${accountantType.toLowerCase()} responsibility is already occupied. Use the controlled handover action.`, 409));
    const routingKey = createGatewayKey();
    const staff = await User.create({ name, email, passwordHash: await hashPassword(password), phone: normalizePhone(phone), role: UserRole.ACCOUNTANT, accountantType, linkedGatewayChannels, gatewayAccessKeyHash: routingKey.hash, gatewayAccessKeyPrefix: routingKey.prefix, status: UserStatus.ACTIVE, sessionVersion: 0 });
    await AuditLog.create({ performedBy: req.user._id, action: 'PROVISION_STAFF', entityName: 'User', entityId: staff._id, afterState: { email: staff.email, accountantType, linkedGatewayChannels }, reason: `Provisioned ${accountantType.toLowerCase()} accountant access.`, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Staff profile provisioned. Save the routing key now; it will not be shown again.', data: { id: staff._id, name: staff.name, email: staff.email, accountantType: staff.accountantType, gatewayAccessKey: routingKey.raw } });
  } catch (error) { next(error); }
}

/** Immediately revokes staff sessions and operational gateway permissions. */
export async function offboardStaff(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next(createError('Authentication required.', 401));
    const staff = await User.findById(req.params.id).select('+gatewayAccessKeyHash');
    if (!staff || !staff.accountantType) return next(createError('Operational staff member not found.', 404));
    if (String(staff._id) === String(req.user._id)) return next(createError('You cannot offboard your own active account.', 400));
    const accounts = await assertCustodyHandoverReady(String(staff._id));
    const beforeState = { role: staff.role, accountantType: staff.accountantType, linkedGatewayChannels: staff.linkedGatewayChannels, status: staff.status, custodyAccounts: accounts.map((account) => account._id) };
    await deactivateCustodyAccounts(accounts);
    staff.status = staff.memberId ? UserStatus.ACTIVE : UserStatus.SUSPENDED; staff.role = UserRole.MEMBER; staff.accountantType = null; staff.linkedGatewayChannels = []; staff.gatewayAccessKeyHash = null; staff.gatewayAccessKeyPrefix = null; staff.sessionVersion = Number(staff.sessionVersion || 0) + 1; staff.offboardedAt = new Date(); staff.offboardedBy = req.user._id;
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
        designation: req.user.designation || null,
        memberId: req.user.memberId || null,
        accountantType: req.user.accountantType,
        status: req.user.status,
        mustChangePassword: Boolean(req.user.mustChangePassword),
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

    validatePassword(password);

    // Validate role if supplied
    if (role && !Object.values(UserRole).includes(role)) {
      return next(createError(`Invalid role: ${role}`, 400));
    }

    // Validate accountantType if supplied
    if (accountantType && !Object.values(AccountantType).includes(accountantType)) {
      return next(createError(`Invalid accountant type: ${accountantType}`, 400));
    }

    if (role === UserRole.SUPER_ADMIN && req.user?.role !== UserRole.SUPER_ADMIN) {
      return next(createError('Only a Super Admin can provision another Super Admin.', 403));
    }
    if (role === UserRole.ACCOUNTANT && !accountantType) {
      return next(createError('An Accountant account must specify PRIMARY or ASSISTANT type.', 400));
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
