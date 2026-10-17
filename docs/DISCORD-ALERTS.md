# Private operator notifications

Create a private Discord text channel restricted to trusted operators. Under channel settings, Integrations, Webhooks, create a webhook and copy its URL. Treat this URL as a password. Never paste it into chat, source control, or diagnostic reports.

From an interactive SSH terminal in the project directory, run:

```sh
sudo bash deploy/configure-discord-alerts.sh
```

Paste the URL at the hidden prompt and press Enter. The installer sends an explicitly authorized delivery test, stores the credential only in `/etc/profile-studio-backup/discord-webhook` with mode 600, and adds service overrides for the existing backup, journal and monitor jobs. Confirm the English test message appeared in the intended channel. No user IDs, media, request URLs or provider errors are sent.

Each job sends its first failure, hourly reminders while failing, and a recovery after a successful check. State is recorded only after Discord accepts the message; failed delivery is retried by the next scheduled run. A notification failure marks the operator job failed. Existing timer schedules are preserved. Configuration can be rerun to replace a revoked webhook. Do not mark operator monitoring verified until delivery and failure/recovery tests pass.

These notifications run on the host they monitor: a powered-off VM, internet outage, Discord outage, or a systemd-level kill can prevent delivery. They are not independent uptime monitoring. Check the timers and service results periodically; add an external dead-man monitor before claiming outage coverage.

The recovery key still needs a separate, secure copy outside the host and outside the Drive backup destination.
