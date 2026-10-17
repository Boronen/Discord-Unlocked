#!/bin/sh
# Forward-only deployment. An application-image rollback cannot undo v2 database writes.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run with sudo sh.'; exit 1; }
reuse_image=
if [ "$#" != 0 ]; then
  [ "$#" = 2 ] && [ "$1" = --use-built-image ] || { echo 'Usage: update-studio-v2.sh [--use-built-image sha256:image-id]'; exit 1; }
  reuse_image=$2
  printf '%s\n' "$reuse_image" | grep -Eq '^sha256:[a-f0-9]{64}$' || { echo 'An immutable local image ID is required.'; exit 1; }
fi
umask 077
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$app"
mkdir -p backups
exec 9>backups/.drive-job.lock
flock -w 180 9
export COMPOSE_FILE="$app/compose.yml:$app/deploy/production.yml"
docker compose config --quiet
assert_image() {
  [ "$(docker image inspect --format '{{.Id}}' profile-studio:local)" = "$1" ] || {
    echo 'The local image changed. Deployment stopped before migration.'; exit 1;
  }
}
if [ -n "$reuse_image" ]; then assert_image "$reuse_image"; fi
# Fail before interrupting the current services if host-side scan tooling is missing.
/usr/local/bin/node --input-type=module -e "await import('fflate')"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$app/backups/before-studio-v2-$stamp"
previous="profile-studio:before-studio-v2-$stamp"
# The local candidate tag may already differ from the still-running API image.
running_api=$(docker compose ps -q api)
if [ -n "$running_api" ]; then
  previous_image=$(docker inspect --format '{{.Image}}' "$running_api")
else
  previous_image=profile-studio:local
fi
docker image tag "$previous_image" "$previous"
/usr/local/bin/node --env-file=/etc/profile-studio-backup/backup.env scripts/backup-secure.mjs "$backup"
if [ -z "$reuse_image" ]; then docker compose build api; fi
candidate_image=$(docker image inspect --format '{{.Id}}' profile-studio:local)
if [ -n "$reuse_image" ]; then assert_image "$reuse_image"; fi
/usr/local/bin/node scripts/security-scan.mjs --image-only "$candidate_image"
# Uses the new image, an isolated database, encrypted archives and current migration code.
RESTORE_DRILL_IMAGE="$candidate_image" /usr/local/bin/node --env-file=/etc/profile-studio-backup/backup.env scripts/restore-drill.mjs "$backup"
assert_image "$candidate_image"
docker compose stop api bot worker
failed() {
  docker compose stop api bot worker || true
  echo 'Studio v2 deployment stopped. Services remain stopped to protect the expanded database.'
  echo "Encrypted rollback database and media: $backup"
  echo "Retained application image: $previous"
  echo 'Follow docs/STUDIO-V2-DEPLOYMENT.md. Do not start the previous image against a v2 database.'
}
trap failed EXIT HUP INT TERM
docker compose run --rm -T --no-deps migrate
assert_image "$candidate_image"
docker compose up -d --no-deps api bot worker
for attempt in $(seq 1 45); do
  running=true
  for service in api bot worker; do
    container=$(docker compose ps -q "$service")
    if [ -z "$container" ] || [ "$(docker inspect --format '{{.State.Status}}' "$container")" != running ]; then
      running=false
    fi
  done
  if [ "$running" = true ] && curl -fsS --max-time 3 http://127.0.0.1:3100/health >/dev/null; then
    trap - EXIT HUP INT TERM
    echo 'Studio v2 API health passed; API, bot and worker are running. Test the matching Windows ZIP next.'
    echo "Rollback point: $backup ; image: $previous"
    exit 0
  fi
  sleep 1
done
exit 1
