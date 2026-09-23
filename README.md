# NS Foundation Cooperative Society Management System

NS Foundation is a full-stack cooperative-finance application for managing members, shares, contributions, accountant custody, investments, expenses, annual governance, distribution, reporting, and controlled document exports.

The project is designed around auditable financial source records: payments, allocations, custody movements, and their associated audit events are kept separate from rebuildable reporting projections.

## Technology

| Area | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB with Mongoose |
| Authentication | JWT bearer tokens, server-side role checks, session version revocation |
| Testing | Vitest (backend baseline) |

## Features

- Member registration and management, including Bangladesh and international phone normalization.
- Share history, annual accounts, reconciliation, and governance controls.
- Contributions, payment allocation previews, payment receipts, and payment-method reporting.
- Accountant custody accounts, immutable movement ledger, transfers, and reconciliation.
- Investment, return, reinvestment, expense, migration, final-distribution, and document-export workflows.
- Role-based access for Super Admin, Admin, Accountant, and Member accounts.
- Audit & Security workspace for authorized administrators, including audit event inspection and read-only integrity checks.

## Repository layout

```text
NSFoundationWebApp/
├── frontend/        React application
├── backend/         Express API, domain services, Mongoose models, and tests
├── docs/            SRS, business rules, implementation plans, walkthroughs, runbooks
├── scripts/         Local development helper scripts
└── package.json     Root convenience scripts
```

## Prerequisites

- Node.js 20 or later (Node.js 22 is used in the current development environment).
- npm 10 or later.
- MongoDB 8 or a compatible MongoDB server.

For local Windows development, the repository includes a MongoDB service starter. It assumes MongoDB 8 is installed under `C:\Program Files\MongoDB\Server\8.0` and configured as the `MongoDB` Windows service.

## Local setup

1. Install dependencies.

   ```bash
   npm install
   npm install --prefix frontend
   npm install --prefix backend
   ```

2. Create `backend/.env` from [`backend/.env.example`](backend/.env.example). Do not commit this file.

   ```env
   NODE_ENV=development
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/ns-foundation
   CORS_ORIGIN=http://localhost:5173
   JWT_SECRET=replace-with-a-long-local-development-secret
   JWT_EXPIRES_IN=7d
   ```

3. Start MongoDB.

   ```powershell
   npm run start:db
   ```

   The script may request Windows administrator approval because it starts the Windows service and writes its local service configuration. It configures a conservative 256 MB WiredTiger cache for lower-memory development machines. If you use Docker, MongoDB Atlas, or another local MongoDB installation, start that service instead and update `MONGODB_URI`.

4. In separate terminals, start the API and frontend.

   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```

5. Open [http://localhost:5173](http://localhost:5173). The API health endpoint is [http://localhost:5000/api/health](http://localhost:5000/api/health).

## Scripts

Run these from the repository root unless otherwise noted.

| Command | Purpose |
| --- | --- |
| `npm run start:db` | Start/configure the local Windows MongoDB service. |
| `npm run dev:backend` | Run the backend with watch mode on port 5000. |
| `npm run dev:frontend` | Run the Vite frontend on port 5173. |
| `npm run build --prefix backend` | Compile the backend. |
| `npm run typecheck --prefix backend` | Type-check the backend without writing build output. |
| `npm test --prefix backend` | Run backend Vitest tests. |
| `npm run build --prefix frontend` | Type-check and build the frontend. |
| `npm run lint --prefix frontend` | Run frontend linting. |

The backend also contains focused domain verification scripts such as `test:reporting`, `test:expenses`, and `test:reinvestments`; see [`backend/package.json`](backend/package.json).

## Security and financial integrity

- The API requires a valid bearer token for protected routes and enforces roles on the server. Client-side navigation is not an authorization boundary.
- Login attempts are rate-limited. Requests are sanitized to reject MongoDB operator keys and unsafe field names.
- Financial write endpoints use idempotency keys where configured; do not retry by inventing a different key after an uncertain financial response.
- Audit logs are append-only through the application. Administrator audit tooling is restricted to Admin and Super Admin roles.
- The integrity scan compares custody cached balances against `CustodyMovement` totals, payment allocations against payment components, and annual final shares against share history. It reports variance only; it never silently repairs source records.
- Use reversal or compensating entries for financial corrections. Do not edit or delete historical source records directly.

## Production notes

- Use a unique `JWT_SECRET` of at least 32 characters and an HTTPS `CORS_ORIGIN`.
- Use a managed MongoDB replica set or an equivalent replica-set deployment before enabling production financial operations.
- Store all secrets outside Git and outside frontend environment variables.
- Follow the deployment and recovery guidance in [Issue #14 Deployment & Backup plan](<docs/Implementation Plan- Issue #14 — Deployment & Backup (Full-Stack).md>) and [Production Security & Recovery Runbook](<docs/Production Security & Recovery Runbook.md>).
- Backups and restore drills must preserve MongoDB data, audit records, migration evidence, and uploaded documents. Validate every recovery with the administrator integrity check before reopening writes.

## Documentation

- [Software Requirements Specification](docs/SRS.md)
- [Business rules](docs/BUSINESS-RULES.md)
- [Issue #13 audit/security walkthrough](<docs/Walkthrough- Issue #13 — Audit, Security & Testing (Full-Stack).md>)
- [Issue #21 background jobs, tests, and recovery-readiness plan](<docs/Implementation Plan- Issue #21 — Background Jobs, Test Suite & Operational Readiness (Full-Stack).md>)
- [All project documentation](docs/)

## Troubleshooting

### Sign-in reports an API or MongoDB error

1. Check `http://localhost:5000/api/health`.
2. If the database is not connected, start MongoDB with `npm run start:db` or start the database configured by `MONGODB_URI`.
3. Start/restart the API with `npm run dev:backend`.
4. Confirm the frontend proxy target remains `http://localhost:5000` in [`frontend/vite.config.ts`](frontend/vite.config.ts).

An invalid credential should return an authentication error (HTTP 401), not a server error. Never add credentials, connection strings, reset tokens, or production secrets to issues, logs, or commits.

## License

This repository is currently licensed under the ISC license. See [`package.json`](package.json).
