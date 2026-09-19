# Walkthrough: Issue #3 — Authentication & RBAC

Implemented secure authentication and Role-Based Access Control (RBAC) for the NS Foundation API.

---

## 1. Components Built

### A. Security & Utilities
- [`backend/src/utils/password.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/utils/password.ts):
  - `hashPassword(password)`: Hashes plaintext with `bcryptjs` (salt rounds: 10).
  - `comparePassword(password, hash)`: Safely compares plaintext passwords against bcrypt hashes.
- [`backend/src/utils/jwt.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/utils/jwt.ts):
  - `generateToken(payload)`: Signs JWT containing `userId`, `email`, `role`, and `accountantType`.
  - `verifyToken(token)`: Validates and decodes JWT payload.

### B. Middlewares
- [`backend/src/middlewares/auth.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/middlewares/auth.ts):
  - `authenticate`: Extracts Bearer token, verifies token validity, ensures user exists and has `ACTIVE` status, and attaches user document to `req.user`.
  - `requireRole(...roles)`: Authorizes requests based on assigned roles (`ADMIN`, `ACCOUNTANT`, `MEMBER`).
  - `requireAccountant(...types)`: Restricts financial custody actions based on dynamic `accountantType` (`PRIMARY` Moin, `ASSISTANT` Samrat). **Zero hardcoded usernames**.

### C. Controllers & Routes
- [`backend/src/controllers/auth.controller.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/controllers/auth.controller.ts):
  - `POST /api/auth/login`: Validates credentials, checks account status, returns JWT and user profile, and records an `AuditLog` entry.
  - `GET /api/auth/me`: Returns profile of currently authenticated user.
  - `POST /api/auth/register`: Admin-only endpoint to securely register new system accounts, with password length validation and `AuditLog` tracking.
- [`backend/src/routes/auth.routes.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/routes/auth.routes.ts):
  - Wired into Express in [`backend/src/app.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/app.ts) under `/api/auth`.

### D. Initial User Seeding
- [`backend/src/scripts/seed-users.ts`](file:///c:/TechVelly/NSFoundationWebApp/backend/src/scripts/seed-users.ts):
  - Seed script callable via `npm run seed:users --prefix backend`.
  - Seeds:
    - Primary Admin & Primary Accountant: `admin@nsfoundation.org` (`role: ADMIN`, `accountantType: PRIMARY`)
    - Assistant Accountant: `assistant@nsfoundation.org` (`role: ACCOUNTANT`, `accountantType: ASSISTANT`)

---

## 2. Verification & Validation Results

| Test / Check | Result |
| :--- | :--- |
| **TypeScript Typecheck** (`npm run typecheck`) | ✅ **PASS** — 0 errors |
| **TypeScript Build** (`npm run build`) | ✅ **PASS** — Compiled cleanly to `dist/` with 0 errors |
| **Password Hashing & Matching** | ✅ **PASS** — Bcrypt salt round 10 hashing verified; invalid passwords rejected |
| **JWT Generation & Verification** | ✅ **PASS** — Tokens signed and decoded with matching claims |
| **`requireRole` Middleware** | ✅ **PASS** — `ADMIN` granted access; `ACCOUNTANT` blocked from admin routes |
| **`requireAccountant` Middleware** | ✅ **PASS** — `PRIMARY` granted access; `ASSISTANT` blocked from primary actions |

---

## 3. Next Step in Development Sequence

* **Issue #1**: Project Foundation *(Completed)*
* **Issue #2**: Database & Domain Models *(Completed)*
* **Issue #3**: Authentication & RBAC *(Completed)*
* **Issue #4**: **Member Management** *(Next)*
  - Member CRUD endpoints (`GET /api/members`, `POST /api/members`, `GET /api/members/:id`, `PUT /api/members/:id`, `DELETE /api/members/:id`).
  - Auto-generated member ID (`NS-001`, `NS-002`, ...).
  - Search, filter by status (`ACTIVE`, `INACTIVE`), pagination.
  - Member details with share summary and balance status.
