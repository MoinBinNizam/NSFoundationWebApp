# Implementation Plan: Issue #7 — Accountant Custody Ledger (Full-Stack)

Implement the authoritative Accountant Custody Ledger and Fund Transfer system adhering to **GitHub Issue #7**, [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md) (Section 15 "Accountants and Cash Custody", Section 17 "Fund Transfers", Section 18 "Custody Reconciliation"), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) (Section B "Custody Model & Movement Source of Truth"), and the 28-step development checklist.

---

## User Review Required

> [!IMPORTANT]
> - **Custody Principle (SRS 15.3)**: Accountant balance represents **custody responsibility, NOT individual ownership**.
> - **Movement Source of Truth (docs/fianl-docs_analysis_report.md Section B)**:
>   - Direct arbitrary modifications to account balances are blocked.
>   - All account balances are derived from the immutable `CustodyMovement` transaction ledger:
>     $$\text{Balance} = \sum \text{Movements}(\text{Type} = \text{IN}) - \sum \text{Movements}(\text{Type} = \text{OUT})$$
> - **Atomic Cross-Channel & Inter-Accountant Transfers (`FundTransfer`)**:
>   - Regardless of the channel used by members during payment collection (e.g., Samrat receives member payments in his personal Nagad wallet), accountants can transfer funds across different accounts and channels (e.g., **Samrat Nagad $\rightarrow$ Moin Islami Bank** to consolidate pooled funds for project investments).
>   - Generates twin synchronized `CustodyMovement` line items (`OUT` from source, `IN` to destination) linked to a unique `FundTransfer` record.
>   - Transfers have zero effect on society income, expenses, or profit; they simply reflect the physical or electronic movement of custody funds.

---

## Proposed Changes

### 1. Backend Service & Custody Engine
#### [NEW] [`backend/src/services/custody.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/custody.service.ts)
- **`getCustodyAccounts(filters)`**:
  - Retrieves active/all custody accounts with dynamic real-time balances derived from `CustodyMovement` aggregations (`totalIn`, `totalOut`, `currentBalance`).
  - Populates accountant holder details (Moin vs Samrat vs System).
- **`getCustodySummary()`**:
  - Society-wide custody metrics:
    - Total Society Liquid Funds in Custody
    - Total Moin-held Custody (Cash + bKash + Bank)
    - Total Samrat-held Custody (Cash + Nagad + bKash)
    - Total External Wallets & Platforms
    - Breakdown by channel (Cash, Bank, bKash, Nagad)
- **`getMovements(query)`**:
  - Searchable, paginated query on the immutable `CustodyMovement` ledger.
  - Filters: by account ID, movement type (`IN` / `OUT`), source type (`MEMBER_PAYMENT`, `INTERNAL_TRANSFER`, `INVESTMENT_FUNDING`, `INVESTMENT_RETURN`, `EXPENSE`, `ADJUSTMENT`), and date range.
- **`transferFunds(input, actingUser)`**:
  - Validates source account has sufficient balance (`balance >= amount`).
  - Rejects transfer if source and destination accounts are identical.
  - Generates sequential unique transfer number `TRF-YYYYMM-XXXX`.
  - Creates atomic MongoDB operations:
    1. Logs `CustodyMovement` `OUT` from source account.
    2. Logs `CustodyMovement` `IN` to destination account.
    3. Creates `FundTransfer` record linking both movements.
    4. Updates `cachedBalance` for both accounts.
    5. Logs `AuditLog` entry.
- **`createCustodyAccount(input, actingUser)`**:
  - Allows Admin to register new custody accounts (e.g., new Bank branch, wallet, or external platform).
- **`reconcileCustodyAccount(input, actingUser)`**:
  - Compares physical count/audited mobile balance with ledger balance.
  - If variance exists, records an audited `ADJUSTMENT` movement with mandatory explanation and Admin authorization.

---

### 2. Backend Controllers & Routes
#### [NEW] [`backend/src/controllers/custody.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/custody.controller.ts)
- `listAccounts`: Get all custody accounts with live derived balances.
- `getCustodySummary`: Get aggregated custody KPI totals and channel breakdown.
- `listMovements`: Paginated query on `CustodyMovement` ledger.
- `executeTransfer`: Execute inter-account fund transfer (`requireAccountant`).
- `listTransfers`: Query `FundTransfer` records with search & pagination.
- `createAccount`: Register new custody account (`requireRole(ADMIN)`).
- `reconcileAccount`: Audit reconciliation / variance adjustment (`requireRole(ADMIN)`).

#### [NEW] [`backend/src/routes/custody.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/custody.routes.ts)
- Mount routes at `/api/custody`:
  - `GET /summary` -> `getCustodySummary`
  - `GET /accounts` -> `listAccounts`
  - `POST /accounts` -> `createAccount` (`requireRole(ADMIN)`)
  - `GET /movements` -> `listMovements`
  - `POST /transfers` -> `executeTransfer` (`requireAccountant`)
  - `GET /transfers` -> `listTransfers`
  - `POST /reconcile` -> `reconcileAccount` (`requireRole(ADMIN)`)
- Register route in [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts).

---

### 3. Frontend Implementation
#### [MODIFY] [`frontend/src/components/Layout.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx)
- Enable **Accountant Custody** navigation item (route `/custody`, badge `Issue #7`).

#### [NEW] [`frontend/src/pages/CustodyPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/CustodyPage.tsx)
- **Tab 1: Custody Positions & Accounts**:
  - KPI Stat Tiles: Total Custody Funds, Moin Custody, Samrat Custody, Bank Total, Mobile Wallets Total.
  - Interactive grid of Custody Account cards:
    - Channel icon (Bank, bKash, Nagad, Cash), Account Number, Holder Name with `PRIMARY` / `ASSISTANT` pill.
    - Live derived balance, Total Inflows, Total Outflows.
    - Quick actions: "Transfer Out", "Audit Reconcile".
- **Tab 2: Transaction Movement Ledger**:
  - Complete, searchable, filterable table of every `CustodyMovement`:
    - Columns: Date, Reference/TxID, Account Name, Holder, Type (`IN` in emerald, `OUT` in rose), Amount, Source Type badge, Description, Performed By.
    - Filter pills by movement type and source type.
- **Tab 3: Inter-Account Fund Transfers**:
  - History table of all `FundTransfer` events.
  - Columns: Transfer #, Date, From Account, To Account, Amount, Purpose, Transferred By, Action.
- **Interactive Modals**:
  1. *Transfer Funds Modal*:
     - Source account dropdown with live available balance indicator.
     - Destination account dropdown.
     - Transfer amount with balance validation (`amount <= availableBalance`).
     - Purpose / reason input & date selector.
  2. *Add Custody Account Modal (Admin)*:
     - Account name, classification (`ACCOUNTANT CUSTODY`, `EXTERNAL WALLET`, etc.), Holder selection, Channel (Cash, Bank, bKash, Nagad), Account number, and notes.
  3. *Reconcile / Adjust Account Modal (Admin)*:
     - Shows current ledger balance.
     - Input for verified physical count or bank/wallet balance statement.
     - Computes variance (`Difference: ৳ X`).
     - Mandatory audit adjustment justification.

#### [MODIFY] [`frontend/src/App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx)
- Mount route `/custody` with `ProtectedRoute`.

---

## Verification Plan

### Automated Tests & Typecheck
- Write and execute integration test script validating:
  - Derived balance calculation matches `sum(IN) - sum(OUT)`.
  - Fund transfer generates twin `CustodyMovement` records and updates balances of both accounts.
  - Insufficient balance transfer is rejected.
  - Same account transfer is rejected.
  - Custody summary aggregates correct Moin vs Samrat totals.
- Run `npm run typecheck --prefix backend` (0 errors).
- Run `npm run build --prefix frontend` (0 errors).

### Manual Verification
- Execute transfer from Samrat Nagad to Moin Islami Bank in UI.
- Verify balances update instantly on the Custody Accounts screen.
- Verify both movements appear in the Movement Ledger.
