import { SystemConfig } from '../models/SystemConfig.js';
import { AuditLog } from '../models/AuditLog.js';
import { IUser, UserRole, MemberDesignation } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { HydratedDocument } from 'mongoose';
import { GatewayRate } from '../models/GatewayRate.js';
import { CustodyChannel } from '../types/models.js';
import { ModulePermission } from '../models/ModulePermission.js';

export const MONTHLY_SHARE_VALUE_KEY = 'MONTHLY_SHARE_VALUE';
export const DEFAULT_MONTHLY_SHARE_VALUE = 500;
export const DEFAULT_OPERATIONAL_END_YEAR = 2028;
const DEFAULT_GATEWAY_RATES = [
  { channel: CustodyChannel.BKASH, cashoutRatePercentage: 1.85, fixedFee: 0, roundingIncrement: 0, description: 'Standard bKash agent cash-out rate; exact calculated charge without rounding.' },
  { channel: CustodyChannel.NAGAD, cashoutRatePercentage: 1.49, fixedFee: 0, roundingIncrement: 0, description: 'Nagad app cash-out rate; exact calculated charge without rounding.' },
  { channel: CustodyChannel.BANK, cashoutRatePercentage: 0, fixedFee: 0, roundingIncrement: 0, description: 'Incoming Islami Bank / CellFin transfers carry no cash-out charge.' },
  { channel: CustodyChannel.CASH, cashoutRatePercentage: 0, fixedFee: 0, roundingIncrement: 0, description: 'Direct physical cash handover carries no cash-out charge.' },
] as const;

/** The active monthly contribution amount for one organization share. */
export async function getMonthlyShareValue(): Promise<number> {
  const config = await SystemConfig.findOne({ key: MONTHLY_SHARE_VALUE_KEY }).lean();
  return config && typeof config.value === 'number' ? config.value : DEFAULT_MONTHLY_SHARE_VALUE;
}

export async function getMonthlyShareSetting() {
  const config = await SystemConfig.findOne({ key: MONTHLY_SHARE_VALUE_KEY }).lean();
  return {
    value: config && typeof config.value === 'number' ? config.value : DEFAULT_MONTHLY_SHARE_VALUE,
    description: config?.description || 'Monthly payable amount for one organization share.',
    updatedAt: config?.updatedAt || null,
    isDefault: !config,
  };
}

/** Changes the organization-wide share amount and records a complete audit trail. */
export async function saveMonthlyShareValue(
  value: number,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
) {
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw createError('Share amount must be a positive value no greater than BDT 1,000,000.', 400);
  }

  const before = await SystemConfig.findOne({ key: MONTHLY_SHARE_VALUE_KEY }).lean();
  const config = await SystemConfig.findOneAndUpdate(
    { key: MONTHLY_SHARE_VALUE_KEY },
    {
      value: Math.round(value * 100) / 100,
      description: 'Monthly payable amount for one organization share.',
      updatedBy: actingUser._id,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'UPDATE_ORGANIZATION_SHARE_AMOUNT',
    entityName: 'SystemConfig',
    entityId: config._id,
    beforeState: before || null,
    afterState: config.toObject(),
    reason: `Organization monthly share amount set to BDT ${config.value}.`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return config;
}

/** Returns editable live gateway rules, including safe defaults before a rule is saved. */
export async function getGatewayRateSettings() {
  const savedRates = await GatewayRate.find().sort({ channel: 1, effectiveFrom: -1 }).lean();
  const latestByChannel = new Map<string, (typeof savedRates)[number]>();
  for (const rate of savedRates) {
    if (!latestByChannel.has(rate.channel)) latestByChannel.set(rate.channel, rate);
  }
  return DEFAULT_GATEWAY_RATES.map((fallback) => {
    const saved = latestByChannel.get(fallback.channel);
    return saved
      ? { ...saved, roundingIncrement: saved.roundingIncrement ?? 0, isDefault: false }
      : { ...fallback, _id: `default-${fallback.channel}`, effectiveFrom: null, isDefault: true };
  });
}

export async function getGatewayRateForChannel(channel: CustodyChannel, at: Date = new Date()) {
  const saved = await GatewayRate.findOne({ channel, effectiveFrom: { $lte: at } }).sort({ effectiveFrom: -1 }).lean();
  if (saved) return { ...saved, roundingIncrement: saved.roundingIncrement ?? 0 };
  return DEFAULT_GATEWAY_RATES.find((rate) => rate.channel === channel) || {
    channel,
    cashoutRatePercentage: 0,
    fixedFee: 0,
    roundingIncrement: 0,
    description: 'No cash-out charge rule configured.',
  };
}

export async function saveGatewayRate(
  input: { channel: CustodyChannel; cashoutRatePercentage: number; fixedFee?: number; roundingIncrement?: number; description?: string },
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
) {
  if (!Object.values(CustodyChannel).includes(input.channel)) throw createError('A valid gateway channel is required.', 400);
  if (!Number.isFinite(input.cashoutRatePercentage) || input.cashoutRatePercentage < 0 || input.cashoutRatePercentage > 100) throw createError('Gateway percentage must be between 0 and 100.', 400);
  if (!Number.isFinite(Number(input.fixedFee || 0)) || Number(input.fixedFee || 0) < 0) throw createError('Fixed fee cannot be negative.', 400);
  const increment = Number(input.roundingIncrement ?? 0);
  if (!Number.isInteger(increment) || increment < 0 || increment > 1000) throw createError('Rounding increment must be a whole amount between BDT 0 and 1,000.', 400);

  const before = await GatewayRate.findOne({ channel: input.channel }).sort({ effectiveFrom: -1 }).lean();
  const rate = await GatewayRate.findOneAndUpdate(
    { channel: input.channel },
    { channel: input.channel, cashoutRatePercentage: input.cashoutRatePercentage, fixedFee: Number(input.fixedFee || 0), roundingIncrement: increment, description: input.description?.trim() || '' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'UPDATE_GATEWAY_CASHOUT_RULE',
    entityName: 'GatewayRate',
    entityId: rate._id,
    beforeState: before || null,
    afterState: rate.toObject(),
    reason: `${input.channel} cash-out rule set to ${rate.cashoutRatePercentage}% with BDT ${rate.roundingIncrement} rounding.`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });
  return rate;
}

export async function getOperationalEndYear() {
  const config = await SystemConfig.findOne({ key: 'OPERATIONAL_END_YEAR' }).lean();
  const value = config && typeof config.value === 'number' ? config.value : DEFAULT_OPERATIONAL_END_YEAR;
  return { value, updatedAt: config?.updatedAt || null, isDefault: !config };
}

export async function saveOperationalEndYear(value: number, actingUser: HydratedDocument<IUser>, meta?: { ip?: string; userAgent?: string }) {
  if (!Number.isInteger(value) || value < DEFAULT_OPERATIONAL_END_YEAR || value > 2100) throw createError('Operational end year must be a whole year from 2028 through 2100.', 400);
  const before = await SystemConfig.findOne({ key: 'OPERATIONAL_END_YEAR' }).lean();
  const config = await SystemConfig.findOneAndUpdate({ key: 'OPERATIONAL_END_YEAR' }, { value, description: 'Voter-approved operational end year for final disbursement calculations.', updatedBy: actingUser._id }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await AuditLog.create({ performedBy: actingUser._id, action: 'UPDATE_OPERATIONAL_END_YEAR', entityName: 'SystemConfig', entityId: config._id, beforeState: before || null, afterState: config.toObject(), reason: `Operational end year set to ${value}.`, ipAddress: meta?.ip, userAgent: meta?.userAgent });
  return config;
}

export const APP_MODULES = [
  { key: 'DASHBOARD', label: 'Dashboard & Reports', description: 'Organization dashboard, financial overview, and report summaries' },
  { key: 'DOCUMENTS', label: 'Statements & Reports', description: 'Member statements, reports, and downloadable audit documents' },
  { key: 'MEMBERS', label: 'Member Management', description: 'Register, edit, and manage member profiles & shares' },
  { key: 'SHARES', label: 'Shares & Annual Account', description: 'Share positions, transfers, and annual account reconciliation' },
  { key: 'PAYMENTS', label: 'Contributions & Payments', description: 'Record, preview, verify, and track monthly member share payments' },
  { key: 'CUSTODY', label: 'Accountant Custody Ledger', description: 'Double-entry cash, bank, and mobile gateway accounts & transfers' },
  { key: 'INVESTMENTS', label: 'Investment Management', description: 'Capital deployment, profit tracking, and project monitoring' },
  { key: 'PROJECT_WALLETS', label: 'Project Wallets & Reinvestment', description: 'Project wallet balances, reinvestment chains, and capital lineage' },
  { key: 'EXPENSES', label: 'Expense Management', description: 'Operational expenses and payment-account reporting' },
  { key: 'REPORTS', label: 'Financial Reports & Distribution', description: 'Annual closing, dividend calculations, and balance sheets' },
  { key: 'GOVERNANCE', label: 'Governance & AGM', description: 'Resolutions, meetings, voting, and regulatory minutes' },
  { key: 'SETTINGS', label: 'System Settings', description: 'Share rates, cashout percentages, and operational parameters' },
  { key: 'AUDIT', label: 'Audit & Security', description: 'Audit trails, access history, and security monitoring' },
  { key: 'MIGRATIONS', label: 'Historical Migration', description: 'Staged historical data import and reconciliation review' },
  { key: 'DISTRIBUTION', label: 'Final Distribution', description: 'Final member distribution and annual settlement workflow' },
] as const;

export const DEFAULT_DESIGNATION_PERMISSIONS: Record<string, Record<string, { canView: boolean; canEdit: boolean }>> = {
  [MemberDesignation.DIRECTOR]: {
    MEMBERS: { canView: true, canEdit: false },
    PAYMENTS: { canView: true, canEdit: false },
    CUSTODY: { canView: true, canEdit: false },
    INVESTMENTS: { canView: true, canEdit: true },
    REPORTS: { canView: true, canEdit: true },
    GOVERNANCE: { canView: true, canEdit: true },
    SETTINGS: { canView: true, canEdit: true },
  },
  [MemberDesignation.PRESIDENT]: {
    MEMBERS: { canView: true, canEdit: true },
    PAYMENTS: { canView: true, canEdit: true },
    CUSTODY: { canView: true, canEdit: true },
    INVESTMENTS: { canView: true, canEdit: true },
    REPORTS: { canView: true, canEdit: true },
    GOVERNANCE: { canView: true, canEdit: true },
    SETTINGS: { canView: true, canEdit: true },
  },
  [MemberDesignation.ACCOUNTANT]: {
    MEMBERS: { canView: true, canEdit: true },
    PAYMENTS: { canView: true, canEdit: true },
    CUSTODY: { canView: true, canEdit: true },
    INVESTMENTS: { canView: true, canEdit: true },
    REPORTS: { canView: true, canEdit: true },
    GOVERNANCE: { canView: true, canEdit: false },
    SETTINGS: { canView: true, canEdit: false },
  },
  [MemberDesignation.ASSISTANT_ACCOUNTANT]: {
    MEMBERS: { canView: true, canEdit: false },
    PAYMENTS: { canView: true, canEdit: true },
    CUSTODY: { canView: true, canEdit: true },
    INVESTMENTS: { canView: false, canEdit: false },
    REPORTS: { canView: true, canEdit: false },
    GOVERNANCE: { canView: false, canEdit: false },
    SETTINGS: { canView: false, canEdit: false },
  },
  [MemberDesignation.GENERAL_SECRETARY]: {
    MEMBERS: { canView: true, canEdit: true },
    PAYMENTS: { canView: true, canEdit: false },
    CUSTODY: { canView: true, canEdit: false },
    INVESTMENTS: { canView: true, canEdit: true },
    REPORTS: { canView: true, canEdit: true },
    GOVERNANCE: { canView: true, canEdit: true },
    SETTINGS: { canView: true, canEdit: false },
  },
  [MemberDesignation.CONVENER]: {
    MEMBERS: { canView: true, canEdit: false },
    PAYMENTS: { canView: true, canEdit: false },
    CUSTODY: { canView: true, canEdit: false },
    INVESTMENTS: { canView: true, canEdit: false },
    REPORTS: { canView: true, canEdit: false },
    GOVERNANCE: { canView: true, canEdit: true },
    SETTINGS: { canView: false, canEdit: false },
  },
  [MemberDesignation.GENERAL_MEMBER]: {
    MEMBERS: { canView: true, canEdit: false },
    PAYMENTS: { canView: true, canEdit: false },
    CUSTODY: { canView: false, canEdit: false },
    INVESTMENTS: { canView: false, canEdit: false },
    REPORTS: { canView: false, canEdit: false },
    GOVERNANCE: { canView: false, canEdit: false },
    SETTINGS: { canView: false, canEdit: false },
  },
};

/**
 * Returns list of all defined roles/designations with their active module permission settings.
 */
export async function getModulePermissions() {
  const saved = await ModulePermission.find().lean();
  const savedMap = new Map<string, (typeof saved)[number]>();
  for (const doc of saved) {
    savedMap.set(doc.roleOrDesignation, doc);
  }

  const allRolesOrDesignations = [
    UserRole.SUPER_ADMIN,
    ...Object.values(MemberDesignation),
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.MEMBER,
  ];

  return allRolesOrDesignations.map((key) => {
    const existing = savedMap.get(key);
    const defaultModules = key === UserRole.SUPER_ADMIN
      ? Object.fromEntries(APP_MODULES.map((module) => [module.key, { canView: true, canEdit: true }]))
      : DEFAULT_DESIGNATION_PERMISSIONS[key] || {
      MEMBERS: { canView: true, canEdit: key === UserRole.ADMIN },
      PAYMENTS: { canView: true, canEdit: key === UserRole.ADMIN || key === UserRole.ACCOUNTANT },
      CUSTODY: { canView: true, canEdit: key === UserRole.ADMIN || key === UserRole.ACCOUNTANT },
      INVESTMENTS: { canView: key !== UserRole.MEMBER, canEdit: key === UserRole.ADMIN },
      REPORTS: { canView: key !== UserRole.MEMBER, canEdit: key === UserRole.ADMIN },
      GOVERNANCE: { canView: key !== UserRole.MEMBER, canEdit: key === UserRole.ADMIN },
      SETTINGS: { canView: key === UserRole.ADMIN, canEdit: key === UserRole.ADMIN },
    };

    return {
      roleOrDesignation: key,
      modules: existing ? { ...defaultModules, ...existing.modules } : defaultModules,
      updatedAt: existing?.updatedAt || null,
      isCustomized: !!existing,
    };
  });
}

/**
 * Super Admin updates dynamic module permissions for a given role or designation.
 */
export async function saveModulePermissions(
  roleOrDesignation: string,
  modules: Record<string, { canView: boolean; canEdit: boolean }>,
  actingUser: HydratedDocument<IUser>,
  meta?: { ip?: string; userAgent?: string }
) {
  const allowedKeys = new Set([...Object.values(MemberDesignation), ...Object.values(UserRole)]);
  if (!roleOrDesignation || typeof roleOrDesignation !== 'string' || !allowedKeys.has(roleOrDesignation as UserRole | MemberDesignation)) {
    throw createError('Valid role or designation key is required.', 400);
  }
  if (roleOrDesignation === UserRole.SUPER_ADMIN) {
    throw createError('Super Admin permissions are always unrestricted and cannot be changed.', 400);
  }
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
    throw createError('A valid module permission matrix is required.', 400);
  }
  const allowedModuleKeys = new Set<string>(APP_MODULES.map((module) => module.key));
  const normalizedModules: Record<string, { canView: boolean; canEdit: boolean }> = {};
  for (const [moduleKey, permission] of Object.entries(modules)) {
    if (!allowedModuleKeys.has(moduleKey)) throw createError(`Unknown module key '${moduleKey}'.`, 400);
    if (!permission || typeof permission.canView !== 'boolean' || typeof permission.canEdit !== 'boolean') {
      throw createError(`Module '${moduleKey}' must define boolean canView and canEdit values.`, 400);
    }
    normalizedModules[moduleKey] = {
      canView: permission.canView || permission.canEdit,
      canEdit: permission.canEdit,
    };
  }

  const before = await ModulePermission.findOne({ roleOrDesignation }).lean();
  const record = await ModulePermission.findOneAndUpdate(
    { roleOrDesignation },
    {
      roleOrDesignation,
      modules: normalizedModules,
      updatedBy: actingUser._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await AuditLog.create({
    performedBy: actingUser._id,
    action: 'UPDATE_MODULE_PERMISSIONS',
    entityName: 'ModulePermission',
    entityId: record._id,
    beforeState: before || null,
    afterState: record.toObject(),
    reason: `Updated dynamic module permissions for '${roleOrDesignation}'.`,
    ipAddress: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return record;
}

/**
 * Resolves the effective module permissions for a logged in user.
 * Super Admin gets universal access.
 */
export async function getUserEffectivePermissions(user: HydratedDocument<IUser>) {
  if (user.role === UserRole.SUPER_ADMIN) {
    const fullAccess: Record<string, { canView: boolean; canEdit: boolean }> = {};
    for (const mod of APP_MODULES) {
      fullAccess[mod.key] = { canView: true, canEdit: true };
    }
    return {
      roleOrDesignation: 'SUPER_ADMIN',
      modules: fullAccess,
      isSuperAdmin: true,
    };
  }

  const designation = user.designation;
  const role = user.role;

  const permDoc =
    (designation ? await ModulePermission.findOne({ roleOrDesignation: designation }).lean() : null) ||
    (await ModulePermission.findOne({ roleOrDesignation: role }).lean());

  const defaultMods =
    (designation && DEFAULT_DESIGNATION_PERMISSIONS[designation]) ||
    (DEFAULT_DESIGNATION_PERMISSIONS[role] || {
      MEMBERS: { canView: true, canEdit: role === UserRole.ADMIN },
      PAYMENTS: { canView: true, canEdit: role === UserRole.ADMIN || role === UserRole.ACCOUNTANT },
      CUSTODY: { canView: true, canEdit: role === UserRole.ADMIN || role === UserRole.ACCOUNTANT },
      INVESTMENTS: { canView: role !== UserRole.MEMBER, canEdit: role === UserRole.ADMIN },
      REPORTS: { canView: role !== UserRole.MEMBER, canEdit: role === UserRole.ADMIN },
      GOVERNANCE: { canView: role !== UserRole.MEMBER, canEdit: role === UserRole.ADMIN },
      SETTINGS: { canView: role === UserRole.ADMIN, canEdit: role === UserRole.ADMIN },
    });

  const resolvedModules: Record<string, { canView: boolean; canEdit: boolean }> = {};
  for (const mod of APP_MODULES) {
    const defaultVal = defaultMods[mod.key] || { canView: false, canEdit: false };
    const savedVal = permDoc?.modules?.[mod.key];
    resolvedModules[mod.key] = {
      canView: typeof savedVal?.canView === 'boolean' ? savedVal.canView : defaultVal.canView,
      canEdit: typeof savedVal?.canEdit === 'boolean' ? savedVal.canEdit : defaultVal.canEdit,
    };
  }

  // Safety hard lock: If designation is DIRECTOR, enforce read-only on PAYMENTS, MEMBERS, CUSTODY
  // unless explicitly customized by Super Admin
  if (designation === MemberDesignation.DIRECTOR && !permDoc?.modules?.['PAYMENTS']) {
    resolvedModules['PAYMENTS'] = { canView: true, canEdit: false };
    resolvedModules['MEMBERS'] = { canView: true, canEdit: false };
    resolvedModules['CUSTODY'] = { canView: true, canEdit: false };
  }

  return {
    roleOrDesignation: designation || role,
    modules: resolvedModules,
    isSuperAdmin: false,
  };
}
