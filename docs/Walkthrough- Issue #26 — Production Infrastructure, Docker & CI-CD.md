# Walkthrough — Issue #26: Production Infrastructure, Docker & CI/CD

## What is included

- Multi-stage Node 22 backend and Vite/Nginx frontend images.
- `docker-compose.prod.yml` with MongoDB 8 as replica set `rs0`, Redis, health checks, persistent volumes, and restart policies.
- Nginx client routing, API proxying, compression, and browser security headers.
- GitHub Actions CI quality gate and release-tag/manual deployment workflow.
- Encrypted MongoDB backup and isolated restore scripts for S3 or R2-compatible storage.

## First production deployment

1. Copy `backend/.env.production.example` to `backend/.env.production` on the host and fill in the real HTTPS origin and a unique 32+ character JWT secret.
2. Set `HTTP_PORT` in the host environment, then run `docker compose -f docker-compose.prod.yml up -d --build`.
3. Place an HTTPS TLS reverse proxy/load balancer in front of the exposed frontend port. The included Nginx is an application edge proxy; certificate management remains host/infrastructure owned.
4. Confirm `/api/health` and `/api/ready` return HTTP 200 after MongoDB completes replica-set initialization.

## CI/CD secrets

Configure the GitHub `production` environment with `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_SSH_KEY`, and `PRODUCTION_APP_DIR`. The deploy job runs only for a release tag or manual dispatch and is protected by that environment approval.

## Backup drill

Set `MONGODB_URI`, `BACKUP_ENCRYPTION_PASSWORD`, `S3_BUCKET`, AWS/R2 credentials, and optionally `S3_ENDPOINT_URL`, then schedule:

```bash
0 2 * * * /opt/nsfoundation/scripts/backup-mongodb.sh
```

Restore only into an isolated database and run the authenticated financial-integrity endpoint before reopening writes.

## Local verification

`npx tsc -b --pretty false` in `frontend/` passed. Docker CLI is not installed in this workstation session, so `docker compose config` and container startup must be verified on a Docker-enabled machine before release.

