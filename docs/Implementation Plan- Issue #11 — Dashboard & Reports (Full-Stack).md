# Implementation Plan: Issue #11 — Dashboard & Reports (Full-Stack)

Implement the **Dashboard & Reports Module** for GitHub Issue #11 in accordance with SRS Sections 30–32 and 57, while preserving ledger-derived financial truth and role-based visibility.

---

## Owner Directives — Organized

### Navigation and first impression

- Move **Dashboard** to the first position in the primary sidebar, before Member Management, and use `/dashboard` as the protected landing route after login.
- Keep the detailed reporting workspace in a distinct **Reports** tab/route within the Dashboard module so a quick overview is never buried beneath analytical tables.
- Use the established dark visual system with purposeful color, concise status indicators, responsive metric cards, and lightweight charts. Visual emphasis must support financial understanding—not obscure figures or imply that estimates are actuals.

### Role-aware dashboard views

| User role | Dashboard scope |
|---|---|
| Admin / Super Admin | Organization-wide collection, custody, wallet, investment, expense, due, and recent activity data. |
| Primary / Assistant Accountant | Organization context plus the accountant's own custody accounts, collections received, transfers, funding activity, and expenses paid/recorded. |
| Member | No society-wide dashboard. Redirect to the existing member-safe experience until the dedicated statement scope is implemented. |

### Dashboard content

- Show an executive financial overview appropriate to the signed-in role.
- Include recent activity across transactions, new/updated members, investments, investment returns/reinvestments, transfers, and expenses.
- Provide charts for trends and composition only where the underlying query has data; show an explicit empty state otherwise.
- Make every metric's reporting period and source clear, with drill-through links to the source module where available.

### Reports workspace

- Provide separate report tabs: **Collection**, **Custody**, **Investments**, **Expenses**, and **Dues**.
- Give each report its own relevant filters in addition to the shared reporting date range.
- Use server-side search, sorting, and pagination for every report table.
- Set the default page size to **10 records** and allow only the approved page-size choices if a selector is added.
- Preserve the current report's filters, search term, sort order, and access scope when exporting CSV.

### Responsive requirements

- Keep dashboard metrics and filters usable on phone, tablet, and desktop layouts.
- Stack cards and filter controls on small screens; tables must retain critical columns through safe horizontal scrolling rather than hidden data.
- Use accessible labels, focus states, visible loading/error/empty states, and touch-friendly controls.

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
