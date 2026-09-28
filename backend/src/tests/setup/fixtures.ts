import { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from '../../models/User.js';
import { Member } from '../../models/Member.js';
import { CustodyAccount } from '../../models/CustodyAccount.js';
import { CustodyMovement } from '../../models/CustodyMovement.js';
import { ShareHistory } from '../../models/ShareHistory.js';
import { GatewayRate } from '../../models/GatewayRate.js';
import { PenaltyRule } from '../../models/PenaltyRule.js';
import { UserRole, AccountantType, UserStatus, CustodyChannel, AccountType, MovementType, MovementSourceType } from '../../types/models.js';
import { generateToken } from '../../utils/jwt.js';

dotenv.config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-vitest-integration-32chars!';

export interface TestAuthContext {
  user: any;
  token: string;
}

export async function createTestUser(
  email: string,
  role: UserRole,
  accountantType: AccountantType | null = null,
  name: string = 'Test User'
): Promise<TestAuthContext> {
  const existing = await User.findOne({ email });
  if (existing) {
    await User.deleteOne({ _id: existing._id });
  }

  const hashedPassword = await bcrypt.hash('Password123!', 8);
  const user = await User.create({
    name,
    email,
    passwordHash: hashedPassword,
    role,
    accountantType,
    status: UserStatus.ACTIVE,
    sessionVersion: 1,
  });

  const token = generateToken({
    userId: String(user._id),
    email: user.email,
    role: user.role,
    accountantType: user.accountantType,
    sessionVersion: user.sessionVersion,
  });

  return { user, token };
}

export async function createTestMember(
  memberId: string,
  name: string,
  shares: number = 2,
  joinDate: Date = new Date('2024-01-01')
): Promise<any> {
  await Member.deleteOne({ memberId });
  const member = await Member.create({
    memberId,
    name,
    phone: `+88017${Math.floor(10000000 + Math.random() * 90000000)}`,
    status: 'ACTIVE',
    totalShares: shares,
    sharePurchaseAmount: shares * 500,
    monthlyPayable: shares * 500,
    joinDate,
    cashoutDue: 0,
  });

  await ShareHistory.create({
    memberId: member._id,
    shareCount: shares,
    previousShareCount: 0,
    effectiveMonth: '2024-01',
    eventType: 'TEMPORARY_CHANGE',
    changedBy: new Types.ObjectId(),
    notes: 'Initial fixture shares',
  });

  return member;
}

export async function createTestCustodyAccount(
  name: string,
  channel: CustodyChannel,
  initialBalance: number = 100000,
  holderId?: any
): Promise<any> {
  let account = await CustodyAccount.findOne({ name });
  if (!account) {
    account = await CustodyAccount.create({
      name,
      accountType: AccountType.ACCOUNTANT_CUSTODY,
      channel,
      accountNumber: `ACC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
      cachedBalance: initialBalance,
      holderId: holderId ? new Types.ObjectId(holderId) : undefined,
      isActive: true,
    });
  } else {
    account.cachedBalance = initialBalance;
    if (holderId) {
      account.holderId = new Types.ObjectId(holderId);
    }
    await account.save();
  }

  // Clear existing movements for clean deterministic integration testing
  await CustodyMovement.deleteMany({ custodyAccountId: account._id });

  if (initialBalance > 0) {
    await CustodyMovement.create({
      custodyAccountId: account._id,
      movementType: MovementType.IN,
      category: 'OPENING_BALANCE',
      amount: initialBalance,
      sourceType: MovementSourceType.ADJUSTMENT,
      date: new Date('2024-01-01'),
      description: 'Opening Test Balance',
      performedBy: holderId ? new Types.ObjectId(holderId) : new Types.ObjectId(),
    });
  }

  return account;
}

export async function ensureDefaultTestRules(): Promise<void> {
  // Ensure default penalty rule exists (40 BDT/share after 15th)
  const existingRule = await PenaltyRule.findOne({ isActive: true });
  if (!existingRule) {
    await PenaltyRule.create({
      effectiveFrom: '2024-01',
      ratePerShare: 40,
      graceDayOfMonth: 15,
      isActive: true,
      description: 'Default society late fee',
      createdBy: new Types.ObjectId(),
    });
  }

  // Ensure default gateway rate exists for bKash
  const existingGateway = await GatewayRate.findOne({ channel: CustodyChannel.BKASH });
  if (!existingGateway) {
    await GatewayRate.create({
      channel: CustodyChannel.BKASH,
      cashoutRatePercentage: 1.85,
      roundingIncrement: 0,
      fixedFee: 0,
      description: 'bKash Cashout Fee Rule',
    });
  }
}

