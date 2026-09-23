import { Member } from '../models/Member.js';
import { AuditLog } from '../models/AuditLog.js';
import { ShareHistory } from '../models/ShareHistory.js';
import { IMember, MemberStatus, IUser, ShareEventType } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { HydratedDocument, Types } from 'mongoose';
import { getMonthlyShareValue } from './settings.service.js';
import { normalizePhone } from '../middlewares/sanitize.js';

export interface CreateMemberInput {
  name: string;
  phone: string;
  email?: string;
  memberId?: string;
  status: MemberStatus;
  joinDate: Date | string;
  address?: string;
  initialShareCount?: number | string;
}

export interface UpdateMemberInput {
  name?: string;
  phone?: string;
  email?: string;
  status?: MemberStatus;
  joinDate?: Date | string;
  address?: string;
}

export interface MemberQueryOptions {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Auto-generates the next sequential Member ID in the authoritative format: NSF001, NSF002, etc.
 * Conforms to legacy Google Sheets format for seamless historical 2024 data migration.
 */
export async function generateNextMemberId(): Promise<string> {
  const members = await Member.find({}, { memberId: 1 }).lean();
  let maxSeq = 0;

  for (const m of members) {
    if (m.memberId && m.memberId.startsWith('NSF')) {
      const numPart = parseInt(m.memberId.substring(3), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `NSF${String(nextSeq).padStart(3, '0')}`;
}

/**
 * Creates a new member with audit logging.
 */
export async function createMember(
  input: CreateMemberInput,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<HydratedDocument<IMember>> {
  const phone = normalizePhone(input.phone)!;
  const initialShareCount = Number(input.initialShareCount ?? 1);
  if (!Number.isInteger(initialShareCount) || initialShareCount < 1 || initialShareCount > 10000) {
    throw createError('Number of shares must be a whole number between 1 and 10,000.', 400);
  }
  const existingPhone = await Member.findOne({ phone });
  if (existingPhone) {
    throw createError(`A member with phone number '${phone}' already exists.`, 409);
  }

  let memberId = input.memberId?.trim().toUpperCase();
  if (!memberId) {
    memberId = await generateNextMemberId();
  } else {
    const existingId = await Member.findOne({ memberId });
    if (existingId) {
      throw createError(`Member ID '${memberId}' already exists.`, 409);
    }
  }

  const member = await Member.create({
    memberId,
    name: input.name.trim(),
    phone,
    email: input.email?.trim().toLowerCase(),
    status: input.status,
    joinDate: new Date(input.joinDate),
    address: input.address?.trim(),
  });

  const joinDate = new Date(input.joinDate);
  const effectiveMonth = `${joinDate.getFullYear()}-${String(joinDate.getMonth() + 1).padStart(2, '0')}`;
  const initialShareEvent = await ShareHistory.create({
    memberId: member._id,
    effectiveMonth,
    shareCount: initialShareCount,
    previousShareCount: 0,
    eventType: ShareEventType.INITIAL_ALLOCATION,
    changedBy: actingUser._id,
    notes: 'Initial share allocation recorded during member registration.',
  });

  // Record audit log
  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'CREATE_MEMBER',
    entityName: 'Member',
    entityId: member._id,
    afterState: { ...member.toObject(), initialShareCount, initialShareEventId: initialShareEvent._id },
    reason: `New member registered with ID ${member.memberId} and ${initialShareCount} initial share(s).`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return member;
}

/**
 * Retrieves members with search, status filtering, and pagination.
 */
export async function getMembers(options: MemberQueryOptions = {}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};

  if (options.status && options.status !== 'ALL') {
    filter.status = options.status.toUpperCase();
  }

  if (options.search && options.search.trim()) {
    const searchRegex = new RegExp(options.search.trim(), 'i');
    filter.$or = [
      { name: searchRegex },
      { memberId: searchRegex },
      { phone: searchRegex },
      { email: searchRegex },
    ];
  }

  const sortField = options.sortBy || 'memberId';
  const sortDirection = options.sortOrder === 'desc' ? -1 : 1;

  const [members, total, shareAmount] = await Promise.all([
    Member.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip(skip)
      .limit(limit)
      .lean(),
    Member.countDocuments(filter),
    getMonthlyShareValue(),
  ]);

  const histories = members.length
    ? await ShareHistory.find({ memberId: { $in: members.map((member) => member._id) } })
      .sort({ effectiveMonth: -1, createdAt: -1 })
      .lean()
    : [];
  const latestShares = new Map<string, (typeof histories)[number]>();
  for (const history of histories) {
    const id = history.memberId.toString();
    if (!latestShares.has(id)) latestShares.set(id, history);
  }
  const enrichedMembers = members.map((member) => {
    const share = latestShares.get(member._id.toString());
    // Legacy members without a recorded history retain the same one-share
    // fallback used by the payment engine until their history is migrated.
    const shareCount = share?.shareCount ?? 1;
    return { ...member, shareCount, shareEffectiveMonth: share?.effectiveMonth || null, shareAmount, monthlyPayable: shareCount * shareAmount };
  });

  return {
    members: enrichedMembers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Retrieves a single member by ID (MongoDB _id or custom memberId).
 */
export async function getMemberById(identifier: string): Promise<HydratedDocument<IMember>> {
  let member: HydratedDocument<IMember> | null = null;

  if (Types.ObjectId.isValid(identifier)) {
    member = await Member.findById(identifier);
  }

  if (!member) {
    member = await Member.findOne({ memberId: identifier.toUpperCase() });
  }

  if (!member) {
    throw createError(`Member '${identifier}' not found.`, 404);
  }

  return member;
}

/**
 * Updates an existing member with audit logging.
 */
export async function updateMember(
  identifier: string,
  input: UpdateMemberInput,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<HydratedDocument<IMember>> {
  const member = await getMemberById(identifier);
  const beforeState = member.toObject();

  // If phone changed, check uniqueness
  const normalizedPhone = input.phone ? normalizePhone(input.phone) : undefined;
  if (normalizedPhone && normalizedPhone !== member.phone) {
    const existing = await Member.findOne({ phone: normalizedPhone });
    if (existing && existing._id.toString() !== member._id.toString()) {
      throw createError(`Phone number '${input.phone}' is already in use by another member.`, 409);
    }
    member.phone = normalizedPhone;
  }

  if (input.name) member.name = input.name.trim();
  if (input.email !== undefined) member.email = input.email?.trim().toLowerCase();
  if (input.status) member.status = input.status;
  if (input.joinDate) member.joinDate = new Date(input.joinDate);
  if (input.address !== undefined) member.address = input.address?.trim();
  await member.save();

  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'UPDATE_MEMBER',
    entityName: 'Member',
    entityId: member._id,
    beforeState,
    afterState: member.toObject(),
    reason: `Member profile updated for ${member.memberId}`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return member;
}

/**
 * Soft deletes / drops a member with audit logging.
 */
export async function deleteMember(
  identifier: string,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<HydratedDocument<IMember>> {
  const member = await getMemberById(identifier);
  const beforeState = member.toObject();

  member.status = MemberStatus.DROPPED;
  await member.save();

  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'DROP_MEMBER',
    entityName: 'Member',
    entityId: member._id,
    beforeState,
    afterState: member.toObject(),
    reason: `Member status marked as DROPPED for ${member.memberId}`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return member;
}

/**
 * Aggregates membership metrics (total, active, inactive, dropped).
 */
export async function getMemberStats() {
  const [total, active, inactive, dropped] = await Promise.all([
    Member.countDocuments(),
    Member.countDocuments({ status: MemberStatus.ACTIVE }),
    Member.countDocuments({ status: MemberStatus.INACTIVE }),
    Member.countDocuments({ status: MemberStatus.DROPPED }),
  ]);

  return { total, active, inactive, dropped };
}
