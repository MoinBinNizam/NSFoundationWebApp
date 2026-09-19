# Implementation Plan - Issue #5: Share & Annual Account (Full-Stack)

Implement end-to-end Share and Annual Account management fulfilling **GitHub Issue #5** in compliance with [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md), and [`docs/BUSINESS-RULES.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/BUSINESS-RULES.md).

---

## User Review Required

> [!IMPORTANT]
> ### Authoritative Business Rules Implemented:
> 1. **Default Monthly Share Installment**: **500 BDT/month per share** (from SRS section 5.1).
> 2. **Post-2024 Share Lock**: Normal share increases/decreases (`TEMPORARY_CHANGE`) are strictly locked for any effective date from `2025-01` onwards. Only administrative overrides or share transfers are allowed.
> 3. **Post-2024 Share Transfer (`TRANSFER`)**: Allows existing members to transfer/sell shares to another member. Transfer events update both seller and buyer share balances and log linked transfer records.
> 4. **2024 Annual Reconciliation**: Normalizes 2024 obligations to the December 2024 final share count (`Final December 2024 Shares × Share Value × 12`), settling shortfalls and designating overpayments as 2025 advance credits without double counting.

---

## Proposed Changes

### Backend Implementation

#### [NEW] [`backend/src/services/share.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/share.service.ts)
- `getMonthlyShareValue()`: Reads configured value from `SystemConfig` (`MONTHLY_SHARE_VALUE`, default: 500).
- `getMemberCurrentShares(memberId)`: Queries latest `ShareHistory` event for member.
- `recordShareChange(input, actingUser)`: Validates 2025 lock rule; creates `ShareHistory`; updates member active share reference; logs `AuditLog`.
- `recordShareTransfer(input, actingUser)`: Validates seller has sufficient shares; atomically records transfers for seller (-X shares) and buyer (+X shares); logs `TRANSFER` event; logs `AuditLog`.
- `getShareHistory(query)`: Search/filter by member, month, or event type (`TEMPORARY_CHANGE`, `ANNUAL_FINALIZATION`, `TRANSFER`) with pagination.
- `reconcileYearAccount(memberId, year, actingUser)`: Computes final shares for year (December baseline), calculates annual obligation, derives shortfall/excess advance, creates/updates `MemberYearAccount`, and logs `AuditLog`.
- `getYearAccounts(query)`: Retrieves annual reconciliation records filtered by year and member.
- `getShareStats()`: Aggregates total active shares in the society, monthly principal collection potential, and share distribution metrics.

#### [NEW] [`backend/src/controllers/share.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/share.controller.ts)
- HTTP handlers for share changes, transfers, history, stats, and annual reconciliation.

#### [NEW] [`backend/src/routes/share.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/share.routes.ts)
- `GET /api/shares/stats` (auth)
- `GET /api/shares/history` (auth)
- `GET /api/shares/annual-accounts` (auth)
- `GET /api/shares/member/:memberId` (auth)
- `POST /api/shares/change` (auth, admin/accountant)
- `POST /api/shares/transfer` (auth, admin/accountant)
- `POST /api/shares/reconcile-year` (auth, admin/accountant)

#### [MODIFY] [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts)
- Mount `shareRoutes` under `/api/shares`.

---

### Frontend Implementation

#### Navigation & Route Wiring
- [MODIFY] [`frontend/src/components/Layout.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx): Enable the **Shares & Annual Account** menu item (path: `/shares`).
- [MODIFY] [`frontend/src/App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx): Mount `/shares` route pointing to `SharesPage`.

#### Screen & Modals
- [NEW] [`frontend/src/pages/SharesPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/SharesPage.tsx):
  - **KPI Header**: Total Active Society Shares, Monthly Obligation Pool (`Shares × 500 BDT`), Settled 2024 Accounts, Transfer Count.
  - **Tab 1: Member Shares & Positions**:
    - Table of members with their Current Share count, Monthly Obligation (e.g., 5 shares = 2,500 BDT), and Quick Actions ("Adjust Shares", "Transfer Shares", "Reconcile Year").
  - **Tab 2: Share Event History**:
    - Authoritative timeline of changes, event badges (`TEMPORARY_CHANGE`, `ANNUAL_FINALIZATION`, `TRANSFER`), effective month, and transfer notes.
  - **Tab 3: Annual Reconciliation (`MemberYearAccount`)**:
    - Year selector (2024, 2025).
    - Table displaying Final Shares, Annual Obligation, Total Paid, Shortfall, Excess Advance, and Settlement status badge.
    - "Run Annual Reconciliation" trigger.
  - **Modals**:
    1. *Adjust Share Count Modal*: Effective month picker, new share count, validation warning if effective month is >= 2025-01 requiring administrative override.
    2. *Transfer Shares Modal*: Seller dropdown, Buyer dropdown, share transfer amount, transfer reason/note.
    3. *Reconcile Year Account Modal*: Year selector, member selector, preview of calculated obligation.

---

## Verification Plan

### Automated Verification
1. **Backend Tests**:
   - `npm run typecheck --prefix backend` & `npm run build --prefix backend`.
   - Run integration test script verifying:
     - 2024 share change allowed.
     - 2025 share change without override rejected with business rule error.
     - 2025 share transfer between members updates both balances and records `TRANSFER` events.
     - 2024 annual reconciliation creates valid `MemberYearAccount` with formula `Final Shares × 500 × 12`.
     - `AuditLog` captures all operations.
2. **Frontend Tests**:
   - `npm run build --prefix frontend` (validates TypeScript compilation and Vite bundling).
