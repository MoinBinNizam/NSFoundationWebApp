# Implementation Plan — Issue #28: Executive Business Decisions & 2024 Reconciliation Sign-off

## Goal

Resolve all pending business decisions explicitly mandated by SRS Version 2.0, execute the authoritative historical Google Sheets data migration through the staging pipeline, and generate the formal 2024 Annual Reconciliation Variance Sign-off Document comparing imported records with the audited December 2024 baseline.

---

## Scope

- **Executive Business Decisions Resolution:**
  1. **Post-2024 Share Buyer Entitlement:** Finalize the formula governing whether a member who purchases secondary shares after 31 December 2024 receives accumulated profits from society inception or from the purchase date onward.
  2. **Historical 2024 Penalty Rates:** Confirm the exact penalty rates to be seeded for any late payments found in the 2024 Google Sheets historical sheets.
  3. **Partial Future-Month Advance Rule:** Confirm the policy for fractional monthly advance amounts (e.g., whether an advance of 300 BDT against a 500 BDT share is treated as partial month coverage or generic cash credit).
- **Historical Google Sheets Migration Execution:**
  - Ingest the official 2024 Google Sheets export into the `MigrationRecord` staging collection.
  - Run data validation, deduplication checks, and member identity mapping.
  - Reconcile closing figures against the published December 2024 audited balance.
- **Formal Sign-off Document Generation:**
  - Automated PDF/Markdown Reconciliation Variance Report highlighting opening balances, total collections, total expenses, net custody, and any variance down to 0.00 BDT.
  - Executive committee digital sign-off and permanent migration lock.

---

## Detailed Implementation Tasks

### 1. Document & Automate Approved Business Decisions
- Once the executive committee signs off on the policy:
  - Update `docs/BUSINESS-RULES.md` with the finalized formulas.
  - Implement the buyer entitlement calculation in `backend/src/services/DistributionService.ts`.
  - Update `SystemConfig` and `PenaltyRule` collections with the approved 2024 historical rates.

### 2. Historical Data Ingestion & Staging
- Utilize the migration pipeline developed in Issue #17 (`MigrationService.ts`):
  - Ingest the audited Google Sheets 2024 transactions via `POST /api/migrations/upload`.
  - Run automatic deduplication against existing members and transactions.
  - Map Google Sheets member names and phone numbers to canonical `Member` records.
  - Flag any record with data discrepancies as `NEEDS_REVIEW`.

### 3. Automated Reconciliation Against December 2024 Audit Balance
- In `MigrationService.ts`, compute the imported 2024 totals:
  $$\text{Total 2024 Collection} = \sum \text{Imported Member Payments}$$
  $$\text{Total 2024 Operational Expenses} = \sum \text{Imported Expenses}$$
  $$\text{Closing 2024 Cash Balance} = \text{Opening Balance} + \text{Collections} - \text{Expenses}$$
- Compare these calculated sums against the audited December 2024 financial statement.
- Generate the **Reconciliation Variance Report**:
  - `Expected Total Collection (Audited)` vs `Imported Total Collection`
  - `Expected Custody Cash` vs `Imported Movement Cash`
  - List of any variance entries with source sheet, row number, and notes.

### 4. Official Sign-Off & Migration Lock
- Expose an administrative sign-off action:
  - `POST /api/migrations/:batchId/approve-reconciliation`
  - Requires approval from both Super Admin and Primary Accountant (Moin).
  - Automatically transitions all staged records from `STAGED` to `COMMITTED`.
  - Generates immutable `AuditLog` entries and marks the 2024 accounting period as permanently locked.

---

## Acceptance Criteria

- All open business decisions (post-2024 buyer entitlement, 2024 penalty rates) are officially recorded in `BUSINESS-RULES.md` and automated in the codebase.
- The complete 2024 historical Google Sheets dataset is imported through the staging pipeline with zero unhandled discrepancies.
- The 2024 financial reconciliation variance equals exactly 0.00 BDT against the published December 2024 audited balance.
- Official digital sign-off is recorded by Super Admin and Primary Accountant, permanently locking historical 2024 records from manual alteration.
