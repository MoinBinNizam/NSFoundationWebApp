# Implementation Plan — Issue #19: Annual Closing, Policy & Member Exit Governance

## Goal

Deliver the governance workflows needed to close an accounting year safely, publish formal organizational policy, and settle a member exit according to authorized rules.

## Scope

- Implement annual-closing draft, review, approval, lock, correction, and publication states.
- Generate auditable annual summaries for collections, penalties, waivers, expenses, investments, returns, custody, dues, advances, and reconciliation.
- Add the formal **এন এস ফাউন্ডেশন এর নীতিমালা** policy module with Super Admin-only versioned editing.
- Add configurable member-exit rules: eligibility period, deduction percentage, four-month payout schedule, authorization, and audit record.

## Implementation

### A. Annual closing

1. Add an immutable AnnualClosing entity with draft, reviewed, approved, locked, and corrected status transitions.
2. Build year-specific derived summary snapshots from source transactions and ledgers.
3. Lock normal writes to a closed accounting period; permit only audited Super Admin correction/reversal flows.
4. Carry valid outstanding dues, advance coverage, custody state, and cross-year investment state forward without closing active projects.

### B. Policy management

1. Expose the existing Policy and PolicyVersion models through Super Admin-only API routes and a responsive page.
2. Keep formal policies serial ordered, versioned, and audit logged.
3. Never rewrite historical policy content; amendments create a new version with an effective date and reason.

### C. Member exit settlement

1. Add configurable exit parameters, initially representing the approved 9.99% deduction and four-month payout requirement.
2. Validate one-year membership eligibility and block exit where unresolved financial obligations exist.
3. Generate a settlement proposal, approval event, payout schedule, linked custody movements, and member status change.
4. Ensure settlement records use Issue #18 idempotency and transaction safeguards.

### D. Validation

1. Test annual locking, correction authorization, carry-forward, and cross-year investment scenarios.
2. Test policy version permissions and immutable history.
3. Test exit eligibility, deduction math, payout schedule, duplicate prevention, and reversal paths.
4. Produce an annual report export and verify reconciliation differences remain explicit.

## Out of Scope

- The post-2024 transferred-share accumulated-entitlement calculation remains pending organizational decision and will not be invented.
