#!/usr/bin/env bash
set -euo pipefail

: "${BACKEND_IMAGE:?BACKEND_IMAGE is required}"
: "${FRONTEND_IMAGE:?FRONTEND_IMAGE is required}"

compose=(docker compose --env-file .env.production -f docker-compose.prod.yml)
"${compose[@]}" config --quiet
"${compose[@]}" pull
"${compose[@]}" up -d --remove-orphans

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:"${HTTP_PORT:-8080}"/api/ready >/dev/null; then
    echo "Production stack is ready."
    exit 0
  fi
  sleep 2
done

echo "Deployment started but readiness did not pass within 60 seconds." >&2
"${compose[@]}" ps
exit 1

