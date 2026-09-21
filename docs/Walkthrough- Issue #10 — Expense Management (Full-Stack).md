# Walkthrough: Issue #10 — Expense Management (Full-Stack Complete)

Implemented **Expense Management** for GitHub Issue #10 in line with SRS Sections 26–27, 30, 37–38 and the project’s financial-separation rules.

---

## 1. Financial Rules Implemented

1. **Expense is a distinct cash-out event**
   - Expenses are never recorded as member contributions, investment capital, investment returns, or internal transfers.
   - Every post creates a `CustodyMovement` with `movementType: OUT` and `sourceType: EXPENSE`.
2. **Only accountant custody may pay an expense**
   - The source account must be active and have `accountType: ACCOUNTANT_CUSTODY`.
   - External wallets cannot be selected as ordinary operational-expense sources.
   - The live, ledger-derived source balance is checked before any financial record is created.
3. **Immutable, linked accounting evidence**
   - Each expense creates one immutable `Expense` record, one linked custody movement, and one `AuditLog` event.
   - The cached custody projection refreshes after posting, while the immutable ledger remains the source of truth.
4. **Sequential and auditable references**
   - Expense numbers use `EXP-YYYYMM-XXXX` and are unique within the monthly sequence.
   - There are intentionally no update or delete endpoints; reversals are deferred to the future reversal-governance issue.

---

## 2. Backend Implementation

### Expense model and service

- Extended [`backend/src/models/Expense.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/models/Expense.ts) with optional `notes` support.
- Added [`backend/src/services/expense.service.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/services/expense.service.ts):
  - `createExpense()` validates account eligibility and available funds, generates the monthly expense reference, creates the expense/movement/audit chain, and refreshes the source account’s cached balance.
  - `getExpenses()` returns a paginated, searchable history filtered by category, source account, and date range.
  - `getExpenseById()` returns the expense together with its paying account, recorder, and linked custody movement.
  - `getExpenseStats()` returns selected-period totals, current-month spending, average expense, largest category, category/account breakdowns, and monthly trend data.

### API and authorization

Added [`backend/src/controllers/expense.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/expense.controller.ts) and [`backend/src/routes/expense.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/expense.routes.ts), mounted at `/api/expenses` from [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts).

| Route | Access | Purpose |
|---|---|---|
| `GET /api/expenses/stats` | Authenticated user | Dashboard and breakdown metrics |
| `GET /api/expenses` | Authenticated user | Filterable, paginated expense register |
| `GET /api/expenses/:id` | Authenticated user | Read-only audit/detail view |
| `POST /api/expenses` | Primary or assistant accountant | Post an immutable operational expense |

### Development-database verification

Added [`backend/src/scripts/test-expenses.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/test-expenses.ts) and the command:

```powershell
npm run test:expenses --prefix backend
```

It posts a small development expense and verifies the exact custody deduction, linked movement, audit record, and statistics. It writes to the connected MongoDB database, so use it only in development.

---

## 3. Responsive Frontend

Added [`frontend/src/pages/ExpensesPage.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/pages/ExpensesPage.tsx), enabled the **Expenses** sidebar item, and registered `/expenses` in [`frontend/src/App.tsx`](file:///c:/TechVelly/NSFoundationWebApp/frontend/src/App.tsx).

The page follows the existing dark, card-based UI style and adapts from phone to desktop:

- Responsive summary-card grid for selected-period total, current-month total, transaction count, and largest category.
- Filters for free-text search, category, paying account, and date range; the table safely scrolls horizontally on narrow screens.
- Responsive category and paying-account breakdown cards.
- Accountant-only **Record expense** modal with source account, amount, date, category/custom category, description, receipt reference URL, and notes.
- Read-only detail modal displaying payment evidence and its linked `OUT / EXPENSE` custody event.

---

## 4. Verification

- `npm run typecheck --prefix backend` — passed with zero TypeScript errors.
- `npx tsc -b --pretty false` from `frontend/` — passed with zero TypeScript errors.
- `test-expenses` is included but was not run automatically because it intentionally creates a real development-database expense.

## 5. Accounting Flow

```text
Active accountant custody account
        │  verify ledger-derived balance
        ▼
Expense record (EXP-YYYYMM-XXXX)
        │
        ├── CustodyMovement: OUT / EXPENSE
        ├── Cached balance projection refresh
        └── AuditLog: CREATE_EXPENSE
```
