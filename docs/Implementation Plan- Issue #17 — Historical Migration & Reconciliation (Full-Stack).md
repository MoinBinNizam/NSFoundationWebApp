# Implementation Plan — Issue #17: Historical Migration & Reconciliation

## Goal

Provide a safe, auditable path to bring verified historical NS Foundation records into the application without overwriting source evidence or inventing missing financial facts.

## Scope

- Create immutable migration batches and row-level staging records.
- Accept CSV source extracts for supported record types, preserving source year, month, sheet, row, reference, and original row data.
- Validate, normalize, and flag rows as `VERIFIED`, `REVIEW_REQUIRED`, or `UNRESOLVED` before any production posting.
- Detect duplicates against both staged rows and existing MongoDB records.
- Give Super Admins an in-app review queue and a reconciliation view.
- Compare staged/source totals with live MongoDB totals for members, payments, expenses, investments, returns, and custody movements.
- Provide a downloadable CSV template and a repeatable automated verification script.

## Safety Decisions

1. This issue does not invent absent 2024 penalty rules, source records, or transferred-share entitlement.
2. Imported financial rows remain staged until an authorized reviewer approves a future posting workflow. Bulk posting is deliberately deferred because Issue #18 will add transaction and idempotency safeguards.
3. Source files and raw rows are retained as evidence; normal operational data is never overwritten by this feature.

## Implementation

### A. Backend domain model

1. Add `MigrationBatch` for source identity, owner, lifecycle, totals, and audit timestamps.
2. Add `MigrationRecord` for immutable raw data, normalized fields, validation errors, duplicate matches, source references, and review state.
3. Add indexes for batch rows, source references, statuses, and source-record duplicate detection.

### B. Staging service and API

1. Parse UTF-8 CSV without spreadsheet-side effects.
2. Support member, payment, expense, investment return, and custody-movement staging rows.
3. Validate required fields and amounts; normalize dates, months, phone numbers, and source references.
4. Detect exact duplicate source references and likely payment duplicates.
5. Restrict upload, review, reconciliation, and export endpoints to Super Admin.
6. Write audit events for every batch creation, review decision, and reconciliation request.

### C. Review interface

1. Add a Historical Migration page accessible only to Super Admin.
2. Upload CSV files, state the source metadata, inspect batch counters, filter exceptions, and mark a row verified or unresolved with a reason.
3. Display live reconciliation side-by-side with staged totals, so mismatches are explicit and reviewable.
4. Preserve responsive table behavior and Bangla presentation through the existing localization layer.

### D. Verification

1. Add a migration test script covering source preservation, validation, duplicate detection, review, and reconciliation.
2. Run backend typecheck/build and frontend production build.

## Acceptance Criteria

- No staged record can be silently treated as verified.
- Every staged row retains source evidence and a review state.
- Duplicate and malformed input is visible to a Super Admin.
- Reconciliation exposes mismatches instead of hiding them.
- No existing production financial record is changed by upload or review.

## Out of Scope

- Automatic posting of verified historical financial rows.
- Final 2024 reconciliation sign-off using source files not yet supplied.
- Atomic financial posting and idempotency keys; these are Issue #18.
