#!/bin/bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run with sudo bash.'; exit 1; }
app=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
cd "$app"
test -f /etc/profile-studio-backup/backup.env
for job in backup journal monitor; do
  test -f "/etc/systemd/system/profile-studio-drive-$job.service"
done
umask 077
printf 'Paste the private Discord webhook URL (hidden), then press Enter: ' > /dev/tty
IFS= read -r -s webhook < /dev/tty
printf '\n' > /dev/tty
printf '%s' "$webhook" > /etc/profile-studio-backup/discord-webhook
unset webhook
chmod 600 /etc/profile-studio-backup/discord-webhook
/usr/local/bin/node scripts/operator-alert.mjs test
for job in backup journal monitor; do
  directory="/etc/systemd/system/profile-studio-drive-$job.service.d"
  mkdir -p "$directory"
  printf '[Service]\nExecStart=\nExecStart=/usr/local/bin/node scripts/operator-alert.mjs run %s\n' "$job" > "$directory/discord-alerts.conf"
done
systemctl daemon-reload
systemctl start profile-studio-drive-monitor.service
echo 'Discord failure and recovery notifications configured. Timers retain their existing schedules.'
