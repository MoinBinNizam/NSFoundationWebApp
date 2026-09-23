# Implementation Plan — Issue #21: Background Jobs, Full Test Suite & Recovery Readiness

## Goal

Make intensive reporting, reconciliation, imports, and ledger recalculation reliable at scale while establishing automated regression coverage and production operational visibility.

## Scope

- Add a durable background-job queue for member-ledger rebuilds, historical imports, annual/audit-report generation, reconciliation, and dashboard summary refresh.
- Add job status, retries, failure capture, and user-visible progress without blocking normal data entry.
- Build a complete automated test suite for payment allocation, gateway fees, custody, investment, governance, migration, RBAC, idempotency, and document authorization.
- Add structured logs, readiness checks, monitoring guidance, and deployment verification.
- Make recovery readiness measurable: backup age, restore-drill evidence, queue-drain controls, and reconciliation after recovery.

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
4. Publish `/api/ready` separately from `/api/health`: readiness must require MongoDB connectivity and, once jobs are enabled, a reachable queue and healthy worker heartbeat.
5. Add a recovery checklist: pause workers before restore, restore into isolation first, validate source-record counts and Issue #13 integrity checks, rebuild derived projections through idempotent jobs, then resume writes only after finance sign-off.

### D. Concrete project design

- Use a Redis-backed queue (BullMQ is the recommended implementation) with a separate worker process; the API must never execute a long job inline after enqueueing it.
- Persist only typed identifiers and immutable job inputs in Redis. Re-fetch current MongoDB state in the worker and make each job idempotent with a deterministic job key.
- Start with `REBUILD_MEMBER_LEDGER`, `RUN_CUSTODY_RECONCILIATION`, `IMPORT_MIGRATION_BATCH`, `GENERATE_ANNUAL_DOCUMENT`, and `REFRESH_DASHBOARD_SUMMARY`. Financial posting remains synchronous and transactional; jobs may rebuild projections only after a successful committed post.
- Store job status, attempt count, safe error summary, correlation ID, requester, and timestamps in MongoDB for the UI/audit record. Do not expose stack traces or sensitive payloads.
- Add Vitest/Supertest API tests backed by an isolated MongoDB replica set, plus frontend route/component smoke tests. CI should run unit tests in parallel and financial integration tests serially.
- Include failure cases: worker retry, dead-letter resolution, duplicate enqueue, shutdown with an in-flight job, restore from backup, idempotent projection rebuild, unauthorized job access, and a job failure that must not create or modify a financial source record.

## Acceptance Criteria

- Heavy work never blocks normal payment/member entry.
- Every job is observable, retryable, and safely fails without corrupting financial records.
- CI runs the relevant test suite before release.
- Production readiness reflects real service health rather than only an HTTP process response.
- A recovery drill proves backup restoration, source-record reconciliation, job reprocessing safety, and a documented return-to-service approval.
