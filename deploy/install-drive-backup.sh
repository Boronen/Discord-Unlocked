#!/bin/sh
# Host-side operator setup. Installs units, but deliberately does not enable timers.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run this installer with sudo.'; exit 1; }
[ "${1:-}" = --oauth-production-confirmed ] || { echo 'Confirm Google OAuth In production and reauthorize first; then pass --oauth-production-confirmed.'; exit 1; }
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
case "$app" in *[!a-zA-Z0-9_./-]*) echo 'Use a project path without spaces or shell metacharacters.'; exit 1;; esac
for binary in /usr/local/bin/node /usr/bin/docker /usr/bin/rclone /usr/bin/flock; do
  [ -x "$binary" ] || { echo 'Required operator tool is missing.'; exit 1; }
done
for name in postgres input staging final journal; do
  mountpoint -q "/srv/profile-studio/storage/$name" || { echo 'Required bounded storage is not mounted.'; exit 1; }
done
mkdir -p /etc/profile-studio-backup "$app/backups"
chmod 700 /etc/profile-studio-backup "$app/backups"
# Preserve existing operator configuration and refreshed OAuth tokens on reruns.
if [ ! -e /etc/profile-studio-backup/rclone.conf ]; then
  install -m 600 "$app/secrets/rclone.conf" /etc/profile-studio-backup/rclone.conf
fi
if [ ! -e /etc/profile-studio-backup/backup.key ]; then
  install -m 600 "$app/secrets/backup.key" /etc/profile-studio-backup/backup.key
fi
if [ ! -e /etc/profile-studio-backup/backup.env ]; then
  destination_id=$(/usr/local/bin/node --input-type=module -e 'import{randomUUID}from"node:crypto";console.log(randomUUID())')
  umask 077
  cat > /etc/profile-studio-backup/backup.env <<EOF
COMPOSE_FILE=$app/compose.yml:$app/deploy/production.yml
BACKUP_KEY_FILE=/etc/profile-studio-backup/backup.key
DRIVE_CONFIG_FILE=/etc/profile-studio-backup/rclone.conf
DRIVE_BACKUP_ROOT=psdrive:ProfileStudio-Automatic-Backups
OFFSITE_BACKUP_ID=$destination_id
DRIVE_BUDGET_BYTES=12884901888
DRIVE_OAUTH_PRODUCTION=true
EOF
fi
for unit in backup journal monitor; do
  sed "s|@APP@|$app|g" "$app/deploy/profile-studio-drive-$unit.service" > "/etc/systemd/system/profile-studio-drive-$unit.service"
  install -m 644 "$app/deploy/profile-studio-drive-$unit.timer" "/etc/systemd/system/profile-studio-drive-$unit.timer"
done
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/profile-studio-drive-backup.service /etc/systemd/system/profile-studio-drive-journal.service /etc/systemd/system/profile-studio-drive-monitor.service /etc/systemd/system/profile-studio-drive-backup.timer /etc/systemd/system/profile-studio-drive-journal.timer /etc/systemd/system/profile-studio-drive-monitor.timer
echo 'Drive backup units installed. Initialize destination and pass manual backup/journal/monitor checks before enabling timers.'
