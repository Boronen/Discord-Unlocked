#!/bin/sh
# Repair only application-code permissions, then repeat every deployment gate.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run with sudo sh in the VM SSH terminal.'; exit 1; }
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$app"
test -f compose.yml
umask 077
exec 9>backups/.drive-job.lock
flock -w 180 9
stamp=$(date -u +%Y%m%dT%H%M%SZ)
base="profile-studio:permissions-base-$stamp"
candidate="profile-studio:permissions-fixed-$stamp"
docker image tag profile-studio:local "$base"
scratch=$(mktemp -d /tmp/profile-studio-permissions.XXXXXX)
cleanup() {
  rm -f -- "$scratch/Dockerfile" "$scratch/image-runtime-check.mjs"
  rmdir -- "$scratch"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
cp deploy/Dockerfile.runtime-permissions "$scratch/Dockerfile"
cp deploy/image-runtime-check.mjs "$scratch/image-runtime-check.mjs"
docker build --network=none --pull=false --build-arg "BASE_IMAGE=$base" -t "$candidate" "$scratch"
candidate_image=$(docker image inspect --format '{{.Id}}' "$candidate")
docker image tag "$candidate_image" profile-studio:local
cleanup
trap - EXIT HUP INT TERM
flock -u 9
exec 9>&-
# The regular updater takes a fresh backup, retains the running image, scans all
# candidate layers and rehearses recovery. Reuse skips compilation only.
sh deploy/update-studio-v2.sh --use-built-image "$candidate_image"
