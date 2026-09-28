# Implementation Plan — Issue #23: Comprehensive Automated Integration & Regression Test Suite (Full-Stack)

## Goal

Establish an end-to-end automated regression and integration test harness covering all financial business rules, multi-document transactions, custody conservation, share locks, governance workflows, and role-based security boundaries to ensure zero silent financial errors and safe continuous delivery.

## Scope

- Set up an isolated automated integration testing environment using Vitest, Supertest, and `mongodb-memory-server` (with replica set enabled for multi-document ACID transactions).
- Implement end-to-end integration tests for the dynamic payment allocation engine: exact obligations, arrears clearing, penalty calculation after the 15th, advance credits, partial future-month coverage, and gateway cash-out fee carryovers.
- Test custody movement ledger integrity: verify double-entry balance derivation, fund transfers (Samrat to Moin), investment funding deductions, and project maturity return postings.
- Validate share locking rules: enforce 1 January 2025 normal share lock, pre-2025 historical changes, December 2024 final normalization, and peer-to-peer share transfers.
- Cover annual closing and member exit governance: closed-year edit locking, 9.99% exit deduction math, and 4-month installment schedules.
- Test security, authentication, and idempotency: JWT expiration, session version revocation, rate limiting, and duplicate transaction prevention.
- Add frontend route and component smoke tests using Vitest and React Testing Library.

---

## Architecture & Test Harness Design

```text
┌────────────────────────────────────────────────────────┐
│                   Vitest Test Runner                   │
└────────────────────────────────────────────────────────┘
          │                                  │
          ▼                                  ▼
┌───────────────────────────┐    ┌───────────────────────────┐
│ Backend Integration Tests │    │ Frontend Component Tests  │
│ (Supertest HTTP API)      │    │ (React Testing Library)   │
└───────────────────────────┘    └───────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────┐
│ MongoDB In-Memory Replica Set (mongodb-memory-server)  │
│ - Ephemeral database per test suite                    │
│ - Full transaction / session support                   │
│ - Seeded baseline (Admin, Accountants, Members)        │
└────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation Tasks

### 1. Test Environment Setup
- Install test utilities: `mongodb-memory-server`, `supertest`, `@types/supertest`.
- Create `backend/src/tests/setup/test-db.ts`:
  - Spins up `MongoMemoryReplSet` with 1 replica node before test runs.
  - Connects Mongoose with transaction capability.
  - Clears all collections between test cases (`beforeEach`/`afterEach`).
  - Gracefully stops the replica set after all tests finish.
- Create `backend/src/tests/setup/fixtures.ts`:
  - Helper functions to seed standard roles: Super Admin, Primary Accountant (Moin), Assistant Accountant (Samrat), and test Members.
  - JWT token generator for authenticated API requests.

### 2. Payment & Allocation Engine Integration Tests (`payment-allocation.test.ts`)
- **Exact payment scenario:** Member with 2 shares (1,000 BDT) paying before the 15th of the month. Ensure exact monthly obligation is credited with 0 arrears, 0 advance, 0 penalty.
- **Arrears allocation:** Member with 2 months previous dues (2,000 BDT) paying 3,000 BDT. Verify oldest month is satisfied first, followed by second month, followed by current month.
- **Late penalty calculation:** Payment made on or after the 16th of the month with active penalty rate (40 BDT/share). Verify penalty is segregated from principal and credited to penalty receipts.
- **Advance credits:** Member paying 5,000 BDT against a 1,000 BDT monthly obligation. Verify 1,000 BDT settles current month and 4,000 BDT rolls into advance credit ledger.
- **Gateway cash-out fees:** Test bKash app (1.49%), USSD (1.70%), standard agent (1.85%), and Nagad rules with nearest-integer rounding. Verify unpaid cash-out fees roll over into member due cash-out balance.
- **Idempotent submissions:** Submitting duplicate payment requests with identical `Idempotency-Key` headers must return the cached result without double-crediting money.

### 3. Custody & Movement Conservation Tests (`custody-ledger.test.ts`)
- Verify that `CustodyAccount.cachedBalance` exactly matches the mathematical sum of all `CustodyMovement` entries (`IN` minus `OUT`).
- Test internal fund transfer: Transferring 10,000 BDT from Samrat Nagad to Moin Islami Bank generates paired `OUT` and `IN` movements; assert society total cash variance is exactly 0.00 BDT.
- Test investment deployment: Deploying 50,000 BDT from Moin Custody to an Investment Project reduces Moin custody and creates an immutable funding record without being treated as an operational expense.
- Test investment return: Recording maturity with principal return and actual profit correctly routes cash to designated custody accounts.

### 4. Share History & Lock Enforcement Tests (`share-rules.test.ts`)
- Assert that modifying a member's share count with an effective date on or after 2025-01-01 is rejected with HTTP 400/403.
- Verify that 2024 historical changes remain editable through authorized audit workflows.
- Test peer-to-peer share transfer between active members: verify seller shares decrease, buyer shares increase, and the transfer event is recorded with non-automated buyer entitlement.

### 5. Annual Closing & Exit Governance Tests (`governance.test.ts`)
- **Annual Closing:** Close year 2024. Verify that normal payment/expense creation targeting 2024 is rejected. Verify member dues and advance credits carry forward into 2025.
- **Member Exit:** 
  - Test member with < 1 year membership is rejected.
  - Test eligible member exit: calculate 9.99% organizational deduction, verify net principal refundable, and assert exactly 4 scheduled monthly payout vouchers are generated.

### 6. Authentication & Security Boundaries (`auth-rbac.test.ts`)
- Test expired JWT token returns HTTP 401.
- Test session revocation: Incrementing `user.sessionVersion` immediately invalidates existing JWT tokens.
- Test role restrictions:
  - Assistant accountant cannot access administrative settings (`/api/settings`) or execute final distribution (`/api/distributions`).
  - Regular member cannot access accountant custody (`/api/custody`) or modify members.
- Test request sanitization: Submitting NoSQL injection keys (`$gt`, `$ne`, `$where`) in request bodies is sanitized or rejected.

### 7. Frontend Smoke Tests (`frontend-smoke.test.ts`)
- Set up Vitest + JSDOM for frontend.
- Render test for primary routes (`DashboardPage`, `PaymentsPage`, `MembersPage`, `InvestmentsPage`, `GovernancePage`).
- Verify language toggle switches UI text between English and Bangla correctly.

---

## Acceptance Criteria

- Running `npm test --prefix backend` executes the complete integration suite in an isolated in-memory replica set and passes with 100% success.
- Code coverage on core accounting services (`PaymentService`, `CustodyService`, `InvestmentService`, `GovernanceService`) exceeds 85%.
- Every business rule documented in `docs/BUSINESS-RULES.md` has at least one dedicated automated test assertion.
- CI pipeline executes this test suite on every pull request, blocking any regressions from reaching production.
