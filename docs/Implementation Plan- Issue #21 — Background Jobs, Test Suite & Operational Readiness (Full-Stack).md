# Implementation Plan — Issue #21: Background Jobs, Test Suite & Operational Readiness

## Goal

Make intensive reporting, reconciliation, imports, and ledger recalculation reliable at scale while establishing automated regression coverage and production operational visibility.

## Scope

- Add a durable background-job queue for member-ledger rebuilds, historical imports, annual/audit-report generation, reconciliation, and dashboard summary refresh.
- Add job status, retries, failure capture, and user-visible progress without blocking normal data entry.
- Build a complete automated test suite for payment allocation, gateway fees, custody, investment, governance, migration, RBAC, idempotency, and document authorization.
- Add structured logs, readiness checks, monitoring guidance, and deployment verification.

## Implementation

### A. Background work

1. Introduce a Redis-backed queue and worker process with typed job payloads.
2. Make financial writes enqueue only affected member recalculations after the committed transaction completes.
3. Add job dashboard/status API with authorization and safe error redaction.
4. Add retry/backoff and dead-letter handling for failed jobs.

### B. Automated verification

1. Add API integration tests using an isolated replica-set test database.
2. Cover all SRS payment, advance, penalty, cash-out fee, custody, investment, exit, annual-closing, migration, and report scenarios.
3. Add unauthorized-access, session-revocation, idempotency retry, and transaction rollback tests.
4. Add responsive frontend route smoke tests.

### C. Operations

1. Add structured log output with request/job correlation IDs.
2. Add readiness endpoints for MongoDB replica set and worker availability.
3. Document deployment health checks, alert thresholds, backup evidence, and release rollback steps.

## Acceptance Criteria

- Heavy work never blocks normal payment/member entry.
- Every job is observable, retryable, and safely fails without corrupting financial records.
- CI runs the relevant test suite before release.
- Production readiness reflects real service health rather than only an HTTP process response.
