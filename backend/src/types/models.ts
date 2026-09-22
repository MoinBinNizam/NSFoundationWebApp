import { Types } from 'mongoose';

// ==========================================
// ENUMS
// ==========================================

export enum UserRole {
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  MEMBER = 'MEMBER',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum AccountantType {
  PRIMARY = 'PRIMARY',     // Moin - primary custody & authority
  ASSISTANT = 'ASSISTANT', // Samrat - assistant custody
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum MemberStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DROPPED = 'DROPPED',
}

export enum ShareEventType {
  INITIAL_ALLOCATION = 'INITIAL_ALLOCATION', // Initial share count captured during member registration
  TEMPORARY_CHANGE = 'TEMPORARY_CHANGE', // Interim change in 2024 (locked from 2025-01-01)
  ANNUAL_FINALIZATION = 'ANNUAL_FINALIZATION', // Closing year baseline
  TRANSFER = 'TRANSFER', // Post-2024 share sale/transfer between members
}

export enum PaymentStatus {
  COLLECTED = 'COLLECTED',
  VERIFIED = 'VERIFIED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  BKASH = 'BKASH',
  NAGAD = 'NAGAD',
  OTHER = 'OTHER',
}

export enum AllocationType {
  PREVIOUS_DUE = 'PREVIOUS_DUE',
  PRINCIPAL = 'PRINCIPAL',
  PENALTY = 'PENALTY',
  ADVANCE = 'ADVANCE',
}

export enum MonthlyLedgerStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  DUE = 'DUE',
  WAIVED = 'WAIVED',
}

export enum AccountType {
  ACCOUNTANT_CUSTODY = 'ACCOUNTANT_CUSTODY',   // Moin / Samrat physical & bank holding
  EXTERNAL_WALLET = 'EXTERNAL_WALLET',         // GrowUp, Zayan external wallets
  EXTERNAL_INVESTMENT = 'EXTERNAL_INVESTMENT', // Active deployed projects
  EXTERNAL_PERSON = 'EXTERNAL_PERSON',         // Direct person relationships
}

export enum CustodyChannel {
  BANK = 'BANK',
  BKASH = 'BKASH',
  NAGAD = 'NAGAD',
  CASH = 'CASH',
  WALLET = 'WALLET',
  OTHER = 'OTHER',
}

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
}

export enum MovementSourceType {
  MEMBER_PAYMENT = 'MEMBER_PAYMENT',
  INTERNAL_TRANSFER = 'INTERNAL_TRANSFER',
  INVESTMENT_FUNDING = 'INVESTMENT_FUNDING',
  INVESTMENT_RETURN = 'INVESTMENT_RETURN',
  EXPENSE = 'EXPENSE',
  ADJUSTMENT = 'ADJUSTMENT',
  FINAL_DISTRIBUTION = 'FINAL_DISTRIBUTION',
}

export enum ProjectStatus {
  PROPOSED = 'PROPOSED',
  ACTIVE = 'ACTIVE',
  MATURED = 'MATURED',
  CLOSED = 'CLOSED',
  DEFAULTED = 'DEFAULTED',
}

export enum ReturnDestinationType {
  EXTERNAL_WALLET = 'EXTERNAL_WALLET',
  ACCOUNTANT_CUSTODY = 'ACCOUNTANT_CUSTODY',
}

export enum DistributionBatchStatus {
  DRAFT = 'DRAFT',
  REVIEWED = 'REVIEWED',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REVERSED = 'REVERSED',
}

export enum DistributionBasis {
  FINALIZED_SHARES = 'FINALIZED_SHARES',
  ACTIVE_SHARES = 'ACTIVE_SHARES',
}

// ==========================================
// MODEL INTERFACES
// ==========================================

// 1. User
export interface IUser {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  accountantType?: AccountantType | null;
  linkedGatewayChannels?: CustodyChannel[];
  gatewayAccessKeyHash?: string | null;
  gatewayAccessKeyPrefix?: string | null;
  sessionVersion?: number;
  offboardedAt?: Date | null;
  offboardedBy?: Types.ObjectId | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

// 2. AuditLog
export interface IAuditLog {
  performedBy: Types.ObjectId;
  action: string;
  entityName: string;
  entityId?: Types.ObjectId;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// 3. Member
export interface IMember {
  memberId: string; // e.g. "NS-001"
  name: string;
  phone: string;
  email?: string;
  status: MemberStatus;
  joinDate: Date;
  address?: string;
  notes?: string;
  cashoutDue?: number; // Outstanding cash out charges from unpaid gateway fees
  createdAt: Date;
  updatedAt: Date;
}

// 4. ShareHistory
export interface IShareHistory {
  memberId: Types.ObjectId;
  effectiveMonth: string; // Format: "YYYY-MM"
  shareCount: number;
  previousShareCount: number;
  eventType: ShareEventType;
  transferDetails?: {
    fromMemberId?: Types.ObjectId;
    toMemberId?: Types.ObjectId;
    transferNote?: string;
  };
  changedBy: Types.ObjectId;
  isAdministrativeOverride?: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 5. MemberYearAccount
export interface IMemberYearAccount {
  memberId: Types.ObjectId;
  year: number; // e.g. 2024
  finalShares: number;
  annualObligation: number;
  totalPrincipalPaid: number;
  shortfall: number;
  excessAdvance: number;
  isSettled: boolean;
  settledAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 6. SystemConfig
export interface ISystemConfig {
  key: string;
  value: unknown;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  description?: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// 7. PenaltyRule
export interface IPenaltyRule {
  effectiveFrom: string; // Format: "YYYY-MM"
  effectiveTo?: string | null;
  ratePerShare: number;
  graceDayOfMonth: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 8. PenaltyWaiver
export interface IPenaltyWaiver {
  month: string; // Format: "YYYY-MM"
  memberId?: Types.ObjectId | null; // null if global waiver
  isGlobal: boolean;
  reason: string;
  approvedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// 9. GatewayRate
export interface IGatewayRate {
  channel: CustodyChannel;
  cashoutRatePercentage: number;
  fixedFee: number;
  roundingIncrement?: number; // 0 keeps the exact charge; a positive amount rounds the charge upward
  effectiveFrom: Date;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 10. Payment
export interface IPayment {
  receiptNumber: string;
  memberId: Types.ObjectId;
  receiverId: Types.ObjectId; // User (Accountant)
  custodyAccountId: Types.ObjectId; // Destination CustodyAccount
  paymentDate: Date;
  totalAmount: number;
  principalAmount: number;
  penaltyAmount: number;
  cashoutCharge: number; // Cash out charge paid by member
  unpaidCashoutCharge?: number; // Gateway fee not paid by member, added to member's cashoutDue
  advanceAmount: number;
  paymentMethod: PaymentMethod;
  transactionReference?: string;
  status: PaymentStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 11. PaymentAllocation
export interface IPaymentAllocation {
  paymentId: Types.ObjectId;
  memberId: Types.ObjectId;
  targetMonth: string; // Format: "YYYY-MM"
  allocationType: AllocationType;
  amount: number;
  createdAt: Date;
}

// 12. MonthlyLedger (Derived / Cached projection)
export interface IMonthlyLedger {
  memberId: Types.ObjectId;
  month: string; // Format: "YYYY-MM"
  shareCount: number;
  principalDue: number;
  penaltyDue: number;
  principalPaid: number;
  penaltyPaid: number;
  advanceApplied: number;
  excessAdvance: number;
  status: MonthlyLedgerStatus;
  lastRebuiltAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// 13. CustodyAccount
export interface ICustodyAccount {
  name: string;
  accountType: AccountType;
  holderId?: Types.ObjectId | null; // User (e.g. Moin or Samrat)
  channel: CustodyChannel;
  accountNumber?: string;
  cachedBalance: number;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 14. CustodyMovement
export interface ICustodyMovement {
  custodyAccountId: Types.ObjectId;
  movementType: MovementType;
  amount: number;
  sourceType: MovementSourceType;
  sourceRefId?: Types.ObjectId | null; // Polymorphic ref (Payment, FundTransfer, Expense, etc.)
  date: Date;
  description?: string;
  performedBy: Types.ObjectId;
  createdAt: Date;
}

// 15. FundTransfer
export interface IFundTransfer {
  transferNumber: string;
  sourceAccountId: Types.ObjectId;
  destinationAccountId: Types.ObjectId;
  amount: number;
  date: Date;
  purpose?: string;
  outMovementId?: Types.ObjectId;
  inMovementId?: Types.ObjectId;
  transferredBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// 16. InvestmentProject
export interface IInvestmentProject {
  projectId: string; // e.g. "PRJ-001"
  name: string;
  description?: string;
  category?: string;
  startDate: Date;
  maturityDate?: Date;
  expectedROI?: number;
  targetPrincipal: number;
  totalFunded: number;
  status: ProjectStatus;
  externalEntity?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 17. InvestmentFunding
export interface IInvestmentFunding {
  projectId: Types.ObjectId;
  custodyAccountId: Types.ObjectId;
  amount: number;
  date: Date;
  transactionRef?: string;
  custodyMovementId?: Types.ObjectId;
  fundedBy: Types.ObjectId;
  notes?: string;
  createdAt: Date;
}

// 18. InvestmentReturn
export interface IInvestmentReturn {
  projectId: Types.ObjectId;
  maturityDate: Date;
  principalReturned: number;
  actualProfit: number;
  actualLoss: number;
  totalReturn: number;
  destinationType: ReturnDestinationType;
  destinationCustodyAccountId?: Types.ObjectId | null;
  custodyMovementId?: Types.ObjectId | null;
  notes?: string;
  recordedBy: Types.ObjectId;
  createdAt: Date;
}

// 19. Reinvestment
export interface IReinvestment {
  sourceProjectId: Types.ObjectId;
  destinationProjectId: Types.ObjectId;
  walletAccountId: Types.ObjectId;
  reinvestedAmount: number;
  newAccountantFunds: number;
  newAccountantCustodyAccountId?: Types.ObjectId | null;
  date: Date;
  notes?: string;
  approvedBy: Types.ObjectId;
  createdAt: Date;
}

// 20. Expense
export interface IExpense {
  expenseNumber: string;
  custodyAccountId: Types.ObjectId;
  amount: number;
  category: string;
  date: Date;
  description: string;
  custodyMovementId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  receiptUrl?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 21. Policy
export interface IPolicy {
  serialNumber: number;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
  currentVersion: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// 22. PolicyVersion
export interface IPolicyVersion {
  policyId: Types.ObjectId;
  versionNumber: number;
  content: string;
  changeReason?: string;
  modifiedBy: Types.ObjectId;
  createdAt: Date;
}

// 23. DistributionBatch
export interface IDistributionBatch {
  batchNumber: string;
  year: number;
  title: string;
  status: DistributionBatchStatus;
  basis: DistributionBasis;
  totalPool: number;
  totalPrincipalReturned: number;
  netRealizedProfit: number;
  totalExpenses: number;
  retainedAmount: number;
  distributableAmount: number;
  totalShares: number;
  amountPerShare: number;
  memberCount: number;
  custodyAccountId?: Types.ObjectId;
  preparedBy: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  paidBy?: Types.ObjectId;
  paidAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 24. MemberDistribution
export interface IMemberDistribution {
  batchId: Types.ObjectId;
  memberId: Types.ObjectId;
  memberCode: string;
  memberName: string;
  year: number;
  finalShares: number;
  shareRatio: number;
  grossEntitlement: number;
  shortfallDeduction: number;
  advanceCredit: number;
  penaltyAdjustment: number;
  netDistributionAmount: number;
  status: 'PENDING' | 'PAID' | 'REVERSED';
  custodyMovementId?: Types.ObjectId;
  paidAt?: Date;
  paymentReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
