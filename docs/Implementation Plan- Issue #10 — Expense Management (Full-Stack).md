# Implementation Plan: Issue #10 — Expense Management (Full-Stack)

Implement the **Expense Management Module** for GitHub Issue #10 in accordance with SRS Sections 26–27, 30, 37–38, and the financial-separation invariants.

---

## 1. Authoritative Rules

1. An expense is a cash-out event and is never a member contribution, investment principal, investment profit, or internal custody transfer.
2. Every posted expense must have an immutable `Expense` record and a linked `CustodyMovement` with `movementType: OUT` and `sourceType: EXPENSE` from exactly one active custody account.
3. The source account must have a sufficient live derived balance before posting. External project-wallet accounts must not be selectable as ordinary expense payers without an explicit future policy decision.
4. `expenseNumber` must be generated sequentially (`EXP-YYYYMM-XXXX`), unique, auditable, and never reused.
5. Posted financial events are not deleted. Any correction must follow the future reversal/adjustment governance rather than mutating the original expense.
6. Receipts should be referenced by URL/path only in this issue; implementing file storage is out of scope unless a storage provider is chosen.

---

## 2. Backend Changes

### Service: `backend/src/services/expense.service.ts`

- `createExpense(input, actingUser)`
  - Validate date, category, description, positive amount, active accountant custody source, and live balance.
  - Generate the monthly sequential expense number.
  - Create `Expense`, the linked immutable custody `OUT / EXPENSE` movement, update cached balance, and write `AuditLog`.
- `getExpenses(query)`
  - Paginated/filterable history by date range, category, source account, and text search.
- `getExpenseById(id)`
  - Return the expense with source account, recorder, and linked ledger movement.
- `getExpenseStats(query)`
  - Total expense, count, average expense, category breakdown, account breakdown, and monthly trend.

### Controller and routes

- Add `expense.controller.ts` and `expense.routes.ts`.
- Mount at `/api/expenses` in `app.ts`.
- Require authentication for reads and `requireAccountant(PRIMARY, ASSISTANT)` for creating expenses. Do not add destructive update/delete endpoints.

### Verification script

- Add `test-expenses.ts` to verify source balance deduction, one expense record, one linked ledger movement, audit log creation, insufficient-funds rejection, and stats aggregation.

---

## 3. Frontend Changes

### Route and navigation

- Enable the existing **Expenses** navigation item as `/expenses` with an `Issue #10` badge.
- Add `<Route path="expenses" element={<ExpensesPage />} />`.

### `ExpensesPage.tsx`

- Summary cards: selected-period expense total, current-month total, transaction count, and largest category.
- Filterable table: expense number, date, category, description, source custody account, amount, recorder, and receipt reference.
- “Record Expense” modal: source accountant custody account, date, category (preset + custom), amount, description, notes, and optional receipt URL.
- Read-only expense detail drawer showing the linked custody movement and audit-relevant metadata.
- Category/month breakdown chart only if it can be done with the existing dependency set; otherwise use accessible summary tables and defer a chart library decision.

---

## 4. Acceptance Criteria

- A valid expense deducts only the selected accountant custody account by exactly its amount.
- The expense cannot be posted from an insufficient or inactive account.
- Internal transfers, investment funding, and wallet balances are excluded from expense totals.
- Every list/detail result is traceable to its custody movement and audit log.
- Backend typecheck and frontend production build pass.
- The integration script passes on a development MongoDB database.
