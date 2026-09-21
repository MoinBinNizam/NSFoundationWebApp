# Implementation Plan: Issue #12 — Final Distribution (Full-Stack)

Implement **Final Distribution** for GitHub Issue #12 using the SRS final-year, pooled-investment, profit/loss, settlement, and audit requirements.

---

## 1. Financial Authority and Guardrails

1. Final distribution must remain unavailable until an explicit authorized annual-close/final-distribution workflow is approved; it must never be calculated merely by current custody balance.
2. Distribution basis must use the authoritative finalized share history and annual/member-account rules, not temporary in-year shares.
3. Principal, realized profit, realized loss, outstanding investment capital, expenses, retained funds, penalties, waivers, and approved adjustments must be separately visible before calculating any distributable amount.
4. No payment may be issued merely from a preview. A controlled approval step, immutable distribution batch, per-member settlement records, linked custody movements, and audit logs are mandatory.
5. Reversals must use future approved correction governance; completed distributions must not be edited or deleted in place.

---

## 2. Backend Scope

- Add models for `DistributionBatch`, `MemberDistribution`, and an explicit approval/status lifecycle (`DRAFT`, `REVIEWED`, `APPROVED`, `PAID`, `REVERSED`).
- Add a distribution service that produces a read-only preview first, validates the target year and share basis, calculates member allocations, and records immutable payments only after authorization.
- Require Super Admin approval for batch approval/payment execution; primary accountant may prepare and review but not unilaterally finalize.
- Link actual payments to a selected active custody account using `OUT /` a dedicated distribution source type (extend the enum with migration/review safeguards), then update audit data.
- Create batch/list/detail endpoints and a development integration test covering exact allocation totals, authorization rejection, insufficient-funds rejection, and immutable payment evidence.

---

## 3. Frontend Scope

- Add a Final Distribution module restricted to authorized staff.
- Provide a year selector, distribution preview, transparent source-of-funds reconciliation, member allocation table, search/sort/10-row pagination, and CSV export.
- Require deliberate confirmation before approval/payment actions, showing total amount, custody source, affected member count, and irreversible accounting implications.
- Provide responsive batch detail, status timeline, and per-member settlement evidence.

---

## 4. Acceptance Criteria

- Preview totals reconcile to the allocation rows to the paisa.
- Unauthorized roles cannot approve or pay a distribution batch.
- Payments create exactly one member-distribution record, custody movement, and audit log per beneficiary.
- No distribution action mutates historic shares, investment records, or source ledger events.
- Backend tests, typecheck, and frontend production build pass.
