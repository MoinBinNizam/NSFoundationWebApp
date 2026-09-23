import { HydratedDocument } from 'mongoose';
import { AuditLog, CustodyMovement, Expense, InvestmentReturn, Member, Payment } from '../models/index.js';
import { MigrationBatch } from '../models/MigrationBatch.js';
import { MigrationRecord } from '../models/MigrationRecord.js';
import { IUser, MigrationRecordStatus } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { normalizePhone } from '../middlewares/sanitize.js';

type RecordType = 'MEMBER' | 'PAYMENT' | 'EXPENSE' | 'INVESTMENT_RETURN' | 'CUSTODY_MOVEMENT';
type CsvRow = Record<string, string>;

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw createError('CSV must include a header and at least one data row.', 400);
  const cells = (line: string) => {
    const result: string[] = []; let value = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i += 1; } else quoted = !quoted; } else if (char === ',' && !quoted) { result.push(value.trim()); value = ''; } else value += char; }
    if (quoted) throw createError('CSV contains an unclosed quoted value.', 400); result.push(value.trim()); return result;
  };
  const headers = cells(lines[0]).map((header) => header.trim().toLowerCase());
  if (headers.some((header) => !header)) throw createError('CSV has an empty header.', 400);
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, cells(line)[index] ?? ''])));
}

function toAmount(value: string, field: string, errors: string[]): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) { errors.push(`${field} must be a non-negative number.`); return null; }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

async function normalize(type: RecordType, row: CsvRow, sourceYear: number, sourceMonth: string | undefined, sourceReference: string) {
  const errors: string[] = [];
  const normalized: Record<string, unknown> = { sourceYear, sourceMonth, sourceReference };
  if (type === 'MEMBER') {
    if (!row.memberid || !row.name || !row.phone) errors.push('memberId, name, and phone are required.');
    normalized.memberId = row.memberid?.toUpperCase(); normalized.name = row.name;
    try { normalized.phone = normalizePhone(row.phone); } catch (error) { errors.push(error instanceof Error ? error.message : 'Phone is invalid.'); }
    normalized.email = row.email || undefined; normalized.joinDate = row.joindate || undefined;
  } else {
    if (!row.date) errors.push('date is required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date || '')) errors.push('date must be YYYY-MM-DD.');
    normalized.date = row.date;
    const amount = toAmount(row.amount, 'amount', errors); if (amount !== null) normalized.amount = amount;
    if (type === 'PAYMENT' && !row.memberid) errors.push('memberId is required for payments.');
    if (type === 'PAYMENT') { normalized.memberId = row.memberid?.toUpperCase(); normalized.receiptNumber = row.receiptnumber || undefined; }
    if (type === 'EXPENSE') normalized.category = row.category || undefined;
  }
  return { normalized, errors };
}

export class MigrationService {
  static async stageCsv(input: { name: string; sourceYear: number; sourceMonth?: string; sourceSheet?: string; sourceReference: string; recordType: RecordType; csvText: string }, user: HydratedDocument<IUser>, meta?: { ip?: string; userAgent?: string }) {
    if (!input.name || !input.sourceReference || !input.csvText) throw createError('Name, source reference, and CSV content are required.', 400);
    if (!Number.isInteger(input.sourceYear) || input.sourceYear < 2000 || input.sourceYear > 2100) throw createError('Source year is invalid.', 400);
    const rows = parseCsv(input.csvText); if (rows.length > 5000) throw createError('A migration batch may contain at most 5,000 rows.', 400);
    const batch = await MigrationBatch.create({ name: input.name, sourceYear: input.sourceYear, sourceMonth: input.sourceMonth, sourceSheet: input.sourceSheet, sourceReference: input.sourceReference, createdBy: user._id });
    const seen = new Set<string>(); let verified = 0; let review = 0;
    const records = [];
    for (const [index, row] of rows.entries()) {
      const sourceReference = row.sourcereference || `${input.sourceReference}#${index + 2}`;
      const { normalized, errors } = await normalize(input.recordType, row, input.sourceYear, input.sourceMonth, sourceReference);
      const key = `${input.recordType}:${sourceReference}`;
      let duplicateOf: string | undefined;
      if (seen.has(key) || await MigrationRecord.exists({ recordType: input.recordType, sourceReference })) { duplicateOf = sourceReference; errors.push('Duplicate source reference detected.'); } seen.add(key);
      if (input.recordType === 'PAYMENT' && row.receiptnumber && await Payment.exists({ receiptNumber: row.receiptnumber.toUpperCase() })) { duplicateOf = row.receiptnumber; errors.push('Receipt number already exists in production.'); }
      const status = errors.length ? MigrationRecordStatus.REVIEW_REQUIRED : MigrationRecordStatus.VERIFIED;
      if (status === MigrationRecordStatus.VERIFIED) verified += 1; else review += 1;
      records.push({ batchId: batch._id, rowNumber: index + 2, recordType: input.recordType, status, sourceYear: input.sourceYear, sourceMonth: input.sourceMonth, sourceSheet: input.sourceSheet, sourceRow: index + 2, sourceReference, rawData: row, normalizedData: normalized, validationErrors: errors, duplicateOf });
    }
    await MigrationRecord.insertMany(records);
    batch.totalRows = rows.length; batch.verifiedRows = verified; batch.reviewRows = review; batch.unresolvedRows = 0; await batch.save();
    await AuditLog.create({ performedBy: user._id, action: 'STAGE_HISTORICAL_MIGRATION', entityName: 'MigrationBatch', entityId: batch._id, afterState: { sourceReference: input.sourceReference, recordType: input.recordType, totalRows: rows.length, verified, review }, reason: 'Historical source staged; no production records were posted.', ipAddress: meta?.ip, userAgent: meta?.userAgent });
    return batch;
  }

  static async listBatches() { return MigrationBatch.find().sort({ createdAt: -1 }).limit(50).lean(); }
  static async listRecords(batchId: string, status?: MigrationRecordStatus) { const filter: Record<string, unknown> = { batchId }; if (status) filter.status = status; return MigrationRecord.find(filter).sort({ rowNumber: 1 }).limit(500).lean(); }

  static async reviewRecord(id: string, status: MigrationRecordStatus, reason: string, user: HydratedDocument<IUser>) {
    if (!reason?.trim()) throw createError('A review reason is required.', 400);
    const record = await MigrationRecord.findById(id); if (!record) throw createError('Migration record not found.', 404);
    record.status = status; record.reviewReason = reason.trim(); record.reviewedBy = user._id; record.reviewedAt = new Date(); await record.save();
    const counts = await MigrationRecord.aggregate([{ $match: { batchId: record.batchId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    const batch = await MigrationBatch.findById(record.batchId); if (batch) { batch.verifiedRows = counts.find((item) => item._id === MigrationRecordStatus.VERIFIED)?.count || 0; batch.reviewRows = counts.find((item) => item._id === MigrationRecordStatus.REVIEW_REQUIRED)?.count || 0; batch.unresolvedRows = counts.find((item) => item._id === MigrationRecordStatus.UNRESOLVED)?.count || 0; await batch.save(); }
    await AuditLog.create({ performedBy: user._id, action: 'REVIEW_HISTORICAL_MIGRATION', entityName: 'MigrationRecord', entityId: record._id, afterState: { status, reason }, reason }); return record;
  }

  static async reconciliation(batchId: string) {
    const batch = await MigrationBatch.findById(batchId); if (!batch) throw createError('Migration batch not found.', 404);
    const staged = await MigrationRecord.aggregate([{ $match: { batchId: batch._id, status: MigrationRecordStatus.VERIFIED } }, { $group: { _id: '$recordType', count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$normalizedData.amount', 0] } } } }]);
    const [members, payments, expenses, returns, movements] = await Promise.all([
      Member.countDocuments(),
      Payment.aggregate([{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$totalAmount' } } }]),
      Expense.aggregate([{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
      InvestmentReturn.aggregate([{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$totalReturn' } } }]),
      CustodyMovement.aggregate([{ $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
    ]);
    const live: Record<string, { count: number; amount: number }> = { MEMBER: { count: members, amount: 0 }, PAYMENT: payments[0] || { count: 0, amount: 0 }, EXPENSE: expenses[0] || { count: 0, amount: 0 }, INVESTMENT_RETURN: returns[0] || { count: 0, amount: 0 }, CUSTODY_MOVEMENT: movements[0] || { count: 0, amount: 0 } };
    return Object.entries(live).map(([recordType, current]) => { const source = staged.find((item) => item._id === recordType) || { count: 0, amount: 0 }; return { recordType, stagedCount: source.count, liveCount: current.count, countDifference: current.count - source.count, stagedAmount: Math.round(source.amount * 100) / 100, liveAmount: Math.round(current.amount * 100) / 100, amountDifference: Math.round((current.amount - source.amount) * 100) / 100 }; });
  }
}
