#!/bin/sh
# Host-side rollout. No database migration or permission changes are required.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run with sudo sh.'; exit 1; }
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$app"
exec 9>backups/.drive-job.lock
flock -w 180 9
export COMPOSE_FILE="$app/compose.yml:$app/deploy/production.yml"
docker compose config --quiet
# Existing backup code stops writers consistently and restarts them in finally.
/usr/local/bin/node --env-file=/etc/profile-studio-backup/backup.env scripts/backup-secure.mjs
previous="profile-studio:before-appearance-library-$(date -u +%Y%m%d%H%M%S)"
docker image tag profile-studio:local "$previous"
docker compose build api
if docker compose up -d --no-deps api bot worker; then
  for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:3100/health >/dev/null; then
      echo 'Appearance library API and bot update completed. Existing profiles and sessions were retained.'
      echo "Previous image retained for rollback: $previous"
      exit 0
    fi
    sleep 1
  done
fi
echo 'Updated API did not become healthy. Restoring the previous application image.'
docker image tag "$previous" profile-studio:local
docker compose up -d --no-deps api bot worker
exit 1
