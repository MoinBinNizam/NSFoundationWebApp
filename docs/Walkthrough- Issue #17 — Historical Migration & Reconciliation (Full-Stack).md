# Walkthrough — Issue #17: Historical Migration & Reconciliation

## Delivered

Issue #17 adds a controlled historical-data staging and reconciliation workflow. It does not silently modify live financial records.

## Access

1. Sign in as a `SUPER_ADMIN`.
2. Open **Historical Migration** from the administration navigation.
3. Regular Admins, accountants, and members cannot access the migration API or page workflow.

## Stage source evidence

1. Enter a batch name, source year, optional source month/sheet, and a stable source reference.
2. Choose the record type: Member, Payment, Expense, Investment Return, or Custody Movement.
3. Upload a UTF-8 CSV file.
4. The server preserves the original row and source reference, normalizes safe fields, validates required fields and amounts, and marks each row `VERIFIED` or `REVIEW_REQUIRED`.

Supported minimum columns:

- Members: `memberId`, `name`, `phone`, optional `email`, `joinDate`.
- Financial rows: `date`, `amount`.
- Payments additionally support `memberId` and `receiptNumber`.

## Review and reconciliation

1. Select a batch to inspect its row-level validation errors and duplicate warnings.
2. Mark a row verified or unresolved only after entering a review reason. Every decision is audit logged.
3. Use the reconciliation table to compare verified staged row counts/amounts with current MongoDB totals for each domain type.
4. Investigate every mismatch before any future production posting process.

## Safety behavior

- Original CSV content is retained in the staging record.
- Duplicate source references and existing payment receipt numbers are flagged.
- Upload and review never create members, payments, expenses, investments, or custody movements.
- No source row is treated as organizational truth without explicit review.
- The final 2024 migration remains pending until the organization supplies and approves the historical source evidence and penalty definitions.

## Verification performed

- Backend TypeScript production build passed.
- Frontend TypeScript/Vite production build passed.
- Migration routes are server-side protected with authentication and `SUPER_ADMIN` authorization.
