# Production Security & Recovery Runbook

## Before production launch

- Use a MongoDB replica set or managed MongoDB deployment; financial transactions require it.
- Configure a unique `JWT_SECRET` of at least 32 characters and an HTTPS `CORS_ORIGIN`.
- Store environment secrets outside Git and rotate them after staff changes or suspected exposure.
- Confirm backups cover MongoDB, audit logs, migration batches, configuration, and supporting documents.

## Backup and restore drill

1. Create an encrypted point-in-time database backup.
2. Restore it into an isolated non-production database.
3. Verify member counts, payments, custody movements, investments, audit logs, and migration records.
4. Record the date, operator, backup identifier, reconciliation results, and recovery duration.
5. Do not overwrite production during a restore drill.

## Incident response

1. Suspend affected staff accounts to revoke sessions immediately.
2. Preserve audit evidence and request IDs.
3. Do not delete financial records; use authorized reversals or compensating entries.
4. Rotate affected credentials and confirm backup integrity before recovery.
