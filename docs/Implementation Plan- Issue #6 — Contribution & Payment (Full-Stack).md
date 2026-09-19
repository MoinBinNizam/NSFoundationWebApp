# Implementation Plan: Issue #6 — Contribution & Payment (Full-Stack)

Implement the authoritative Contribution & Payment module adhering to **GitHub Issue #6**, [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md) (Sections 7, 8, 9, 10, 11, 12, 13, 14, 15, and Sections L & M), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) (Custody Model & Movement Source of Truth), [`docs/BUSINESS-RULES.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/BUSINESS-RULES.md), and the 28-step development checklist.

---

## User Review Required

> [!IMPORTANT]
> - **Dual-Accountant Workflows**: Both Moin (Primary Accountant & Admin) and Samrat (Assistant Accountant) can collect contributions directly from members via Cash, bKash, Nagad, or Bank into their respective custody accounts.
> - **Custody Movement Ledger (docs/fianl-docs_analysis_report.md Section B)**:
>   - All account balances are derived. Every cash receipt logs a verified `CustodyMovement` entry (`movementType: MovementType.IN`, `sourceType: MovementSourceType.MEMBER_PAYMENT`, `sourceRefId: payment._id`).
>   - `CustodyAccount.cachedBalance` is projected strictly from this transaction ledger.
> - **Payment vs Allocation Separation (SRS 13.1)**: Single cash receipt creates one `Payment` record and multiple `PaymentAllocation` line items covering past dues, current monthly obligations, and future advance months in strict priority order.
> - **Dynamic Penalty Rules & Deadlines (Admin Configurable)**:
>   - Penalty rules are fully dynamic in database (`PenaltyRule` collection).
>   - Admin can view, add, or update penalty rules (e.g. rate per share, deadline / grace day of month like 15th, effective periods) and waivers (`PenaltyWaiver`) at any time.
>   - Initial baseline rules:
>     - **2024-01 through 2025-01**: 20 BDT/share (grace day: 15th).
>     - **2025-02 onward**: 40 BDT/share (grace day: 15th).
>     - Waivers: Global waivers for `2024-01` and `2024-08`.
> - **Cash Out Charge (GatewayRate) Due & Settlement Workflow**:
>   - Standard collections do not record a separate gateway fee if the member already covered it or sent the exact amount.
>   - **When a member fails to include the bKash/Nagad cash out fee**: The accountant records the unpaid cash out amount (`unpaidCashoutCharge`), updating the member's `cashoutDue` balance.
>   - **Next Payment Settlement**: The payment collection screen alerts the accountant of any previous unpaid cash out dues. When the member pays it with their next contribution, the accountant enters the settled amount in the **Cash Out Charge Paid** (`cashoutChargePaid`) field, which clears the member's `cashoutDue` and includes the cash in the receipt total.
> - **Filtering & Reporting**:
>   - Accountants can see their received money across Daily, Monthly, and Yearly intervals, broken down by Monthly Principal, Penalties, Cashout Charges Paid, and Payment Methods (bKash, Nagad, Cash, Bank).
>   - Admins can view aggregated or side-by-side collections for both accountants.

---

## Proposed Changes

### 1. Database Seed & Initial Custody / Gateway Rates Setup
#### [NEW] [`backend/src/scripts/seed-custody-gateways.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/seed-custody-gateways.ts)
- Seeds initial custody accounts for Moin and Samrat:
  - **Moin Custody Accounts**: `Moin Cash` (CASH), `Moin Personal bKash` (BKASH), `Moin Islami Bank` (BANK).
  - **Samrat Custody Accounts**: `Samrat Cash` (CASH), `Samrat Personal Nagad` (NAGAD), `Samrat Personal bKash` (BKASH).
- Seeds default `GatewayRate` entries:
  - `BKASH`: 1.85% (18.5 BDT / 1,000)
  - `NAGAD`: 1.50% (15.0 BDT / 1,000)
  - `BANK`: 0.00%
  - `CASH`: 0.00%
- Seeds default `PenaltyRule` entries:
  - Effective Jan 2024–Jan 2025: **20 BDT/share**
  - Effective Feb 2025 onward: **40 BDT/share**
  - Known waivers: Jan 2024, Aug 2024 (`PenaltyWaiver`)

---

### 2. Backend Services & Engines
#### [NEW] [`backend/src/services/payment.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/payment.service.ts)
- **`calculatePaymentPreview(memberId, paymentDate, paymentMethod, totalAmount)`**:
  - Evaluates member's active shares and monthly obligation (`shares × 500 BDT`).
  - Fetches existing unpaid dues, pending penalties (evaluated by target month: 20 BDT/share up to Jan 2025, 40 BDT/share from Feb 2025 onward, payment day > 15), and advance coverage.
  - Applies `GatewayRate` cashout calculation for the chosen channel.
  - Generates recommended allocation breakdown:
    1. Past unpaid principal dues
    2. Applicable penalties (checking payment day > 15 and waiver status)
    3. Current month principal
    4. Future advance months
  - Returns calculated distribution without committing to DB (for interactive UI preview).
- **`recordPayment(input, actingUser)`**:
  - Executes MongoDB transaction / atomic write:
    1. Validates receiver accountant and destination custody account.
    2. Generates sequential unique receipt number `RCP-YYYYMM-XXXX`.
    3. Saves `Payment` record.
    4. Generates and persists immutable `PaymentAllocation` records.
    5. Updates/Upserts `MonthlyLedger` records for covered months (setting status `PAID` or `ADVANCE_COVERED`).
    6. Creates immutable `CustodyMovement` record:
       - `custodyAccountId`: destination account
       - `movementType`: `MovementType.IN`
       - `amount`: `payment.totalAmount`
       - `sourceType`: `MovementSourceType.MEMBER_PAYMENT`
       - `sourceRefId`: `payment._id`
       - `performedBy`: acting user
    7. Updates `CustodyAccount.cachedBalance` as projection of `CustodyMovement` ledger.
    8. Creates `AuditLog` entry.
- **`getPaymentStats(filters, requestingUser)`**:
  - Aggregation pipeline supporting:
    - Date grouping: `daily` (specific date or day-by-day), `monthly` (specific month or month-by-month), `yearly` (specific year).
    - Accountant filter: Specific accountant ID or `ALL` (restricted for non-admins).
    - Method filter: `CASH`, `BKASH`, `NAGAD`, `BANK`, or `ALL`.
  - Metrics returned:
    - Total Cash Received
    - Monthly Principal Amount
    - Penalty Amount Collected
    - Advance Amount
    - Cashout Charges Collected
    - Payment Method Breakdown (`bKash`, `Nagad`, `Cash`, `Bank`)
    - Accountant Breakdown (Moin vs Samrat comparison for Admin)
- **`getPayments(query, requestingUser)`**:
  - Paginated payment history with member, receiver, custody account population, search by receipt number or member name/ID, and date range filters.
- **`getPaymentReceipt(paymentId)`**:
  - Returns complete receipt data with allocations for printable/downloadable receipt modal.

---

### 3. Backend Controllers & Routes
#### [NEW] [`backend/src/controllers/payment.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/payment.controller.ts)
- `previewPayment`: Preview allocation, dynamic penalty, and member's pending cashout due before saving.
- `createPayment`: Submit payment collection (recording `unpaidCashoutCharge` and/or `cashoutChargePaid`).
- `listPayments`: Query payments with pagination and filters.
- `getPaymentDetails`: Receipt and allocation details by ID.
- `getContributionStats`: Comprehensive daily/monthly/yearly analytics and multi-accountant stats.
- `getCustodyAccounts`: List active custody accounts (optionally filtered by accountant).
- `getGatewayRates`: List active gateway rates.
- `getPenaltyRules` & `savePenaltyRule`: Query and configure dynamic penalty rates & grace days (Admin).
- `getPenaltyWaivers` & `createPenaltyWaiver`: Query and configure monthly penalty waivers (Admin).

#### [NEW] [`backend/src/routes/payment.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/payment.routes.ts)
- Mount routes at `/api/payments`:
  - `POST /preview` -> `previewPayment`
  - `POST /` -> `createPayment` (`requireAccountant`)
  - `GET /` -> `listPayments`
  - `GET /stats` -> `getContributionStats`
  - `GET /custody-accounts` -> `getCustodyAccounts`
  - `GET /gateway-rates` -> `getGatewayRates`
  - `GET /penalty-rules` -> `getPenaltyRules`
  - `POST /penalty-rules` -> `savePenaltyRule` (`requireRole(ADMIN)`)
  - `GET /penalty-waivers` -> `getPenaltyWaivers`
  - `POST /penalty-waivers` -> `createPenaltyWaiver` (`requireRole(ADMIN)`)
  - `GET /:id` -> `getPaymentDetails`
- Register routes in [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts).

---

### 4. Frontend Implementation
#### [MODIFY] [`frontend/src/components/Layout.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx)
- Enable **Contributions & Payments** navigation item (route `/payments`, badge `Issue #6`).

#### [NEW] [`frontend/src/pages/PaymentsPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/PaymentsPage.tsx)
- **Tab 1: Analytics & Collection Dashboard**:
  - Filter toolbar:
    - Timeframe toggle: **Daily** (date picker) | **Monthly** (YYYY-MM picker) | **Yearly** (Year selector).
    - Receiver/Accountant selector: **All Accountants** (for Admin) | **Moin (Primary)** | **Samrat (Assistant)**.
    - Payment Method filter: **All Methods** | **bKash** | **Nagad** | **Cash** | **Bank**.
  - KPI Stat Cards:
    - Total Cash Collected
    - Monthly Principal Obligation
    - Penalties Collected
    - Advance Fund Collected
    - Cashout Charges Paid
  - Visual Breakdown Cards:
    - **Method Breakdown**: Progress bars and cards for bKash, Nagad, Cash, Bank.
    - **Accountant Comparison** (for Admin): Moin-held vs Samrat-held collections.
- **Tab 2: Payment Receipts & Ledger**:
  - Searchable, paginated table of all payments.
  - Columns: Receipt #, Date, Member (ID + Name), Receiver (Moin/Samrat), Custody Account, Method, Total Received, Breakdown (Principal/Penalty/Advance/Cashout), Status, Actions.
  - Action to open printable / downloadable Receipt Card.
- **Tab 3 (Admin Only): Penalty & Waiver Configurations**:
  - Live table of dynamic penalty rules (rate per share, grace day of month, effective period).
  - Monthly penalty waivers table.
  - Ability for Admin to add/edit penalty rules and waivers dynamically without code changes.
- **Interactive Modals**:
  1. **Record Payment Collection Modal**:
     - Member selector: Auto-loads active shares, monthly amount, pending dues, and **Previous Unpaid Cash Out Due** alert (if member has outstanding gateway charge from earlier bKash/Nagad payments).
     - Receiver accountant & custody account selector (Moin vs Samrat physical cash/bKash/Nagad/Bank accounts).
     - Payment method selector.
     - **Cash Out Handling**:
       - If member sent money without cashout fee: Field to enter `Unpaid Cash Out Charge` (adds to member's pending cashout due).
       - If member is paying past cashout fee: Field to enter `Cash Out Charge Paid` (deducts from member's cashout due and adds to cash collected).
     - Live Allocation breakdown preview (showing past dues covered, dynamic penalties evaluated, current month, and advance months).
     - Transaction reference & optional notes.
  2. **Payment Receipt Modal**:
     - Formal branded receipt with society header, member info, receipt number, breakdown of principal, penalty, cashout charge paid, advance, allocation line items, and receiver signature block.

#### [MODIFY] [`frontend/src/App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx)
- Mount route `/payments` with `ProtectedRoute`.

---

## Verification Plan

### Automated Tests & Typecheck
- Seed custody accounts and gateway rates:
  `npm run seed:custody --prefix backend`
- Run backend automated test script validating:
  - Allocation order (dues -> penalty -> current month -> advance).
  - Penalty trigger on day > 15.
  - Cashout charge calculation via `GatewayRate`.
  - Multi-accountant filtering (daily, monthly, yearly aggregations).
- Run `npm run typecheck --prefix backend` (must pass with 0 errors).
- Run `npm run build --prefix frontend` (must pass with 0 errors).

### Manual Verification
- Test payment collection for Moin via bKash.
- Test payment collection for Samrat via Nagad.
- Verify that filtering by Daily, Monthly, and Yearly displays exact received amounts, penalties, monthly amounts, and payment method breakdowns.
- Verify Admin sees both Moin and Samrat collections.
