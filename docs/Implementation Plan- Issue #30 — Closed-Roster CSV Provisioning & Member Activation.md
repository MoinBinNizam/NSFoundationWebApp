# Issue #30 — Closed-Roster CSV Provisioning & Member Activation

## Objective

NS Foundation has a closed, verified 2024 membership roster. Public member registration is disabled. Administrators provision approved members from a CSV into the database, where all later authentication and authorization occurs.

## Admin workflow

1. Select **Import CSV** in Member Management.
2. Upload CSV with `MemberID`, `Name`, `Phone`, `JoinDate`, `Shares`, and optional `Status`.
3. Review row-level validation and click **Confirm and save to database** once.

The CSV is held only for the 15-minute preview. It is not stored after import, so the administrator may delete the local source file after successful confirmation.

## Validation and provisioning

- Accept only unique `NSF###` member IDs, valid unique mobile numbers, valid join dates, and positive whole share counts.
- Reject imports that conflict with database Member IDs or mobile numbers.
- Create linked `Member`, `User`, and initial `ShareHistory` records.
- Provision a 30-day temporary activation password selected by the Admin. Its hash only is stored.
- Record an immutable import audit event.

## Activation

Members sign in using their database mobile number (or verified email later) and temporary password. Before activation is complete, the system reveals only the Member name and blocks all account APIs. The Member must create a password of at least 12 characters; then the portal redirects to the exact linked `NSF###` profile.

## Recovery and delivery

SMS OTP cannot be delivered in production at zero cost because a mobile gateway/carrier is required. Email verification/reset can have no additional per-message cost only when NS Foundation already operates an SMTP mailbox; otherwise it also requires a provider. Implement provider configuration before enabling recovery delivery. Admin-assisted recovery requires identity verification and an audit trail.

## Tests

- CSV header, row, duplicate ID, duplicate phone, and conflict validation.
- Preview expiry and import confirmation.
- Temporary-password API blocking, 30-day expiry, and forced activation.
- Mobile/email login, inactive account denial, and audit evidence.
