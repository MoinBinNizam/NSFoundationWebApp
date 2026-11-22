import { GoverningBodyMember, IGoverningBodyMember } from '../models/GoverningBodyMember.js';
import { Member } from '../models/Member.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { IUser, MemberDesignation, UserRole, AccountantType } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { HydratedDocument, Types } from 'mongoose';

export interface CreateGoverningBodyInput {
  memberId: string;
  role: string;
  titleEn: string;
  titleBn: string;
  responsibilitiesEn?: string;
  responsibilitiesBn?: string;
  order?: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'FORMER';
  termStart?: Date | string;
  termEnd?: Date | string | null;
  notes?: string;
}

export interface UpdateGoverningBodyInput {
  memberId?: string;
  role?: string;
  titleEn?: string;
  titleBn?: string;
  responsibilitiesEn?: string;
  responsibilitiesBn?: string;
  order?: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'FORMER';
  termStart?: Date | string;
  termEnd?: Date | string | null;
  notes?: string;
}

/**
 * Seeds initial foundational executive board members if the collection is empty.
 */
async function autoSeedGoverningBody(): Promise<void> {
  const count = await GoverningBodyMember.countDocuments();
  if (count > 0) return;

  const members = await Member.find().lean();
  if (!members.length) return;

  const findMember = (matcher: (m: any) => boolean) => members.find(matcher);

  const initialRoles = [
    {
      role: 'DIRECTOR',
      titleEn: 'Director / Advisor',
      titleBn: 'পরিচালক (Director)',
      responsibilitiesEn: 'Oversee organizational policies, strategic planning, board resolutions, and high-level governance.',
      responsibilitiesBn: 'সংগঠনের নীতি নির্ধারণ, কৌশলগত পরিকল্পনা, বোর্ড সিদ্ধান্ত এবং সামগ্রিক শাসন ব্যবস্থা তদারকি।',
      order: 1,
      matcher: (m: any) => m.memberId === 'NSF001' || m.designation === 'DIRECTOR' || /Shuvo|Salah/i.test(m.name),
    },
    {
      role: 'PRESIDENT',
      titleEn: 'President',
      titleBn: 'সভাপতি (President)',
      responsibilitiesEn: 'Preside over general assemblies, executive committee meetings, and represent society governance.',
      responsibilitiesBn: 'সাধারণ সভা ও কার্যনির্বাহী কমিটির সভায় সভাপতিত্ব এবং সমবায় সমিতির প্রতিনিধিত্ব।',
      order: 2,
      matcher: (m: any) => m.memberId === 'NSF002' || m.designation === 'PRESIDENT' || /Safiqul|Shahidul/i.test(m.name),
    },
    {
      role: 'ACCOUNTANT',
      titleEn: 'Primary Accountant',
      titleBn: 'প্রধান হিসাবরক্ষক',
      responsibilitiesEn: 'Chief financial custody, monthly subscription collection management, accounting ledgers, and official disbursement records.',
      responsibilitiesBn: 'প্রধান আর্থিক হেফাজত, মাসিক চাঁদা আদায় ব্যবস্থাপনা, হিসাবরক্ষণ লেজার ও অফিশিয়াল অর্থ লেনদেন নথিভুক্তকরণ।',
      order: 3,
      matcher: (m: any) => m.memberId === 'NSF003' || m.designation === 'ACCOUNTANT' || /Moin/i.test(m.name),
    },
    {
      role: 'ASSISTANT_ACCOUNTANT',
      titleEn: 'Assistant Accountant',
      titleBn: 'সহকারী হিসাবরক্ষক',
      responsibilitiesEn: 'Assistant custody management, member ledger reconciliation, digital gateway verification, and collection tracking.',
      responsibilitiesBn: 'সহকারী তহবিল হেফাজত, সদস্য লেজার সমন্বয়, ডিজিটাল গেটওয়ে যাচাই এবং কালেকশন পর্যবেক্ষণ।',
      order: 4,
      matcher: (m: any) => m.memberId === 'NSF004' || m.designation === 'ASSISTANT_ACCOUNTANT' || /Samrat/i.test(m.name),
    },
    {
      role: 'GENERAL_SECRETARY',
      titleEn: 'General Secretary (GS)',
      titleBn: 'সাধারণ সম্পাদক (GS)',
      responsibilitiesEn: 'Secretarial administration, documentation of official minutes, member correspondence, and notices.',
      responsibilitiesBn: 'দাপ্তরিক ও সচিবালয় প্রশাসন, সভার কার্যবিবরণী নথিবদ্ধকরণ, সদস্য যোগাযোগ এবং অফিশিয়াল নোটিশ প্রদান।',
      order: 5,
      matcher: (m: any) => m.memberId === 'NSF005' || m.designation === 'GENERAL_SECRETARY' || /Nayem/i.test(m.name),
    },
    {
      role: 'CONVENER',
      titleEn: 'Convener',
      titleBn: 'আহ্বায়ক (Convener)',
      responsibilitiesEn: 'Sub-committee coordination, member mobilization, assembly convening, and cooperative welfare oversight.',
      responsibilitiesBn: 'সাব-কমিটি সমন্বয়, সদস্য সংহতি বৃদ্ধি, সাংগঠনিক সমাবেশ আহ্বান এবং কল্যাণমূলক কার্যক্রম তদারকি।',
      order: 6,
      matcher: (m: any) => m.memberId === 'NSF006' || m.designation === 'CONVENER' || /Hannan|Mannan/i.test(m.name),
    },
  ];

  for (const item of initialRoles) {
    const matched = findMember(item.matcher);
    if (matched) {
      await GoverningBodyMember.create({
        memberId: matched._id,
        role: item.role,
        titleEn: item.titleEn,
        titleBn: item.titleBn,
        responsibilitiesEn: item.responsibilitiesEn,
        responsibilitiesBn: item.responsibilitiesBn,
        order: item.order,
        status: 'ACTIVE',
        termStart: matched.joinDate || new Date('2024-01-01'),
      });
      if (matched.designation !== item.role) {
        await Member.findByIdAndUpdate(matched._id, { designation: item.role });
      }
    }
  }
}

/**
 * Synchronizes Member and User records with their executive role.
 */
async function syncMemberAndUserDesignation(memberDocId: Types.ObjectId | string, role: string): Promise<void> {
  const member = await Member.findById(memberDocId);
  if (!member) return;

  const validDesignation = Object.values(MemberDesignation).includes(role as MemberDesignation)
    ? (role as MemberDesignation)
    : MemberDesignation.EXECUTIVE_MEMBER;

  await Member.findByIdAndUpdate(memberDocId, { designation: validDesignation });

  // Update corresponding User record if one exists
  const user = await User.findOne({
    $or: [
      { memberId: member._id },
      ...(member.email ? [{ email: member.email.toLowerCase() }] : []),
    ],
  });

  if (user) {
    const updates: any = { designation: validDesignation };
    if (role === 'ACCOUNTANT') {
      updates.accountantType = AccountantType.PRIMARY;
      if (user.role !== UserRole.SUPER_ADMIN) updates.role = UserRole.ACCOUNTANT;
    } else if (role === 'ASSISTANT_ACCOUNTANT') {
      updates.accountantType = AccountantType.ASSISTANT;
      if (user.role !== UserRole.SUPER_ADMIN) updates.role = UserRole.ACCOUNTANT;
    } else if (
      ['DIRECTOR', 'PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY', 'CONVENER', 'TREASURER'].includes(role)
    ) {
      if (user.role === UserRole.MEMBER) {
        updates.role = UserRole.ADMIN;
      }
    }
    await User.findByIdAndUpdate(user._id, updates);
  }
}

/**
 * Resets member designation to GENERAL_MEMBER if they no longer hold any active board roles.
 */
async function resetMemberDesignationIfNoOtherRoles(memberDocId: Types.ObjectId | string): Promise<void> {
  const otherActiveRoles = await GoverningBodyMember.countDocuments({
    memberId: memberDocId,
    status: 'ACTIVE',
  });

  if (otherActiveRoles === 0) {
    await Member.findByIdAndUpdate(memberDocId, { designation: MemberDesignation.GENERAL_MEMBER });
    await User.findOneAndUpdate(
      { memberId: memberDocId },
      { designation: MemberDesignation.GENERAL_MEMBER }
    );
  }
}

/**
 * Get all governing body executive members with populated member data.
 */
export async function getGoverningBodyMembers(): Promise<IGoverningBodyMember[]> {
  await autoSeedGoverningBody();
  return GoverningBodyMember.find()
    .populate('memberId', 'memberId name phone linkedPhones email status joinDate designation address cashoutDue')
    .sort({ order: 1, createdAt: 1 })
    .lean() as unknown as IGoverningBodyMember[];
}

/**
 * Add a new executive role / member to the Board of Directors.
 */
export async function addGoverningBodyMember(
  input: CreateGoverningBodyInput,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<IGoverningBodyMember> {
  if (!input.memberId) {
    throw createError('A registered member must be selected.', 400);
  }
  if (!input.role) {
    throw createError('Executive role designation is required.', 400);
  }
  if (!input.titleEn || !input.titleBn) {
    throw createError('Both English and Bengali role titles are required.', 400);
  }

  const member = await Member.findById(input.memberId);
  if (!member) {
    throw createError('Selected member was not found in the registry.', 404);
  }

  // Calculate order if not provided
  let order = input.order;
  if (order === undefined || isNaN(order)) {
    const highest = await GoverningBodyMember.findOne().sort({ order: -1 }).select('order').lean();
    order = (highest?.order || 0) + 1;
  }

  const newDoc = await GoverningBodyMember.create({
    memberId: member._id,
    role: input.role.trim().toUpperCase(),
    titleEn: input.titleEn.trim(),
    titleBn: input.titleBn.trim(),
    responsibilitiesEn: input.responsibilitiesEn?.trim() || '',
    responsibilitiesBn: input.responsibilitiesBn?.trim() || '',
    order,
    status: input.status || 'ACTIVE',
    termStart: input.termStart ? new Date(input.termStart) : new Date(),
    termEnd: input.termEnd ? new Date(input.termEnd) : null,
    notes: input.notes?.trim() || '',
  });

  // Dynamically synchronize system records
  await syncMemberAndUserDesignation(member._id, input.role.trim().toUpperCase());

  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'CREATE_GOVERNING_BODY_MEMBER',
    entityName: 'GoverningBodyMember',
    entityId: newDoc._id,
    afterState: newDoc.toObject(),
    reason: `Appointed ${member.name} (${member.memberId}) as ${input.titleEn} on the Governing Body`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return (await GoverningBodyMember.findById(newDoc._id)
    .populate('memberId', 'memberId name phone linkedPhones email status joinDate designation address cashoutDue')
    .lean()) as unknown as IGoverningBodyMember;
}

/**
 * Update an existing executive role, assigned member, and responsibilities.
 */
export async function updateGoverningBodyMember(
  id: string,
  input: UpdateGoverningBodyInput,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<IGoverningBodyMember> {
  const existing = await GoverningBodyMember.findById(id);
  if (!existing) {
    throw createError('Governing body executive role not found.', 404);
  }

  const beforeState = existing.toObject();
  const oldMemberId = existing.memberId;
  let memberChanged = false;

  if (input.memberId && input.memberId.toString() !== oldMemberId.toString()) {
    const newMember = await Member.findById(input.memberId);
    if (!newMember) {
      throw createError('Selected member does not exist.', 404);
    }
    existing.memberId = newMember._id as any;
    memberChanged = true;
  }

  if (input.role) existing.role = input.role.trim().toUpperCase();
  if (input.titleEn) existing.titleEn = input.titleEn.trim();
  if (input.titleBn) existing.titleBn = input.titleBn.trim();
  if (input.responsibilitiesEn !== undefined) existing.responsibilitiesEn = input.responsibilitiesEn.trim();
  if (input.responsibilitiesBn !== undefined) existing.responsibilitiesBn = input.responsibilitiesBn.trim();
  if (input.order !== undefined && !isNaN(input.order)) existing.order = input.order;
  if (input.status) existing.status = input.status;
  if (input.termStart) existing.termStart = new Date(input.termStart);
  if (input.termEnd !== undefined) existing.termEnd = input.termEnd ? new Date(input.termEnd) : (null as any);
  if (input.notes !== undefined) existing.notes = input.notes.trim();

  await existing.save();

  // If the member assigned to the role changed, reset the old member and elevate the new member
  if (memberChanged) {
    await resetMemberDesignationIfNoOtherRoles(oldMemberId);
    await syncMemberAndUserDesignation(existing.memberId, existing.role);
  } else if (input.role) {
    // If role changed for same member, re-sync designation
    await syncMemberAndUserDesignation(existing.memberId, existing.role);
  }

  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'UPDATE_GOVERNING_BODY_MEMBER',
    entityName: 'GoverningBodyMember',
    entityId: existing._id,
    beforeState,
    afterState: existing.toObject(),
    reason: `Updated Governing Body role details for ${existing.titleEn}`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return (await GoverningBodyMember.findById(existing._id)
    .populate('memberId', 'memberId name phone linkedPhones email status joinDate designation address cashoutDue')
    .lean()) as unknown as IGoverningBodyMember;
}

/**
 * Remove an executive role or board member from the Governing Body.
 */
export async function deleteGoverningBodyMember(
  id: string,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
): Promise<{ success: boolean; message: string }> {
  const existing = await GoverningBodyMember.findById(id);
  if (!existing) {
    throw createError('Governing body executive role not found.', 404);
  }

  const memberId = existing.memberId;
  const roleTitle = existing.titleEn;

  await GoverningBodyMember.findByIdAndDelete(id);

  // Revert member designation if no other active board roles
  await resetMemberDesignationIfNoOtherRoles(memberId);

  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'DELETE_GOVERNING_BODY_MEMBER',
    entityName: 'GoverningBodyMember',
    entityId: existing._id,
    beforeState: existing.toObject(),
    reason: `Removed ${roleTitle} role from the Governing Body`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return { success: true, message: 'Executive role removed successfully.' };
}
