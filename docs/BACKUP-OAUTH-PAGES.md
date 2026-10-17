# Backup OAuth documentation publication

The source documents are in `docs/backup-oauth-site/`. Review the contact and statements before publishing. This is documentation for the operator's Google connection, not a public launch of the community API or the complete service privacy notice.

## Publish with GitHub Pages

1. Sign in as `Boronen` and create a public repository named `profile-studio-backup-info`. This repository contains documentation only.
2. Upload **only** `_config.yml`, `index.md` and `privacy.md` from `docs/backup-oauth-site/` into that repository's root. Do not upload the parent project, configuration secrets, credentials, source ZIPs, backups or the recovery key.
3. Under Settings > Pages choose Deploy from a branch, `main` and `/ (root)`. Save and wait for the Pages deployment to finish. Enable Enforce HTTPS when available.
4. Check both URLs while signed out of GitHub:
   - Home: `https://boronen.github.io/profile-studio-backup-info/`
   - Policy: `https://boronen.github.io/profile-studio-backup-info/privacy.html`
5. In the backup Google Cloud project's Google Auth Platform > Branding, set app name `Profile Studio Backup`, select the support email and use those two URLs. If an authorized domain is requested, use `boronen.github.io` (no scheme or path). If Google requests ownership verification, complete the method it offers through Google Search Console; do not claim verification is complete merely because the site loads.
6. Save and return to Audience to request In production status. Publication and Google verification are separate decisions; Google may require additional information.
7. Once production status is effective, authorize rclone again through the private SSH authentication tunnel to replace the token issued during Testing. Keep the limited `drive.file` scope. Verify access to existing application-created backups.

The local documents have been prepared, but no GitHub repository or website is created by writing these files. The URLs above become valid only after the repository and Pages deployment exist. GitHub Free supports Pages from public repositories; do not activate a paid plan for this site.

Sources: [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Google brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [Google refresh-token expiration](https://developers.google.com/identity/protocols/oauth2/#expiration).
