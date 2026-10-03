# Walkthrough: Issue #3 — Authentication & RBAC

This document describes the current authentication and authorization baseline. It supersedes the original Issue #3 notes where later work added roles, dynamic module permissions, session revocation, roster activation, recovery, and staff gateway provisioning.

## Security model

- Protected API routes require `Authorization: Bearer <JWT>`.
- JWTs are signed with `JWT_SECRET`, expire according to `JWT_EXPIRES_IN` (seven days by default), and carry `userId`, email, role, optional accountant type, and `sessionVersion`.
- Authentication reloads the user from MongoDB. The account must still exist, be `ACTIVE`, and have the token's current `sessionVersion`.
- Server-side authorization is the security boundary. Frontend permissions only control presentation.

## Roles, designations, and custody authority

| Role | Scope |
| --- | --- |
| `SUPER_ADMIN` | Unrestricted server-side access, including dynamic-module bypass and controlled Super Admin provisioning. |
| `ADMIN` | Organization administration; may also be the Primary accountant. |
| `ACCOUNTANT` | Collection, custody, and expense work when granted relevant module permissions. |
| `MEMBER` | Member-facing access; public self-registration is closed. |
| `INVESTMENT_MANAGER` | Investment and project-wallet work only; no member, payment, custody, or settings access. |

Board designations are separate from roles: `DIRECTOR`, `PRESIDENT`, `ACCOUNTANT`, `ASSISTANT_ACCOUNTANT`, `GENERAL_SECRETARY`, `CONVENER`, and `GENERAL_MEMBER`. The module matrix resolves by designation first, then by role. A Super Admin may change ordinary matrices; Super Admin is permanently unrestricted.

Accountant custody authority is either `PRIMARY` or `ASSISTANT`. `requireAccountant(...)` is property-based—there are no hardcoded usernames. Super Admin is deliberately permitted through it and retains their own audit identity. Investment routes use a stricter rule for administrators, investment managers, and the Primary accountant; migration review is restricted to Super Admin and the Primary Admin accountant.

## Components

### Passwords, tokens, and user records

- [`password.ts`](../backend/src/utils/password.ts) hashes and verifies passwords with `bcryptjs`.
- [`jwt.ts`](../backend/src/utils/jwt.ts) signs and verifies JWT claims and fails closed when `JWT_SECRET` is missing.
- [`User.ts`](../backend/src/models/User.ts) marks password hashes and reset-token hashes as non-selected fields. It stores session version, temporary-password state, reset-token state, linked gateway channels, and only a hash/prefix of a staff routing key.

### Authorization middleware

[`auth.ts`](../backend/src/middlewares/auth.ts) supplies:

- `authenticate`: validates bearer token, active account status, session version, and temporary-password restrictions.
- `requireRole(...roles)`: route-level role checks.
- `requireAccountant(...types)`: accountant custody authorization for financial actions.
- `requireModuleAccess(moduleKey, action)`: server-side dynamic view/edit checks from `ModulePermission`.
- `requireInvestmentAccess` and `requireMigrationAccess`: domain-specific restrictions for sensitive workflows.

[`security.ts`](../backend/src/middlewares/security.ts) supplies login throttling—10 attempts per IP/login identifier per 15 minutes—security response headers, and idempotency-key protection for configured financial writes. Request sanitization rejects unsafe MongoDB operator-style and dotted field names.

## Authentication and lifecycle routes

| Route | Access | Behavior |
| --- | --- | --- |
| `POST /api/auth/login` | Public, rate-limited | Accepts email or normalized phone plus password, checks active status, records `lastLoginAt`, issues a session-bound JWT, and audits login. Placeholder `@member.local` addresses cannot be used as a sign-in alias. |
| `GET /api/auth/me` | Authenticated | Returns safe profile data: role, designation, accountant type, status, member link, and temporary-password state. |
| `POST /api/auth/forgot-password` | Public | Always returns a generic response. A known account receives a random hashed token valid for 15 minutes. Development may return the raw token for local testing; production requires a verified delivery channel. |
| `POST /api/auth/reset-password` | Public with valid token | Requires a 12-character password, clears reset data, increments `sessionVersion`, and audits the reset. Existing sessions are revoked. |
| `POST /api/auth/change-password` | Authenticated | Replaces a temporary activation password, clears `mustChangePassword` and expiry, and audits activation. |
| `POST /api/auth/public-register` | Public | Intentionally denied. Member accounts are provisioned from the approved roster. |

While `mustChangePassword` is set, only `/api/auth/me` and `/api/auth/change-password` remain available. Temporary activation passwords can expire.

## Administration and staff provisioning

| Route | Access | Behavior |
| --- | --- | --- |
| `POST /api/auth/register` | Admin or Super Admin | Creates accounts after role/password/accountant-type validation. Only Super Admin can create a Super Admin; an Accountant must declare `PRIMARY` or `ASSISTANT`. |
| `GET /api/auth/staff` | Admin or Super Admin | Lists operational accountants without credentials or raw routing keys. |
| `POST /api/auth/staff` | Admin or Super Admin | Provisions an accountant, validates linked gateway channels, stores a generated routing key only as hash/prefix, and returns its raw value once. |
| `POST /api/auth/staff/:id/offboard` | Admin or Super Admin | Suspends staff, clears accountant/gateway credentials, increments `sessionVersion`, and audits the revocation. An operator cannot offboard their own active account. |

Linked gateway channels constrain which custody channels an accountant may use for collection. Payment recording also requires a non-Super-Admin accountant to use their assigned custody account.

## Session revocation, auditing, and production notes

`sessionVersion` is stored on the user and included in each JWT. Incrementing it immediately invalidates older tokens; password resets and offboarding do this automatically.

Sign-ins, password resets, activation-password changes, user creation, staff provisioning, and offboarding produce audit events. Never put JWTs, passwords, reset tokens, generated routing keys, or production secrets in source control, screenshots, issues, or logs.

For production, use HTTPS, a unique `JWT_SECRET` of at least 32 characters, an edge/WAF rate limit in addition to application throttling, and the [Production Security & Recovery Runbook](<Production Security & Recovery Runbook.md>).

## Verification

Authentication/RBAC is covered by backend type checks and integration tests, including bearer authentication, server-side role/module authorization, session-version invalidation, and financial safeguards.

```bash
npm run typecheck --prefix backend
npm test --prefix backend
npm run build --prefix frontend
```

See [Issue #23](<Walkthrough- Issue #23 — Comprehensive Automated Integration & Regression Test Suite (Full-Stack).md>) and [Issue #26](<Walkthrough- Issue #26 — Production Infrastructure, Docker & CI-CD.md>) for broader regression and production-readiness coverage.
