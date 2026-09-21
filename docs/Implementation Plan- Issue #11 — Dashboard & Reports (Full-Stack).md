# Implementation Plan: Issue #11 — Dashboard & Reports (Full-Stack)

Implement the **Dashboard & Reports Module** for GitHub Issue #11 in accordance with SRS Sections 30–32 and 57, while preserving ledger-derived financial truth and role-based visibility.

---

## 1. Scope and Rules

1. Dashboards and reports are read-only projections. They must never write balances, recreate financial events, or treat cached balances as the authoritative source.
2. Financial totals must derive from the existing immutable records: payments/allocations, custody movements, investment funding and returns, reinvestments, and expenses.
3. Internal transfers must remain excluded from income and expense totals.
4. Every displayed total must identify its reporting period, filters, and calculation source so it is auditable.
5. Exported data must honor the same filters and permissions as the view. Do not introduce a PDF library until a layout/branding decision is made; CSV export can be delivered first with native server streaming.

---

## 2. Backend Implementation

### New reporting service

Create `backend/src/services/reporting.service.ts` with read-only aggregations:

- `getExecutiveDashboard(filters)` — collection, expenses, investment deployment/returns, wallet holdings, accountant custody, and alerts.
- `getCollectionReport(filters)` — principal, penalties, CO charges, method/gateway and receiver breakdowns.
- `getCustodyReport(filters)` — account/channel/accountant balances and transfer-aware movement summaries.
- `getInvestmentReport(filters)` — project funding, returns, realized profit/loss, outstanding principal, wallet/reinvestment status.
- `getExpenseReport(filters)` — reuse expense-category/account/period aggregates from Issue #10.
- `getDueReport(filters)` — member/current/previous due and advance coverage, built from the payment/ledger domain.
- `exportCsv(reportType, filters)` — streaming CSV representation for each approved report type.

### Routes and permission model

- Add `reporting.controller.ts` and `reporting.routes.ts`, mounted at `/api/reports`.
- All report reads require authentication.
- Restrict society-wide financial dashboards and exports to Admin/Accountant roles; member users can receive only their own statement endpoint in a later member-statement scope.
- Add explicit query validation for `startDate`, `endDate`, year/month, account, member, and project filters.

---

## 3. Frontend Implementation

- Enable the current **Reports & Dashboard** navigation item as `/reports` with an `Issue #11` badge.
- Build `ReportsPage.tsx` using the existing responsive dark-card design.
- Provide a date range and relevant account/project filters shared across report tabs.
- Tabs: Executive, Collection, Custody, Investments, Expenses, and Dues.
- Use responsive metric cards, compact accessible data tables, trend/bar visualizations built with CSS/SVG or existing dependencies, and mobile horizontal-scroll table containers.
- Add CSV export buttons that retain the selected filters and show the report period in downloaded filenames.
- Make empty, loading, and API error states clear rather than displaying zero values as valid data.

---

## 4. Verification and Acceptance Criteria

- Cross-check dashboard totals against the respective source module totals for a fixed date range.
- Verify transfers do not increase income or expense totals.
- Verify role restrictions for all report and CSV routes.
- Verify the frontend adapts at phone, tablet, and desktop widths without hidden critical controls.
- Add report aggregation tests with seeded ledger events, and run backend typecheck plus frontend production build.
