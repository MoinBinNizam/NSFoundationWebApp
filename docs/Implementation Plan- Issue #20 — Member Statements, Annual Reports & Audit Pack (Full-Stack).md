# Implementation Plan — Issue #20: Member Statements, Annual Reports & Audit Pack

## Goal

Provide clear member-facing statements and controlled annual audit reports based only on authoritative source records, annual closing snapshots, and approved policy.

## Scope

- Generate member statements containing share history, monthly obligations, payments, penalties, waivers, dues, advances, cash-out charges, and annual totals.
- Export statements as PDF and shareable image without exposing other members' data.
- Produce annual reports from locked AnnualClosing snapshots, with member summary, custody reconciliation, expenses, investments, returns, profit/loss, and exception notes.
- Add audit-pack exports including immutable audit-log references, policy versions, reconciliation differences, and migration-source references.

## Security and integrity

- Use server-side authorization for every statement and report export.
- Render currency, dates, and Bangla/English labels without modifying financial source data.
- Report only approved annual-closing data; draft or unlocked data is visibly marked provisional.
- Preserve the pending transferred-share rule—no inferred distribution entitlement will appear in a report.

## Validation

- Test statement data against payment allocations and monthly ledgers.
- Test PDF/image access isolation and download authorization.
- Test annual totals against locked summary snapshots and reconciliation outputs.
- Test report generation for large member counts without blocking normal data entry.
