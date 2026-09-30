#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM=RESTORE_ISOLATED_DATABASE to continue}"

if [[ "$RESTORE_CONFIRM" != "RESTORE_ISOLATED_DATABASE" ]]; then
  echo "Refusing restore: use an isolated database and set RESTORE_CONFIRM=RESTORE_ISOLATED_DATABASE." >&2
  exit 1
fi

command -v mongorestore >/dev/null || { echo "mongorestore is required" >&2; exit 1; }

archive="${BACKUP_FILE%.enc}"
trap 'rm -f "$archive"' EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$BACKUP_FILE" -out "$archive" -pass env:BACKUP_ENCRYPTION_PASSWORD
mongorestore --uri="$MONGODB_URI" --gzip --archive="$archive" --drop
echo "Restore complete. Run the authenticated /api/audit/verify-integrity check before permitting writes."
