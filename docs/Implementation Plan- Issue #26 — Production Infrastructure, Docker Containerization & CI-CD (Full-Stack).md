# Implementation Plan — Issue #26: Production Infrastructure, Docker Containerization & CI/CD (Full-Stack)

## Goal

Containerize the full NS Foundation application, orchestrate a production-ready environment featuring a MongoDB replica set (required for multi-document ACID transactions) and Redis, establish automated GitHub Actions CI/CD pipelines, and implement automated offsite encrypted backups.

---

## Scope

- Multi-stage Docker builds for backend (Node.js 22 LTS Alpine) and frontend (Vite build served by Nginx Alpine).
- Production `docker-compose.prod.yml` coordinating:
  - Backend API container with non-root security.
  - Frontend Nginx container acting as an application edge proxy with gzip compression and security headers; the host/load balancer terminates TLS.
  - MongoDB 8 service initialized with a single-node replica set (`rs0`) to enable MongoDB transactions in production.
  - Redis service provisioned for a future queue-provider migration; the current authoritative worker uses MongoDB job records.
- GitHub Actions CI/CD workflows:
  - `.github/workflows/ci.yml`: Automated quality gate (backend typecheck, frontend production build, Vitest suite, and Docker image build) on pull requests and pushes to `main`.
  - `.github/workflows/deploy.yml`: Automated Docker image building and deployment to production server via SSH/Docker registry.
- Disaster Recovery & Backup Automation:
  - `scripts/backup-mongodb.sh`: Daily cron script taking `mongodump`, compressing with date tag, encrypting with OpenSSL, and uploading to cloud storage (Cloudflare R2 or AWS S3).
  - `scripts/restore-mongodb.sh`: Recovery script testing database restoration and running Issue #13 financial integrity scan after restore.

---

## Production Architecture

```text
       Internet (HTTPS / Port 443)
                   │
                   ▼
┌──────────────────────────────────────┐
│        Nginx Reverse Proxy           │
│ - Static assets and /api proxy       │
│ - Serves static frontend assets      │
│ - Proxies /api/* to Express Backend  │
└──────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│      Express API Container           │
│ - Node.js 22 Alpine (non-root user)  │
│ - Health check: /api/health          │
└──────────────────────────────────────┘
         │                   │
         ▼                   ▼
┌──────────────────┐  ┌──────────────────┐
│  MongoDB 8 (rs0) │  │      Redis       │
│  - Replica Set   │  │  - Future queue  │
│  - Persistent vol│  │  - Persistent vol│
└──────────────────┘  └──────────────────┘
```

---

## Detailed Implementation Tasks

### 1. Dockerization
- **Backend `backend/Dockerfile`:**
  - Stage 1 (`builder`): Install dev dependencies, compile TypeScript (`npm run build`).
  - Stage 2 (`runner`): Copy `dist/` and production `node_modules` only. Run as non-root `node` user. Expose port 5000.
- **Frontend `frontend/Dockerfile` & `nginx.conf`:**
  - Stage 1 (`builder`): Build Vite assets with production optimization.
  - Stage 2 (`runner`): Copy static `/dist` to Nginx Alpine html directory.
  - `nginx.conf`: Configure client routing (`try_files $uri $uri/ /index.html;`), proxy pass for `/api/` to backend service, gzip compression, and security headers (`X-Frame-Options`, `Content-Security-Policy`).
- **`docker-compose.prod.yml`:**
  - Coordinates `frontend`, `backend`, `mongo`, `redis`.
  - Configures authenticated database startup, health checks, auto-restart policies, non-root backend execution, and named volumes for database persistence.
  - Automatically runs `rs.initiate()` on the MongoDB instance so transactions work out of the box.

### 2. GitHub Actions CI/CD Pipelines
- **Continuous Integration (`.github/workflows/ci.yml`):**
  ```yaml
  name: CI Quality Gate
  on: [push, pull_request]
  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22
        - run: npm install
        - run: npm run typecheck --prefix backend
        - run: npm run build --prefix frontend
        - run: npm test --prefix backend
  ```
- **Deployment Pipeline (`.github/workflows/deploy.yml`):**
  - Triggers only on tagged releases or a manual dispatch that names an existing release tag.
  - Builds and pushes images to GitHub Container Registry (GHCR) or Docker Hub.
  - Executes deployment on the production host via SSH.

### 3. Automated Offsite Backup & Disaster Recovery
- **Backup Script (`scripts/backup-mongodb.sh`):**
  - Runs `mongodump` with `--gzip --archive`.
  - Encrypts archive using AES-256-CBC with encryption key stored in environment.
  - Uploads encrypted archive to an S3-compatible bucket (e.g. Cloudflare R2, AWS S3).
  - Removes local encrypted archives older than 30 days; the offsite bucket lifecycle rule is configured by the infrastructure owner.
- **Restore & Verification Drill (`scripts/restore-mongodb.sh`):**
  - Decrypts and restores a supplied archive into an isolated staging MongoDB database only after an explicit confirmation value is supplied.
  - Requires an operator to invoke the authenticated financial-integrity endpoint after restore and confirm custody movements, payments, and member shares have zero variance before giving go-ahead.

---

## Acceptance Criteria

- The staging Compose override builds and starts all services cleanly; the production Compose file pulls the approved immutable images defined in `.env.production`.
- MongoDB transactions function properly in the containerized environment.
- GitHub Actions CI successfully runs on push and blocks merge if any test or typecheck fails.
- The automated backup script produces an encrypted archive and uploads to cloud storage.
- A recovery test restores the database and validates 100% financial data integrity.
