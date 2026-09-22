import { SystemConfig } from '../models/SystemConfig.js';
import { AuditLog } from '../models/AuditLog.js';
import { IUser } from '../types/models.js';
import { createError } from '../middlewares/error.js';
import { HydratedDocument } from 'mongoose';
import { GatewayRate } from '../models/GatewayRate.js';
import { CustodyChannel } from '../types/models.js';

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
