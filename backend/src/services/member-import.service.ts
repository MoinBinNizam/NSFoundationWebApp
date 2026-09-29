import crypto from 'crypto';
import { Member, ShareHistory, User, AuditLog } from '../models/index.js';
import { hashPassword } from '../utils/password.js';
import { normalizePhone } from '../middlewares/sanitize.js';
import { MemberDesignation, MemberStatus, ShareEventType, UserRole, UserStatus, IUser } from '../types/models.js';
import { HydratedDocument } from 'mongoose';
import { createError } from '../middlewares/error.js';

type Row = { memberId: string; name: string; phone: string; joinDate: string; shares: number; status: string; errors: string[] };
const previews = new Map<string, { rows: Row[]; expiresAt: number }>();
const designation = (name: string) => name.includes('-Director') ? MemberDesignation.DIRECTOR : name.includes('-President') ? MemberDesignation.PRESIDENT : name.includes('-Accountant') ? MemberDesignation.ACCOUNTANT : name.includes('-Asst. Acc') ? MemberDesignation.ASSISTANT_ACCOUNTANT : name.includes('-GS') ? MemberDesignation.GENERAL_SECRETARY : name.includes('-Convener') ? MemberDesignation.CONVENER : MemberDesignation.GENERAL_MEMBER;
const cleanName = (name: string) => name.replace(/-(Director|President|Accountant|Asst\. Acc|GS|Convener)\b/g, '').trim();

function parseCsvLine(line: string): string[] {
  const cells: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') { if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function toMemberStatus(value: string): MemberStatus {
  const status = value.trim().toUpperCase();
  if (status === MemberStatus.DROPPED) return MemberStatus.DROPPED;
  if (status === MemberStatus.INACTIVE) return MemberStatus.INACTIVE;
  return MemberStatus.ACTIVE;
}

export function previewMemberCsv(buffer: Buffer) {
  const lines = buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw createError('CSV must contain a header and at least one member row.', 400);
  const headers = parseCsvLine(lines[0]).map((item) => item.trim().toLowerCase());
  for (const required of ['memberid', 'name', 'phone', 'joindate', 'shares']) if (!headers.includes(required)) throw createError(`CSV is missing required column '${required}'.`, 400);
  const index = (key: string) => headers.indexOf(key); const seen = new Set<string>(); const seenPhones = new Set<string>();
  const rows = lines.slice(1).map((line): Row => {
    const cols = parseCsvLine(line); const memberId = cols[index('memberid')] || ''; const name = cols[index('name')] || ''; const rawPhone = cols[index('phone')] || ''; const joinDate = cols[index('joindate')] || ''; const shares = Number(cols[index('shares')]); const errors: string[] = [];
    if (!/^NSF\d{3,}$/.test(memberId)) errors.push('Member ID must use NSF001 format.'); if (seen.has(memberId)) errors.push('Duplicate Member ID in this file.'); seen.add(memberId); if (!name) errors.push('Name is required.'); let phone = rawPhone;
    try { phone = normalizePhone(rawPhone) || ''; } catch { errors.push('Invalid mobile/contact number.'); }
    if (phone && seenPhones.has(phone)) errors.push('Duplicate mobile/contact number in this file.'); seenPhones.add(phone);
    const parsedDate = new Date(joinDate);
    if (!joinDate || Number.isNaN(parsedDate.getTime())) errors.push('Invalid join date.'); else if (parsedDate.getUTCFullYear() !== 2024) errors.push('Only approved 2024 roster members can be imported.'); if (!Number.isInteger(shares) || shares < 1) errors.push('Shares must be a positive whole number.');
    return { memberId, name, phone, joinDate, shares, status: cols[index('status')] || 'Active', errors };
  });
  const token = crypto.randomUUID(); previews.set(token, { rows, expiresAt: Date.now() + 15 * 60_000 });
  return { token, summary: { total: rows.length, valid: rows.filter((row) => !row.errors.length).length, invalid: rows.filter((row) => row.errors.length).length }, rows };
}

export async function saveMemberCsv(token: string, temporaryPassword: string, admin: HydratedDocument<IUser>) {
  const preview = previews.get(token); if (!preview || preview.expiresAt < Date.now()) throw createError('Import preview expired. Upload the CSV again.', 400); if (temporaryPassword.length < 12) throw createError('Temporary password must contain at least 12 characters.', 400); if (preview.rows.some((row) => row.errors.length)) throw createError('Fix CSV validation errors before saving.', 400);
  const existing = await Member.find({ $or: [{ memberId: { $in: preview.rows.map((row) => row.memberId) } }, { phone: { $in: preview.rows.map((row) => row.phone) } }] }).lean(); if (existing.length) throw createError(`Import conflicts with existing member data: ${existing.map((item) => item.memberId).join(', ')}.`, 409);
  const existingUsers = await User.find({ phone: { $in: preview.rows.map((row) => row.phone) } }).select('phone').lean(); if (existingUsers.length) throw createError('One or more imported mobile numbers are already assigned to a user account.', 409);
  const passwordHash = await hashPassword(temporaryPassword); const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); const created: string[] = [];
  for (const row of preview.rows) {
    const memberStatus = toMemberStatus(row.status);
    const member = await Member.create({ memberId: row.memberId, name: cleanName(row.name), phone: row.phone, designation: designation(row.name), status: memberStatus, joinDate: new Date(row.joinDate), cashoutDue: 0 });
    await User.create({ name: member.name, email: `pending-${member.memberId.toLowerCase()}@member.local`, phone: member.phone, passwordHash, role: UserRole.MEMBER, memberId: member._id, designation: null, status: memberStatus === MemberStatus.ACTIVE ? UserStatus.ACTIVE : UserStatus.INACTIVE, mustChangePassword: true, temporaryPasswordExpiresAt: expiresAt, sessionVersion: 0 });
    await ShareHistory.create({ memberId: member._id, shareCount: row.shares, previousShareCount: 0, effectiveMonth: new Date(row.joinDate).toISOString().slice(0, 7), eventType: ShareEventType.INITIAL_ALLOCATION, changedBy: admin._id, notes: 'Approved 2024 roster CSV import.' }); created.push(member.memberId);
  }
  previews.delete(token); await AuditLog.create({ performedBy: admin._id, action: 'IMPORT_APPROVED_MEMBER_CSV', entityName: 'Member', afterState: { count: created.length, memberIds: created }, reason: 'Admin previewed and confirmed approved closed-roster CSV import.' });
  return { count: created.length, temporaryPasswordExpiresAt: expiresAt, memberIds: created };
}
