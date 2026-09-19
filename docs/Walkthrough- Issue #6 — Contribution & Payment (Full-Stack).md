# Walkthrough: Issue #6 — Contribution & Payment (Full-Stack)

Implemented the authoritative Contribution & Payment management system fulfilling **GitHub Issue #6** in compliance with [`docs/SRS.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/SRS.md) (Sections 7, 8, 9, 10, 11, 12, 13, 14, 15, and Sections L & M), [`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) (Custody Model & Movement Source of Truth), and [`docs/BUSINESS-RULES.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/BUSINESS-RULES.md).

---

## 1. Authoritative Business Rules Implemented

1. **Dual-Accountant Workflows (SRS Section 15 & M)**:
   - Both **Moin** (Primary Admin & Accountant) and **Samrat** (Assistant Accountant) collect member payments into their respective custody accounts:
     - **Moin Accounts**: `Moin Cash` (CASH), `Moin Personal bKash` (BKASH), `Moin Islami Bank` (BANK).
     - **Samrat Accounts**: `Samrat Cash` (CASH), `Samrat Personal Nagad` (NAGAD), `Samrat Personal bKash` (BKASH).
2. **Custody Movement Source of Truth ([`docs/fianl-docs_analysis_report.md`](file:///c:/TechVelly/NSFoundationWebApp/docs/fianl-docs_analysis_report.md) Section B)**:
   - Account balances are **never modified directly**. Every payment collection logs an immutable [`CustodyMovement`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/CustodyMovement.ts) entry (`movementType: 'IN'`, `sourceType: 'MEMBER_PAYMENT'`, `sourceRefId: payment._id`).
   - `CustodyAccount.cachedBalance` is kept strictly updated as a projection of this ledger.
3. **PaymentAllocation Engine & Priority Order (SRS Section 10 & 13)**:
   - Strictly separates the cash receipt transaction (`Payment`) from coverage line items (`PaymentAllocation`).
   - Mandatory allocation order:
     1. **Past Principal Dues** (oldest unpaid months first).
     2. **Past Unpaid Penalties** (evaluated with dynamic rate for each target month).
     3. **Current Month Principal** (`shares × ৳500`).
     4. **Current Month Late Penalty** (starts after the 15th deadline unless waived).
     5. **Future Advance Months** (`shares × ৳500` per month, with no phantom duplicate cash receipts).
   - Automatically marks covered months in `MonthlyLedger` as `PAID` or `PARTIAL`.
4. **Cash Out (GatewayRate) Due & Settlement Workflow**:
   - Members normally cover their own cash out charges.
   - If a member pays via bKash or Nagad without paying the gateway fee, the accountant inputs the unpaid fee (`unpaidCashoutCharge`), updating the member's `cashoutDue` balance.
   - On the member's next payment, the system alerts the accountant that the member owes previous cashout charges.
   - When the member settles it, entering the amount in `Cash Out Charge Paid` (`cashoutChargePaid`) deducts it from the member's `cashoutDue` and includes the cash in the official receipt total.
5. **Dynamic Penalty Rules & Waivers (Admin Configurable)**:
   - Dynamic [`PenaltyRule`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/PenaltyRule.ts) collection queryable by month:
     - **2024-01 through 2025-01**: **20 BDT/share** (deadline: 15th).
     - **2025-02 onward**: **40 BDT/share** (deadline: 15th).
     - Configurable in UI: Admins can update rates, grace days, or effective dates at any time without code changes.
   - Dynamic [`PenaltyWaiver`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/PenaltyWaiver.ts) (seeded with global waivers for `2024-01` launch and `2024-08`).

---

## 2. Backend Implementation

### A. Seed Script
[`backend/src/scripts/seed-custody-gateways.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/seed-custody-gateways.ts):
- Seeds 6 custody accounts across Moin and Samrat.
- Seeds 4 gateway rates (BKASH 1.85%, NAGAD 1.50%, BANK 0%, CASH 0%).
- Seeds 2 dynamic penalty rules (20 BDT/share up to Jan 2025; 40 BDT/share Feb 2025 onward).
- Seeds 2 global penalty waivers (`2024-01`, `2024-08`).

### B. Payment Service & Allocation Engine
[`backend/src/services/payment.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/payment.service.ts):
- **`calculatePaymentPreview(input)`**: Evaluates active shares, past unpaid dues, dynamic penalties, advance months, and previous cashout due to preview breakdown before saving.
- **`recordPayment(input, actingUser)`**:
  - Generates formatted sequential receipt number `RCP-YYYYMM-XXXX`.
  - Persists `Payment` record.
  - Persists immutable `PaymentAllocation` records.
  - Updates/upserts `MonthlyLedger` records for affected months.
  - Updates `Member.cashoutDue` (clearing paid amounts and adding unpaid charges).
  - Logs immutable `CustodyMovement` of type `IN` and `MEMBER_PAYMENT`.
  - Recalculates `CustodyAccount.cachedBalance`.
  - Records `AuditLog`.
- **`getPaymentStats(filters)`**: Aggregates daily, monthly, and yearly totals with breakdown by method, accountant (Moin vs Samrat), principal, penalties, advance, and cashout charges.
- **`getPayments(query)`**: Searchable, paginated query by receipt number, member name/ID, accountant, and date range.
- **`getPaymentDetails(id)`**: Populates full receipt voucher with line-item allocations.
- **`getPenaltyRules()`, `savePenaltyRule()`, `getPenaltyWaivers()`, `createPenaltyWaiver()`**: Dynamic administrative configuration handlers.

### C. Controller & Routes
- [`backend/src/controllers/payment.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/payment.controller.ts): Express handlers with input validation and typed responses.
- [`backend/src/routes/payment.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/payment.routes.ts): Mounted at `/api/payments` in [`app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts), secured with JWT authentication and `requireAccountant(PRIMARY, ASSISTANT)`.

---

## 3. Frontend Implementation

### A. App Shell & Navigation
- Enabled **Contributions & Payments** in [`Layout.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/components/Layout.tsx) with badge `Issue #6` and dynamic breadcrumbs.
- Mounted route `/payments` in [`App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx).

### B. Contributions & Payments Screen ([`PaymentsPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/PaymentsPage.tsx))
- **Tab 1: Collection Analytics & Dashboard**:
  - Filter bar: Interval switch (**Daily**, **Monthly**, **Yearly**), Receiver Accountant selector (**All**, **Moin**, **Samrat**), and Payment Method filter (**All**, **bKash**, **Nagad**, **Cash**, **Bank**).
  - KPI Stat Cards: Total Cash Received, Monthly Principal, Penalties Collected, Advance Prepayments, and Cashout Paid.
  - Breakdown Cards:
    - *Payment Method Breakdown*: Progress pills and metrics for bKash, Nagad, Cash, and Bank.
    - *Dual Accountant Comparison*: Side-by-side total received and collections count for Moin vs Samrat.
- **Tab 2: Receipts & Payment History Ledger**:
  - Searchable, paginated table of all payments with receipt number, date, member details, receiver, custody account, method, total received, principal/penalty/advance/cashout breakdown, and action button.
- **Tab 3: Dynamic Penalty Rules & Waivers (Admin Only)**:
  - Table of active penalty rules with rate per share and grace day of month.
  - Table of approved monthly waivers.
  - Interactive modals to add/edit penalty rules and grant waivers.
- **Interactive Modals**:
  1. *Record Member Contribution Modal*:
     - Member selector with live **Previous Unpaid Cash Out Due** alert.
     - Receiver and destination custody account selector.
     - Payment method and payment date inputs.
     - Cash Out handling: input for `unpaidCashoutCharge` and `cashoutChargePaid`.
     - Live Allocation breakdown preview showing target months, principal, penalties, and advances.
  2. *Official Branded Payment Receipt Modal*:
     - Printable voucher with society header, member details, voucher info, accounting allocations table, cash summary, and verified deposit custody badge.

---

## 4. Verification & Validation Results

| Test / Check | Result |
| :--- | :--- |
| **Late Penalty Evaluation** | ✅ **PASS** — Applied ৳ 40 penalty for payments on or after the 16th |
| **Early Payment Grace** | ✅ **PASS** — 0 penalty for payments on or before the 15th |
| **Cashout Due Tracking** | ✅ **PASS** — Unpaid bKash fee recorded in member's `cashoutDue: ৳20` |
| **Cashout Due Settlement** | ✅ **PASS** — Subsequent payment with `cashoutChargePaid: ৳20` cleared `cashoutDue` to 0 |
| **Custody Movement Ledger** | ✅ **PASS** — Created `CustodyMovement` of type `IN` & `MEMBER_PAYMENT` |
| **Multi-Accountant Stats** | ✅ **PASS** — Correctly aggregated Moin (৳ 1,540) and Samrat (৳ 2,000) totals |
| **Backend TypeScript Build** | ✅ **PASS** — 0 TypeScript errors |
| **Frontend Production Build** | ✅ **PASS** — Vite bundle built in **37.54s** (`32.27 kB` CSS, `300.67 kB` JS) |

---

## 5. Next Step in Development Sequence

* **Issue #1**: Project Foundation *(Completed)*
* **Issue #2**: Database & Domain Models *(Completed)*
* **Issue #3**: Authentication & RBAC *(Completed)*
* **Issue #4**: Member Management *(Completed)*
* **Issue #5**: Share & Annual Account *(Completed)*
* **Issue #6**: **Contribution & Payment** *(Completed)*
* **Issue #7**: **Accountant Custody & Movement** *(Next)*
  - Physical vs mobile wallet vs bank account balance tracking.
  - Internal custody transfers between Moin and Samrat with dual audit trails.
  - Custody reconciliations and cash verification workflows.
