# Walkthrough — Issue #21: Background Jobs, Full Test Suite & Operational Readiness (Full-Stack)

## Overview

Issue #21 establishes an asynchronous background job processing architecture, automated integration test coverage, and operational readiness probes for the NS Foundation Cooperative Society web application. 

With this implementation, heavy computations (member ledger projection rebuilds, custody reconciliation integrity scans, dashboard metrics pre-aggregation, and large migration processing) are decoupled from the synchronous HTTP request-response cycle. In addition, deep operational readiness probes (`/api/ready`) and a full automated Vitest test suite ensure continuous data integrity and high availability.

---

## Key Changes Implemented

### 1. Data Models & Types
- **`backend/src/types/jobs.ts`**: Defined `JobType` (`REBUILD_MEMBER_LEDGER`, `RUN_CUSTODY_RECONCILIATION`, `IMPORT_MIGRATION_BATCH`, `GENERATE_ANNUAL_DOCUMENT`, `REFRESH_DASHBOARD_SUMMARY`), `JobStatus` (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`), and typed payloads.
- **`backend/src/models/JobRecord.ts`**: Created persistent Mongoose model tracking:
  - Unique `jobId` (`job_<timestamp>_<hash>`)
  - Status, progress percentage (0–100%), and granular step messages
  - Retry counter (`attempts`, `maxAttempts`)
  - Exponential backoff timestamp (`nextRunAt`)
  - Redacted error diagnostics and result metadata
  - Correlation tracking (`correlationId`) and user attribution (`requestedBy`)

### 2. Job Queue & Asynchronous Worker Services
- **`backend/src/services/jobs/job-queue.service.ts`**:
  - `enqueueJob`: Atomically creates and enqueues background jobs.
  - `getJobById`: Fetches detailed job status with population of the requesting user.
  - `listJobs`: Paginated listing with filtering by status and type.
  - `getQueueStats`: Aggregates real-time counts (`queued`, `processing`, `completed`, `failed`).
  - `retryJob`: Resets failed jobs back to `QUEUED` for immediate or scheduled re-execution.
  - `cancelJob`: Safely cancels pending jobs.
- **`backend/src/services/jobs/job-worker.service.ts`**:
  - Polling loop with atomic job locking (`findOneAndUpdate` with `PROCESSING` state and `workerId`).
  - Progress callback mechanism persisting real-time percentage and progress messages to MongoDB.
  - Handlers for:
    - `REBUILD_MEMBER_LEDGER`: Reconstructs `MonthlyLedger` projections from `PaymentAllocation` records.
    - `RUN_CUSTODY_RECONCILIATION`: Invokes `AuditService.verifyIntegrity` to cross-check custody movements, payment allocations, and annual shares.
    - `REFRESH_DASHBOARD_SUMMARY`: Precomputes dashboard KPIs and activity summaries.
    - `GENERATE_ANNUAL_DOCUMENT` & `IMPORT_MIGRATION_BATCH`.
  - Automatic retry with exponential backoff on transient errors up to `maxAttempts`.
  - Periodic heartbeat generation (`lastHeartbeat`) for liveness detection.
- **`backend/src/worker.ts`**: Standalone worker entrypoint for production separation (`npm run worker`).
- **`backend/src/server.ts`**: Integrated embedded worker lifecycle management for seamless local development.

### 3. Tracing, Logging & Operational Readiness
- **`backend/src/middlewares/correlation.ts`**: Extracts incoming `X-Correlation-ID` header or generates a unique correlation ID, attaching it to `req.correlationId` and response headers.
- **`backend/src/utils/logger.ts`**: Structured logging utility supporting log levels, ISO timestamps, correlation IDs, component tags, and automatic redaction of sensitive credentials.
- **`GET /api/ready`** in `backend/src/app.ts`: Deep readiness check validating:
  - Database connectivity state and live MongoDB ping latency (ms)
  - Worker process heartbeat age and active jobs count
  - Real-time queue backlog statistics

### 4. Background Job Management API
- **`backend/src/controllers/job.controller.ts` & `backend/src/routes/job.routes.ts`**:
  - `GET /api/jobs`: List background jobs (Admin, Super Admin, Accountant).
  - `GET /api/jobs/stats`: Summary counts of queued, processing, completed, and failed jobs.
  - `GET /api/jobs/:id`: Single job status and progress.
  - `POST /api/jobs/:id/retry`: Retry failed job (Admin).
  - `POST /api/jobs/:id/cancel`: Cancel queued job (Admin).
  - `POST /api/jobs/trigger`: Trigger manual task execution on demand.

### 5. Frontend Background Tasks Drawer & UI Integration
- **`frontend/src/components/BackgroundJobsDrawer.tsx`**:
  - Slide-over drawer with real-time queue statistics badges.
  - Live system readiness indicator showing MongoDB ping latency and worker health.
  - Quick action buttons to trigger dashboard refreshes, custody scans, and ledger rebuilds.
  - Progress bars, step messages, and one-click retry/cancel controls for jobs.
  - Full English and Bangla localization.
- **`frontend/src/components/Layout.tsx`**:
  - Added an Activity monitor icon button in the top navigation header.
  - Displays a pulsating badge with the active jobs count whenever background tasks are running.

### 6. Automated Test Suite (Vitest)
- **`backend/src/tests/jobs.test.ts`**:
  - Tests `/api/health` and `/api/ready` with worker heartbeat verification.
  - Tests correlation ID header propagation.
  - Tests `JobQueueService` enqueue, retrieve, list, statistics, and cancellation.
  - Tests `JobWorkerService` execution lifecycle, verifying asynchronous execution and completion.
- **`backend/src/tests/financial-allocations.test.ts`**:
  - Tests exact on-time payments.
  - Tests excess advance credit allocation.
  - Tests gateway cash-out fee calculation and nearest-integer rounding rules.
  - Tests penalty rule retrieval for post-2025 months (40 BDT/share).
- **`backend/src/tests/security-baseline.test.ts`**:
  - Tests Bangladesh and international phone number normalization.
  - Tests error handling and production error sanitization.

---

## Verification & Test Results

1. **Backend Integration Test Suite (`vitest`):**
   ```text
   ✓ src/tests/security-baseline.test.ts (3 tests)
   ✓ src/tests/financial-allocations.test.ts (4 tests)
   ✓ src/tests/jobs.test.ts (9 tests)

   Test Files  3 passed (3)
        Tests  16 passed (16)
   ```
2. **Backend TypeScript Typecheck:**
   ```bash
   npm run typecheck --prefix backend
   # Result: 0 errors
   ```
3. **Frontend Production Build:**
   ```bash
   npm run build --prefix frontend
   # Result: 0 errors, assets compiled successfully in 6.07s
   ```

---

## Git Commit Message

```text
feat(jobs,tests): implement background worker queue, operational readiness and automated test suite (#21)

- Add JobRecord model and JobType/JobStatus enums in backend
- Implement JobQueueService for durable job lifecycle management
- Implement JobWorkerService with handler registry, progress tracking, and exponential backoff retries
- Add standalone worker process entrypoint (`npm run worker`) and embedded dev lifecycle
- Add request correlation ID tracing middleware and structured redaction logger
- Add `/api/ready` deep readiness probe checking database latency and worker heartbeat
- Add authenticated `/api/jobs` REST endpoints for queue inspection, retries, and task triggers
- Add BackgroundJobsDrawer component and header activity monitor in frontend
- Add comprehensive Vitest integration tests for background jobs and financial allocation preview
- Update Bangla translations for background task terminology
```
