# Implementation Plan: Issue #13 — Audit, Security & Testing (Full-Stack)

Implement comprehensive **Audit Trail, Security Controls, and Automated Testing Suite** for GitHub Issue #13 across the NS Foundation Cooperative Society platform.

---

## 1. Scope and Security Objectives

1. **Immutable Audit Logging**:
   - Ensure every mutation across all 12 modules (Auth, Members, Shares, Payments, Custody, Investments, Reinvestments, Expenses, Reports, Distributions) produces a structured, tamper-proof `AuditLog` record with IP address, user-agent, performer ID, entity name, before/after diffs, and change reasons.
2. **Security & RBAC Enforcement**:
   - Verify role-based authorization for all API routes (`SUPER_ADMIN`, `ADMIN`, `ACCOUNTANT` [Primary vs Assistant], `MEMBER`).
   - Prevent privilege escalation, unauthorized parameter tampering, cross-user data leakage, and negative balance exploits.
3. **Data Integrity & Consistency Scanners**:
   - Automated ledger integrity checks: verify that custody account balances equal the net sum of all `CustodyMovement` events.
   - Verify payment allocation sums equal payment receipt totals.
   - Verify member year accounts match finalized share history records.
4. **Comprehensive Automated Test Suite**:
   - Unit and integration tests covering multi-accountant transfers, dual-custody settlement, penalty rules and waivers, project funding, reinvestment, and final distribution batches.

---

## 2. Backend Implementation Plan

### 1. Audit Trail Enhancements & Inspection API
- Enhance `backend/src/middlewares/audit.ts` to automatically capture client IP and user-agent.
- Create `backend/src/services/audit.service.ts` and `audit.controller.ts` with filtering by entity, performer, date range, action type, and full-text search.
- Mount `/api/audit` accessible exclusively by `SUPER_ADMIN` and `ADMIN`.
- Add integrity validation endpoint `/api/audit/verify-integrity` that checks ledger invariants across all custody accounts and payments.

### 2. Security Middleware Hardening
- Add rate limiting for authentication endpoints (`/api/auth/login`).
- Ensure no sensitive fields (passwords, JWT secrets, database connection credentials) leak in error responses or public endpoints.
- Validate request payload schemas strictly with input sanitization.

### 3. Automated End-to-End Test Suite
- Create test suites in `backend/src/tests/`:
  - `auth-rbac.test.ts`: Role barriers, token expiration, unauthorized access rejection.
  - `ledger-integrity.test.ts`: Custody movements, dual accountant custody isolation, deposit/withdrawal symmetry.
  - `share-reconciliation.test.ts`: 2024 share finalization, monthly obligation calculations, advance rollover.
  - `distribution-governance.test.ts`: Multi-stage approval, insufficient balance handling, non-editable completed batches.

---

## 3. Frontend Implementation Plan

### 1. Audit Log Viewer (`AuditPage.tsx` or Integrated Security Tab)
- Add an **Audit & Security Log** workspace with real-time event streaming.
- Filter by actor, module/entity, date window, and action type.
- Detail drawer showing JSON before/after state diffs for sensitive financial modifications.
- "Run System Integrity Audit" button that scans the ledger and reports any variance.

### 2. Security Alerts & Guardrails
- Visual security badges distinguishing Super Admin, Admin, Primary Accountant, and Assistant Accountant actions.
- Session timeout warning and automatic token refresh/logout upon expiration.

---

## 4. Verification and Acceptance Criteria

- All ledger verification checks pass with zero variances across all seeded accounts.
- Automated test suite executes via `npm test` and achieves 100% pass rate.
- Security scanners report zero unauthorized route access across simulated roles.
- Frontend builds cleanly with zero TypeScript errors.
