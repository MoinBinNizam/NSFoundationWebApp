# Walkthrough: Issue #2 — Database & Domain Models

All domain entities and relationship schemas defined in the Domain Architecture and System Requirements Specification have been created, strictly typed, and verified with Mongoose.

---

## 1. Domain Types & Enums Defined

[`backend/src/types/models.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/types/models.ts) contains all TypeScript enums and document interfaces:
* **Enums**: `UserRole`, `AccountantType`, `UserStatus`, `MemberStatus`, `ShareEventType`, `PaymentStatus`, `PaymentMethod`, `AllocationType`, `MonthlyLedgerStatus`, `AccountType`, `CustodyChannel`, `MovementType`, `MovementSourceType`, `ProjectStatus`, `ReturnDestinationType`.
* **22 Domain Interfaces**: Typed to avoid runtime mistakes and ensure compiler safety.

---

## 2. Models Created

### A. Security & RBAC
| Model | Schema File | Core Responsibilities & References |
| :--- | :--- | :--- |
| **`User`** | [`User.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/User.ts) | Admin & Accountant credentials, `role` (`ADMIN`, `ACCOUNTANT`), and `accountantType` (`PRIMARY` Moin, `ASSISTANT` Samrat). Excludes `passwordHash` by default. |
| **`AuditLog`** | [`AuditLog.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/AuditLog.ts) | Immutable audit log capturing `performedBy` (ref: `User`), action, target entity, before/after states, and user agents. |

### B. Membership & Shares
| Model | Schema File | Core Responsibilities & References |
| :--- | :--- | :--- |
| **`Member`** | [`Member.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/Member.ts) | Cooperative member master data with unique `memberId` (e.g. `NS-001`) and phone. |
| **`ShareHistory`** | [`ShareHistory.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/ShareHistory.ts) | Immutable share events. **Enforces post-2024 share lock rule**: Blocks normal share modifications from January 1, 2025 onwards unless marked with `isAdministrativeOverride`. |
| **`MemberYearAccount`** | [`MemberYearAccount.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/MemberYearAccount.ts) | Authoritative annual reconciliation state per member and year with unique `{ memberId, year }`. |

### C. Rule & Config Parameters
| Model | Schema File | Core Responsibilities & References |
| :--- | :--- | :--- |
| **`SystemConfig`** | [`SystemConfig.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/SystemConfig.ts) | Effective-dated global parameters (e.g., share value). |
| **`PenaltyRule`** | [`PenaltyRule.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/PenaltyRule.ts) | Effective-dated penalty rates per share (e.g. 20 BDT/share for Jan 2025; 40 BDT/share for Feb 2025+). |
| **`PenaltyWaiver`** | [`PenaltyWaiver.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/PenaltyWaiver.ts) | Logs global or member-specific penalty waivers approved by Admin. |
| **`GatewayRate`** | [`GatewayRate.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/GatewayRate.ts) | Gateway cashout percentages and fixed fees by payment channel. |

### D. Financial Transactions & Ledgers
| Model | Schema File | Core Responsibilities & References |
| :--- | :--- | :--- |
| **`Payment`** | [`Payment.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/Payment.ts) | Cash receipts collected by accountants. References `Member`, receiver `User`, and `CustodyAccount`. |
| **`PaymentAllocation`** | [`PaymentAllocation.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/PaymentAllocation.ts) | Deconstructs payments into previous dues, principal, penalties, and advance lines. |
| **`MonthlyLedger`** | [`MonthlyLedger.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/MonthlyLedger.ts) | Cached, rebuildable monthly projection per member with unique `{ memberId, month }`. |

### E. Cash Custody & Internal Movements
| Model | Schema File | Core Responsibilities & References |
| :--- | :--- | :--- |
| **`CustodyAccount`** | [`CustodyAccount.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/CustodyAccount.ts) | Distinct repositories of Foundation money. Cached balances are derived from movements. |
| **`CustodyMovement`** | [`CustodyMovement.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/CustodyMovement.ts) | The single authoritative cash movement ledger for inflows (`IN`) and outflows (`OUT`). |
| **`FundTransfer`** | [`FundTransfer.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/FundTransfer.ts) | Internal custody transfers (e.g. Samrat consolidation to Moin) linking OUT/IN movements with zero net P&L effect. |

### F. Investment Projects & Operational Funding
| Model | Schema File | Core Responsibilities & References |
| :--- | :--- | :--- |
| **`InvestmentProject`** | [`InvestmentProject.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/InvestmentProject.ts) | External investment projects representing common pooled funds. Member allocations are strictly excluded. |
| **`InvestmentFunding`** | [`InvestmentFunding.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/InvestmentFunding.ts) | Operational capital disbursements linking `InvestmentProject` to accountant `CustodyAccount`. |
| **`InvestmentReturn`** | [`InvestmentReturn.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/InvestmentReturn.ts) | Project maturity returns splitting principal, actual profit, and actual loss. |
| **`Reinvestment`** | [`Reinvestment.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/Reinvestment.ts) | Links wallet proceeds from matured investments to new investments, isolating new accountant funds. |

### G. Operational Expenses & Governance
| Model | Schema File | Core Responsibilities & References |
| :--- | :--- | :--- |
| **`Expense`** | [`Expense.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/Expense.ts) | Operational expenditures paid from a `CustodyAccount` reducing Net Foundation assets. |
| **`Policy`** | [`Policy.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/Policy.ts) | Organizational policies with serial numbers and version tracking. |
| **`PolicyVersion`** | [`PolicyVersion.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/PolicyVersion.ts) | Immutable version history of policy revisions. |

### Central Barrel Export
* [`backend/src/models/index.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/index.ts) re-exports all 22 models.

---

## 3. Verification & Validation Results

| Test / Check | Result |
| :--- | :--- |
| **TypeScript Typecheck** (`npm run typecheck`) | ✅ **PASS** — 0 errors |
| **TypeScript Compilation** (`npm run build`) | ✅ **PASS** — Compiled to `dist/` with 0 errors |
| **Model Registration Check** | ✅ **PASS** — All 22 models registered in Mongoose |
| **Business Rule: 2024 Temporary Change** | ✅ **PASS** — Allowed without errors |
| **Business Rule: Post-2024 Share Lock** | ✅ **PASS** — `TEMPORARY_CHANGE` in 2025-02 blocked by pre-validate hook |
| **Business Rule: 2025 Transfer** | ✅ **PASS** — `TRANSFER` in 2025 allowed |

---

## 4. Next Step in the Development Sequence

According to the master roadmap:
* **Issue #1**: Project Foundation *(Completed)*
* **Issue #2**: Database & Domain Models *(Completed)*
* **Issue #3**: **Authentication & RBAC** *(Next)*
  - User registration & login endpoints (`/api/auth/login`, `/api/auth/me`).
  - Password hashing with bcrypt.
  - JWT token generation & verification.
  - Role-based access control middleware (`requireRole('ADMIN')`, `requireAccountant`).
