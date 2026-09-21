# Walkthrough: Issue #11 — Dashboard & Reports (Full-Stack Complete)

Implemented the **Dashboard & Reports Module** for GitHub Issue #11 using read-only projections of the existing financial ledger and domain records.

---

## 1. Security and Financial Rules Implemented

1. **Read-only reporting**
   - Dashboard and report endpoints only query existing Payments, Expenses, Custody Accounts/Movements, Investment records, Monthly Ledgers, and Audit Logs.
   - They do not create balances, mutate financial events, or use cached balances as the source of truth.
2. **Role-scoped data**
   - Admin and Super Admin receive organization-wide dashboard/report data.
   - Accountant dashboards show their own received payments, recorded expenses, owned custody accounts, and personal activity trail.
   - Member accounts cannot access reporting routes.
3. **Investment restriction—enforced at the API boundary**
   - Investment and Project Wallet routes now require the **Primary Accountant** (`PRIMARY`, Moin) or an admin user with primary accountant authority.
   - The Reports UI hides the Investments tab for Samrat, but the backend independently returns `403` if Samrat requests investment reports directly.
4. **Safe exports**
   - CSV exports invoke the same scoped report query as the table, retain filters/search/sort, and do not expose records unavailable in the UI.
5. **Transfers remain neutral**
   - Dashboard collection and expense figures are sourced from Payment and Expense records, not `INTERNAL_TRANSFER` movements; transfers do not inflate income or expenses.

---

## 2. Backend Implementation

Added [`backend/src/services/reporting.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/reporting.service.ts), [`reporting.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/reporting.controller.ts), and [`reporting.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/reporting.routes.ts). They are mounted at `/api/reports` from [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts).

| Endpoint | Purpose |
|---|---|
| `GET /api/reports/dashboard` | Role-aware executive/accountant summary, custody distribution, and recent activity |
| `GET /api/reports/data/collection` | Filterable collection report |
| `GET /api/reports/data/custody` | Ledger-derived custody account report |
| `GET /api/reports/data/investments` | Primary-accountant/admin-only investment report |
| `GET /api/reports/data/expenses` | Expense report |
| `GET /api/reports/data/dues` | Member monthly-ledger due report |
| `GET /api/reports/data/:type/export` | Scoped CSV export for an approved report type |

Every report supports server-side `search`, `sortBy`, `sortDirection`, `page`, and `limit`; the UI sets the default page size to **10**.

Updated [`backend/src/routes/investment.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/investment.routes.ts) and [`backend/src/routes/reinvestment.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/reinvestment.routes.ts) to require `PRIMARY` accountant authority for both reading and writing.

---

## 3. Responsive Frontend

Added [`frontend/src/pages/DashboardPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/DashboardPage.tsx) and registered it at `/dashboard`.

- Dashboard is the first sidebar module and protected post-login landing page.
- The Dashboard view contains responsive financial metric cards, recent system activity, a custody-distribution visualization, a reporting-period filter, and a restricted investment snapshot where authorized.
- The Reports view includes Collection, Custody, Expenses, Dues, and (only for Admin/Moin) Investments tabs.
- Tables support clickable sorting, server-side search, 10-record pagination, responsive horizontal overflow, loading/empty/error states, and CSV export.
- On smaller screens, dashboard cards and controls stack while report tables preserve all columns through horizontal scrolling.

---

## 4. Integration Verification

Added [`backend/src/scripts/test-reporting.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/test-reporting.ts).

```powershell
npm run test:reporting --prefix backend
```

Executed successfully against the development database:

- Admin dashboard returned a 12-item recent activity feed.
- Samrat's collection report was scoped and paginated at 10 rows.
- Samrat was denied investment-report access with `403`.
- Moin successfully received investment rows.
- CSV content was generated from the filtered report data.

Backend typecheck and frontend production build also passed.
