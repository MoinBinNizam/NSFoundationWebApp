# Implementation Plan — Issue #18: Financial Atomicity & Production Security

## Goal

Make every financial mutation all-or-nothing, resistant to duplicate submissions, and ready for a defensible production security and recovery baseline.

## Scope

- Add MongoDB transaction/session support to payment posting, expenses, custody transfers, investment funding/returns, reinvestment, distribution settlement, migration posting, and year closing.
- Add idempotency keys and unique business constraints for retry-safe financial operations.
- Add structured security logging, rate limiting, security headers, secret validation, and safer production errors.
- Add automated authorization, rollback, duplicate, and concurrency tests.
- Document replica-set, backup, restore, and incident procedures.

## Implementation

### A. Transaction boundary

1. Introduce a transaction helper that starts a session, executes all related writes with the session, commits only after every write and audit event succeeds, and aborts on error.
2. Ensure services do not perform partial writes outside the transaction.
3. Add retry handling for transient transaction errors.
4. Keep external wallet/gateway calls outside the database transaction and use an explicit pending/confirmed state machine.

### B. Idempotency and integrity

1. Require an idempotency key for payment, transfer, expense, investment, reinvestment, distribution settlement, and migration-posting commands.
2. Store request key, actor, operation type, result reference, and expiry/retention metadata.
3. Add unique indexes for receipt numbers, source references, active allocations, and business-event keys.
4. Return the original result for safe retries instead of creating duplicate ledger events.

### C. Security baseline

1. Add trusted-origin configuration, secure HTTP headers/CSP, request rate limits, payload limits, and login throttling.
2. Validate production JWT/session secrets at startup and define rotation/revocation procedures.
3. Redact credentials, tokens, routing keys, and sensitive personal data from logs.
4. Add security event audit records for failed logins, denied access, role changes, and revoked sessions.
5. Verify every financial endpoint server-side; frontend visibility is never an authorization boundary.

### D. Recovery and observability

1. Add structured request/error logging and correlation IDs.
2. Define health/readiness checks for the API and MongoDB replica set.
3. Document encrypted backups for financial data, audit history, migration staging, configuration, and uploaded evidence.
4. Perform and record a restore drill without changing production data.

### E. Tests and acceptance

1. Add integration tests for rollback at every intermediate write.
2. Add concurrent duplicate-submission tests.
3. Add unauthorized and privilege-escalation tests for all sensitive routes.
4. Add rate-limit, secret validation, redaction, and recovery checks.
5. Run backend build, frontend build, migration tests, existing domain scripts, and the complete security suite.

## Acceptance Criteria

- A failed financial operation leaves no partial payment, allocation, ledger, movement, or audit state.
- Retrying the same idempotency key returns the original result and creates no duplicate financial event.
- Sensitive endpoints reject unauthorized users server-side.
- Production logs contain no passwords, JWTs, or raw gateway keys.
- Backup and restore procedures are documented and successfully exercised.
