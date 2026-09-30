# Production Readiness & Rollout Plan

## Current status

Core society operations are implemented: members, shares, payments, custody, investments, reinvestment, expenses, reporting, annual settlement, audit controls, member portal, role-based access, CSV roster import, and Bangla localization.

Issue #25 (notifications) is deliberately deferred. It is not a go-live dependency because payment posting and member access work without SMS, WhatsApp, or email delivery.

## Remaining work before production

### Required go-live blockers

1. **Finish and validate Issue #26 infrastructure.** Run the Docker Compose stack on a Docker-enabled staging host, verify MongoDB replica-set transactions, background-worker health, health/readiness probes, Nginx proxying, HTTPS, and GitHub Actions. Redis is provisioned for a future queue-provider migration; the current worker uses authoritative MongoDB job records.
2. **Provision production secrets.** Create unique production JWT, MongoDB, S3/R2 backup, and administrator credentials. Store them in the host secret manager and GitHub Environment secrets; never commit them. Use URL-safe database passwords because Compose constructs the internal MongoDB URI.
3. **Create the production database.** Start with an empty database, take an initial encrypted backup, then import the approved 2024 member CSV using the Admin preview-and-confirm workflow. Confirm every `NSF###` member, normalized mobile number, share count, and active/inactive status before distributing activation passwords.
4. **Run acceptance testing.** Test Admin, Super Admin, Accountant, Investment Manager, Director, and Member accounts. Verify a Member cannot access another Member's data, custody, settings, or API routes.
5. **Complete Issue #28 executive sign-off.** Formally approve outstanding distribution/transfer policy decisions, load and reconcile 2024 historical financial evidence, and obtain a zero-variance reconciliation approval. No live financial posting should begin before this sign-off.
6. **Verify recovery.** Run an encrypted backup, restore it to an isolated database, and run the financial integrity audit before accepting real records.

### Recommended before or immediately after go-live

- Complete Issue #27 for route-based bundle optimization and financial precision hardening.
- Configure a real email sender for password recovery. SMS OTP has unavoidable gateway/carrier cost, so it remains optional until a provider is approved.
- Implement Issue #25 only after selecting and funding SMS/WhatsApp/email providers.
- Configure monitoring for API errors, database health, backup age, worker health, and failed login spikes.

## Deployment phases

### Phase 1 — Staging

Deploy the Issue #26 Compose stack to a non-production host with an isolated MongoDB database. Use a staging domain and HTTPS certificate. Run the CI quality gate, health checks, full regression suite, and role-by-role browser acceptance test.

### Phase 2 — Data and governance rehearsal

Perform a dry-run CSV import using a copy of the approved roster. Reconcile counts, share totals, and mobile uniqueness. Test temporary-password activation, 30-day expiry handling, password recovery process, and inactive-member login denial. Restore a staging backup to prove recovery.

### Phase 3 — Production launch

1. Create the production host, HTTPS domain, private MongoDB/Redis volumes, and offsite encrypted backup bucket.
2. Set production secrets and deploy a tagged release through the protected GitHub `production` environment.
3. Confirm `/api/health` and `/api/ready` return HTTP 200.
4. Import the approved CSV once, then verify the import audit event and database record counts.
5. Distribute individual activation credentials securely; never post them in groups.
6. Allow a small pilot group to activate accounts and verify the member portal before organization-wide release.

### Phase 4 — First-week operations

Review daily backup completion, failed job status, audit events, unauthorized-access attempts, and Member activation progress. Keep a support log for identity-verified account recovery. Do not change financial policies or import new members without recorded administrator approval.

## Go / no-go checklist

Go live only when every item is true:

- [ ] CI typecheck, build, and regression tests pass on the release commit.
- [ ] Staging Docker deployment and health/readiness probes pass.
- [ ] HTTPS and secure production secrets are configured.
- [ ] Backup upload and isolated restore drill pass, including the explicit restore confirmation and offsite bucket-retention rule.
- [ ] Approved 2024 member roster is validated and imported with audit evidence.
- [ ] Role and Member portal authorization tests pass.
- [ ] 2024 reconciliation and executive approval are signed off.
- [ ] Named administrators own deployment, backup, recovery, and Member-support duties.

If any item fails, remain in staging and resolve it before real money, member credentials, or final distributions are used in production.
