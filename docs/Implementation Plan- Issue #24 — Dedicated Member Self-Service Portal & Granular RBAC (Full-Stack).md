# Implementation Plan — Issue #24: Dedicated Member Self-Service Portal & Granular RBAC (Full-Stack)

## Goal

Provide a secure, personalized, and restricted self-service portal for cooperative members to view their individual share holdings, payment status, dues, download official payment receipts and annual statements, and manage their credentials. Concurrently, introduce granular RBAC refinements including the dedicated `INVESTMENT_MANAGER` role.

---

## Scope

- **Member Portal UI:** A responsive, mobile-first dashboard displayed when a user with role `MEMBER` logs in.
- **Personal Financial Snapshot:** Real-time visibility into total owned shares, monthly contribution obligation, payment history, outstanding dues, late penalties, and advance credit balances.
- **Document Access:** Direct download of official single-payment receipts (PDF/PNG) and personal Annual Member Statements (PDF) for any past accounting year.
- **Security & Route Guarding:** Strict server-side and client-side access control preventing members from viewing administrative settings, accountant custody ledgers, or other members' confidential records.
- **Dedicated Investment Manager Role:** Introduce `INVESTMENT_MANAGER` role in `UserRole` enum and RBAC middleware to decouple investment project operations from general accountant/admin permissions.

---

## Architecture & User Journey

```text
┌────────────────────────────┐
│      User Logs In          │
└────────────────────────────┘
              │
              ▼
   Role === 'MEMBER'? 
   ├── YES ──► Member Portal Layout (/portal)
   │           ├── My Dashboard (Shares, Due, Advance, Next Deadline)
   │           ├── My Contribution History (Receipts download)
   │           ├── My Annual Statements (PDFKit export)
   │           └── Account Security (Change Password)
   │
   └── NO (ADMIN/ACCOUNTANT/INVESTMENT_MANAGER) ──► Staff Backoffice Layout (/)
```

---

## Detailed Implementation Tasks

### 1. Backend: Member Context & Self-Service Endpoints
- **Link User to Member:** Ensure the `User` schema has an optional or required `memberId: { type: Schema.Types.ObjectId, ref: 'Member' }` for all member-role accounts.
- **Create Dedicated Self-Service Routes (`backend/src/routes/member-portal.routes.ts`):**
  - `GET /api/portal/me/summary`: Returns the authenticated member's share count, monthly payable obligation, current year payment total, outstanding dues breakdown, penalty dues, advance balance, and next contribution deadline (15th of current month).
  - `GET /api/portal/me/payments`: Returns paginated payment history for the authenticated member with payment method, receiver, receipt link, and allocation details.
  - `GET /api/portal/me/statements/:year/pdf`: Generates and streams the authenticated member's annual statement PDF.
  - `GET /api/portal/me/receipts/:paymentId/pdf`: Streams the authenticated member's official payment receipt PDF.
  - `PATCH /api/portal/me/password`: Allows self-service password updates with current password verification.
- **Data Isolation Enforcement:** The controller retrieves `req.user.memberId` directly from the validated session. It completely ignores any `memberId` query or body parameters sent by the client, making horizontal privilege escalation impossible.

### 2. Backend: Granular RBAC & Investment Manager Role
- Update `backend/src/types/models.ts`:
  ```ts
  export enum UserRole {
    SUPER_ADMIN = 'SUPER_ADMIN',
    ADMIN = 'ADMIN',
    ACCOUNTANT = 'ACCOUNTANT',
    INVESTMENT_MANAGER = 'INVESTMENT_MANAGER',
    MEMBER = 'MEMBER'
  }
  ```
- Update `requireInvestmentAccess` middleware in `backend/src/middlewares/auth.ts` to grant access to `INVESTMENT_MANAGER`, `ADMIN`, `SUPER_ADMIN`, and `PRIMARY` accountant.
- Ensure `INVESTMENT_MANAGER` can access `/api/investments` and `/api/reinvestments`, but is strictly blocked from `/api/payments`, `/api/shares`, `/api/members`, and `/api/settings`.

### 3. Frontend: Dedicated Member Portal Layout & Pages
- Create `frontend/src/pages/portal/MemberPortalPage.tsx`:
  - **Hero Metric Cards:** Total Shares Owned, Monthly Principal Due (৳), Outstanding Dues / Penalties (৳), Advance Credit Balance (৳).
  - **Contribution Deadline Indicator:** Visual countdown / alert to the 15th of the current month.
  - **Payment History Table:** Date, Amount, Channel (bKash/Nagad/Bank/Cash), Receiver (Moin/Samrat), Status, and Action buttons:
    - `Download PDF Receipt`
    - `Download PNG Receipt`
  - **Annual Statements Section:** Dropdown to select accounting year (2024, 2025, etc.) and download official PDF statement.
- Update `frontend/src/components/Layout.tsx`:
  - When `user.role === 'MEMBER'`, render a simplified, mobile-friendly navigation:
    - `My Dashboard`
    - `Payment History & Receipts`
    - `Annual Statements`
    - `Language & Appearance`
  - Completely hide staff modules: Member Management, Shares & Annual Account, Accountant Custody, Expenses, Final Distribution, and Organization Settings.
- Full Bangla localization support across all member portal components.

---

## Acceptance Criteria

- Logging in with a `MEMBER` account automatically directs to the member self-service portal.
- Members can view and download receipts and statements for only their own account.
- Direct HTTP requests by a `MEMBER` to administrative endpoints (`/api/custody`, `/api/members`, `/api/settings`, `/api/expenses`) return HTTP 403 Forbidden.
- Users with role `INVESTMENT_MANAGER` can view and manage investment projects and returns, but are blocked from member contribution collection or bank settings.
- The member portal is fully responsive and readable on mobile devices.
