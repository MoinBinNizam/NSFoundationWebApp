# Implementation Plan — Issue #14: Deployment & Backup

## Goal

Deploy the existing NS Foundation application reproducibly and establish backup, restore, and release controls that preserve financial source records and audit evidence.

## Current architecture to preserve

- React/Vite frontend; Express/Mongoose API; MongoDB is the system of record.
- `Payment`, `PaymentAllocation`, and `CustodyMovement` are financial source records. Do not restore individual records by hand or rewrite history to resolve an incident.
- `MonthlyLedger` and custody cached balances are rebuildable projections, but their rebuild must be audited and verified.
- The API already validates production JWT secret length, HTTPS CORS origin, database connectivity, security headers, RBAC, and rate limiting.

## Implementation

### 1. Deployment packaging

- Add multi-stage Dockerfiles for frontend and backend and a production `compose` example that does not embed secrets.
- Serve the frontend behind HTTPS and proxy `/api`; set `VITE_API_URL` only to the public API origin when a proxy is not used.
- Add `.env.example` files with required variable descriptions, never values. Required production settings include `NODE_ENV`, `MONGODB_URI`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT`, and trusted-proxy configuration.
- Run the API with a non-root account, read-only application image where possible, health checks, restart policy, CPU/memory limits, and graceful shutdown.

### 2. Database and secret controls

- Use a managed MongoDB replica set or a self-managed three-node replica set with authenticated TLS connections, encrypted disks, and a least-privilege application user.
- Keep backups, storage credentials, JWT secret, and database URI in a secret manager. Rotate them with a tested runbook; do not put them in Git, images, browser environment variables, logs, or audit states.
- Enable `trust proxy` only behind the named reverse proxy so IP auditing and rate limits cannot be forged by clients.

### 3. Backups

- Take encrypted, automated MongoDB snapshots at least daily and point-in-time/oplog backups for the agreed recovery point objective.
- Back up uploaded documents/receipts with versioning and lifecycle retention when receipt storage is introduced.
- Retain audit logs, migration batches, policy versions, and generated evidence according to the organization’s approved retention schedule.
- Record every backup job’s timestamp, source environment, backup identifier, checksum/verification outcome, and operator in the operations log—never the secret location itself.

### 4. Restore and recovery drill

1. Declare the incident, freeze write traffic, and preserve logs/evidence.
2. Restore to a separate recovery environment; never restore over production until validation is complete.
3. Verify database collections and counts, then run the Issue #13 integrity API/checklist.
4. Rebuild only approved derived projections; do not manufacture missing payment or custody movements.
5. Obtain finance/admin sign-off, switch traffic, monitor, and record a recovery audit event and incident report.
- Conduct a documented restore drill at least quarterly. Define RPO/RTO with the organization before production launch.

### 5. Release governance and monitoring

- CI must typecheck/build frontend and backend, run the Issue #21 test suite, scan dependencies, and publish immutable build identifiers.
- Release through staging with a smoke-test checklist: login/RBAC, payment preview, authorized posting, receipt/report access, audit visibility, health/readiness, and integrity scan.
- Monitor request error rate, latency, database health, disk/backup age, auth rate-limit events, worker status (after Issue #21), and integrity-scan failures. Alert a named operator with escalation steps.
- Keep rollback releases available. Database migrations must be backward compatible or have an explicitly rehearsed rollback plan.

## Acceptance criteria

- A clean host can deploy from versioned artifacts and secret references only.
- Backups are encrypted, monitored, and proven recoverable by a restore drill.
- Production traffic is HTTPS-only and secrets never appear in build output, logs, client bundles, or repository history.
- A recovery restores financial source records intact and integrity checks are reviewed before reopening writes.

## Decisions required before implementation

- Hosting provider, domain/DNS owner, reverse proxy, and TLS certificate ownership.
- RPO/RTO, backup retention period, encrypted backup location, and who may authorize a restore.
- Whether MongoDB is managed or self-managed, and the organization’s incident notification contacts.
