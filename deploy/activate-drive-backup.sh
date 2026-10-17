#!/bin/sh
# One operator invocation: installation, real cloud checks, then timer activation.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run this activation with sudo.'; exit 1; }
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$app"
sh deploy/install-drive-backup.sh "${1:-}"
/usr/local/bin/node --env-file=/etc/profile-studio-backup/backup.env scripts/drive-backup.mjs init
systemctl start profile-studio-drive-backup.service
systemctl start profile-studio-drive-journal.service
systemctl start profile-studio-drive-monitor.service
# Authenticate and download the current independent journal as a recovery probe.
probe="$app/backups/drive-journal-probe-$(date -u +%Y%m%d-%H%M%S).psb"
/usr/local/bin/node --env-file=/etc/profile-studio-backup/backup.env scripts/drive-backup.mjs fetch-journal "$probe"
systemctl enable --now profile-studio-drive-backup.timer profile-studio-drive-journal.timer profile-studio-drive-monitor.timer
systemctl list-timers --all --no-pager --full 'profile-studio-drive-*'
echo 'Drive automation activated after successful snapshot, journal, monitor and recovery-journal checks.'
