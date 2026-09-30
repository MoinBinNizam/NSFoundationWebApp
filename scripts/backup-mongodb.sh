#!/usr/bin/env bash
set -euo pipefail

: "${MONGODB_URI:?MONGODB_URI is required}"
: "${BACKUP_ENCRYPTION_PASSWORD:?BACKUP_ENCRYPTION_PASSWORD is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"

command -v mongodump >/dev/null || { echo "mongodump is required" >&2; exit 1; }
command -v aws >/dev/null || { echo "AWS CLI (or R2-compatible aws CLI) is required" >&2; exit 1; }

backup_dir="${BACKUP_DIR:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$backup_dir/nsfoundation-$timestamp.archive.gz"
encrypted="$archive.enc"
aws_args=()
if [[ -n "${S3_ENDPOINT_URL:-}" ]]; then aws_args+=(--endpoint-url "$S3_ENDPOINT_URL"); fi
mkdir -p "$backup_dir"

trap 'rm -f "$archive"' EXIT
mongodump --uri="$MONGODB_URI" --gzip --archive="$archive"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -in "$archive" -out "$encrypted" -pass env:BACKUP_ENCRYPTION_PASSWORD
aws s3 cp "$encrypted" "s3://$S3_BUCKET/mongodb/$timestamp.archive.gz.enc" "${aws_args[@]}"
find "$backup_dir" -type f -name 'nsfoundation-*.enc' -mtime +30 -delete
echo "Encrypted MongoDB backup uploaded: $timestamp"
