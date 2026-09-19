# Walkthrough: Issue #7 — Accountant Custody Ledger (Full-Stack)

Implemented the authoritative Accountant Custody Ledger management system fulfilling **GitHub Issue #7** in compliance with [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md) (Sections 15, 17, 18), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) (Section B "Custody Model & Movement Source of Truth"), and [`docs/BUSINESS-RULES.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/BUSINESS-RULES.md).

---

## 1. Authoritative Business Rules Implemented

1. **Derived Custody Balances (SRS 15.3 & Analysis Report Section B)**:
   - Account balances are strictly derived from the immutable transaction ledger:
     $$\text{Current Balance} = \sum \text{IN} - \sum \text{OUT}$$
   - Direct manual manipulation of account balance fields is prohibited. `cachedBalance` serves only as a read-optimized cache synced with the ledger.
2. **Custody Holding Model (SRS 15.3)**:
   - Balances represent *holding responsibility* on behalf of the cooperative society, never personal ownership.
   - Distinct accounts for **Moin** (Primary Admin & Accountant), **Samrat** (Assistant Accountant), and Society Operational Reserves.
3. **Cross-Channel & Inter-Accountant Fund Transfers**:
   - Despite the payment receiving channel (e.g., Samrat receives member payments in Nagad), accountants can transfer funds across accounts and channels (e.g. Samrat Nagad $\rightarrow$ Moin Islami Bank) to consolidate funds for project investments.
   - Generates unique sequential transfer numbers `TRF-YYYYMM-XXXX`.
   - Records twin synchronized [`CustodyMovement`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/CustodyMovement.ts) entries:
     - `OUT` movement from source custody account (`sourceType: INTERNAL_TRANSFER`)
     - `IN` movement to destination custody account (`sourceType: INTERNAL_TRANSFER`)
   - Logs an immutable [`FundTransfer`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/FundTransfer.ts) record linking the twin movements, authorized user, and justification purpose.
4. **Transaction Movement Ledger (SRS 17)**:
   - Real-time searchable and filterable ledger over all `CustodyMovement` entries.
   - Filterable by Account, Movement Type (`IN` / `OUT`), Source Event (`MEMBER_PAYMENT`, `INTERNAL_TRANSFER`, `ADJUSTMENT`, `EXPENSE`, `INVESTMENT_FUNDING`, `INVESTMENT_RETURN`), and Date range.
5. **Physical / Bank Count Reconciliation (SRS 18)**:
   - Periodic audit reconciliation comparing verified physical cash or bank statements against ledger balance.
   - Auto-calculates variance: $\text{Variance} = \text{Verified} - \text{Ledger}$.
   - Automatically logs an `ADJUSTMENT` movement (`+` for surplus, `-` for shortage) with mandatory audit justification notes.

---

## 2. Backend Implementation

### A. Custody Service
[`backend/src/services/custody.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/custody.service.ts):
- **`getDerivedAccountBalance(accountId)`**: MongoDB aggregation calculating real-time $\sum \text{IN} - \sum \text{OUT}$, total inflows, and total outflows.
- **`getCustodyAccounts(filters)`**: Returns accounts populated with live derived balances, holder details, and channels.
- **`getCustodySummary()`**: Aggregates society-wide liquid funds, Moin custody total, Samrat custody total, and channel breakdowns (Bank, Cash, bKash, Nagad).
- **`getMovements(query)`**: Searchable, paginated query across `CustodyMovement` with date ranges, accounts, and types.
- **`transferFunds(input, actingUser)`**: Validates source account has sufficient derived balance, generates sequential `TRF-YYYYMM-XXXX`, logs twin `CustodyMovement` (`OUT` and `IN`), creates `FundTransfer` record, updates cached balances, and logs `AuditLog`.
- **`getTransfers(query)`**: Searchable fund transfer voucher records.
- **`createCustodyAccount(input, actingUser)`**: Admin creation of new custody accounts.
- **`reconcileCustodyAccount(input, actingUser)`**: Admin audit variance reconciliation generating `ADJUSTMENT` movements.

### B. Custody Controller & Routes
- [`backend/src/controllers/custody.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/custody.controller.ts): Express handlers for listing accounts, summary metrics, movements ledger, executing transfers, transfer vouchers, creating accounts, and reconciliation.
- [`backend/src/routes/custody.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/custody.routes.ts):
  - Protected with `authenticate`.
  - Fund transfers restricted to `requireAccountant(AccountantType.PRIMARY, AccountantType.ASSISTANT)`.
  - Account creation and reconciliation restricted to `requireRole(UserRole.ADMIN)`.
  - Mounted at `/api/custody` in [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts).

---

## 3. Frontend Implementation

### A. Navigation & Routing
- [`frontend/src/components/Layout.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx): Enabled the `/custody` navigation item with badge `Issue #7` and icon `Wallet`.
- [`frontend/src/App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx): Mounted `<Route path="custody" element={<CustodyPage />} />`.

### B. Custody Page Component
[`frontend/src/pages/CustodyPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/CustodyPage.tsx):
- **Summary Metric Cards**:
  - **Total Liquid Funds**: Grand total across all active accounts.
  - **Moin Custody**: Total funds held by Primary Accountant.
  - **Samrat Custody**: Total funds held by Assistant Accountant.
  - **Channel Allocations**: Instant breakdown by Bank, Physical Cash, Nagad, and bKash.
- **Tab 1: Custody Positions & Accounts**:
  - Glassmorphic account cards with custom channel styling (Islami Bank = Blue, Physical Cash = Emerald, bKash = Pink, Nagad = Orange).
  - Prominent derived balance display.
  - Mini-ledger showing total inflows (`+৳X`) and total outflows (`-৳X`).
  - Quick action buttons: "Transfer From", "History", and "Reconcile".
- **Tab 2: Transaction Movement Ledger**:
  - Complete searchable ledger of all `CustodyMovement` records.
  - Multi-criteria filter bar: Filter by account, movement type (`IN` / `OUT`), source event, and date ranges.
  - Visual badges for `+IN` (emerald) and `-OUT` (rose) movements.
  - Server-side pagination controls.
- **Tab 3: Inter-Account Transfers**:
  - Complete history of `FundTransfer` vouchers with search by transfer number and purpose.
  - Interactive "Voucher" preview modal showing full transaction details, cross-channel flow, authorization, and timestamps.
- **Modals**:
  - **Execute Fund Transfer Modal**: Cross-channel validation with source balance preview and transfer purpose.
  - **Reconcile Custody Balance Modal (Admin)**: Real-time variance calculation ($\text{Verified} - \text{Ledger}$) and adjustment audit submission.
  - **Create Custody Account Modal (Admin)**: Form to register new holding channels.

---

## 4. Automated Integration Verification

Executed automated test suite [`backend/src/scripts/test-custody.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/test-custody.ts) with the following verified outcomes:
1. **Accounts & Live Balances**: Fetched all 6 seeded accounts and correctly derived balances via `sum(IN) - sum(OUT)`.
2. **Society Summary**: Computed total liquid funds, Moin custody, Samrat custody, and channel allocations.
3. **Balance Validation**: Attempting to transfer more funds than the derived balance was correctly rejected with HTTP 400 (`Insufficient funds in Samrat Personal Nagad`).
4. **Cross-Channel Inter-Account Transfer**:
   - Transferred ৳5,000 from **Samrat Personal Nagad** (`NAGAD`) to **Moin Islami Bank** (`BANK`).
   - Generated sequential voucher `TRF-202609-0001`.
   - Verified source balance decreased by ৳5,000 and destination balance increased by ৳5,000.
5. **Twin Synchronized Movements**: Verified matching `OUT` movement (-৳5,000) on Samrat Nagad and `IN` movement (+৳5,000) on Moin Bank.
6. **Reconciliation Variance Adjustment**: Verified admin reconciliation with audited surplus (+৳200), logging an `ADJUSTMENT` movement and updating derived balance.
7. **Typecheck & Build**:
   - `npm run typecheck --prefix backend` $\rightarrow$ **0 errors (Exit code 0)**.
   - `npm run build --prefix frontend` $\rightarrow$ **0 errors (Exit code 0)**.
