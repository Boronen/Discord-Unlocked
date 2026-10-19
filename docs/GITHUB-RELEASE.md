# GitHub publication checklist

This guide is for the owner of **Discord Unlocked**, at [Boronen/Discord-Unlocked](https://github.com/Boronen/Discord-Unlocked). **Boronen Games** is a planned company/brand; the current operator is the individual identified in the privacy notice. Existing Profile Studio package names and service paths remain compatible.

Preparing files or building documentation does not publish them. Repository security settings require separate owner action and verification. This checklist does not establish that any setting is enabled.

## 1. Prepare a reviewed publication snapshot

- Review the exact branch, commit history and release contents. Scan all commits intended for publication, source/userplugin ZIPs and every application-image layer using the existing security tooling. Inspect results privately; never paste secret values into an issue or workflow log.
- Include source, licences, approved documentation and intended release files. Exclude secrets, backups, user media, private diagnostics, local OAuth credentials and unrelated checkouts. A current `.gitignore` does not remove files from earlier commits.
- Generate fresh source and documentation artifacts after the final documentation edits. Record the source commit and SHA-256 values for the actual artifacts being distributed. Do not substitute a newly generated source archive into an older reviewed VM deployment without checking its correspondence to the candidate image.
- Complete the applicable [acceptance gates](ACCEPTANCE.md). The privacy review draft is not a configured operator notice. A passed restore or a working GIF export does not establish five-user capacity or all two-account permission checks.

Keep publication on hold until the owner reviews this snapshot and authorizes the first push. This document intentionally supplies no automatic push or release command.

## 2. Configure reporting and secret protection

Before the reviewed initial push, use repository **Settings → Security and quality → Advanced Security** to enable **Private vulnerability reporting**. Verify that **Security → Advisories** offers **Report a vulnerability**. Subscribe to security notifications and check the account's notification destination. A `SECURITY.md` file alone does not enable private reporting. See [GitHub's reporting setup](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).

Review the repository's security settings for **Dependabot alerts**, **secret scanning** and **push protection**, enabling available protections and verifying their resulting state. Public repositories have a permanently enabled dependency graph. Push protection detects supported secret patterns; it does not replace the project's local scans or artifact review. Do not test it with a real credential. See [GitHub security settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository).

Keep MFA/passkeys and credential management in the owner's account controls. Do not place a personal access token in source, workflow YAML, command examples or chat.

If GitHub cannot expose or verify a control while the repository is empty, record that limitation. Verify it immediately after the reviewed initial push, before a release or Pages publication; an unavailable control is not a passed check.

## 3. Establish the default branch and required checks

An empty repository has no observed CI check names. After the explicitly authorized initial push, inspect the **Verify** workflow on that exact commit. Its current job identifiers are `verify` and `documentation`; select the actual successful check contexts shown by GitHub when configuring requirements. Do not invent a status context that can never report.

Confirm that the pushed branch and GitHub's configured default branch are `main` before targeting it. Create an **Active** branch ruleset targeting `main`:

- Block deletion and force pushes.
- Require pull requests and the observed verification/documentation checks for subsequent changes.
- Require conversation resolution and keep bypass rights limited and documented.
- For a sole maintainer, use zero required approving reviews while retaining pull requests, CI and conversation resolution. Require external approval when another eligible reviewer is available. A sole maintainer cannot approve their own pull request; do not configure an unusable approval requirement and then routinely bypass it.

Verify the target branch, enforcement state, required checks and bypass list after saving. Branch rulesets for public repositories are available on GitHub Free. A **push ruleset** is a different feature from secret-scanning **push protection**; this checklist does not require a plan upgrade. See [GitHub branch rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

The verification CI uses pinned Actions and read-only repository permissions without deployment secrets. The separate owner-authorized Pages workflow grants only its deployment job `pages:write` and `id-token:write`; it publishes static documentation from `main`. Passing verification does not itself authorize an application deployment or release.

## 4. Review artifacts and publish separately

Before creating a release, verify the selected commit, matching Windows ZIP, manifest and published checksums. State supported Windows/Vencord versions, installation/update instructions, self-hosting requirements and known limitations. Do not describe unmeasured CPU/memory gains or untested capacity as established results.

Every update includes a reviewed version section in [Patch notes](PATCH-NOTES.md). Reuse that exact section in the GitHub release body. After the matching downloads are public and applicable deployment checks pass, use the [release announcement command](UPDATE-ANNOUNCEMENTS.md) to post the summary and download link through DcU in the community's announcements channel. Retain its delivery receipt to prevent repeat posts. Draft builds and bot restarts do not trigger announcements.

The documentation build is separate from the plugin/server. Build it with `DOCS_BASE=/Discord-Unlocked/` for the repository Pages path. A successful verification build does not publish Pages. Enable GitHub Actions as the Pages source, then use the separate `Publish documentation` workflow for authorized publication from `main`. Do not upload private screenshots or work-accounting reports.

Record the final commit, artifact hashes, check results, effective repository protections, outstanding limitations and owner release decision in private release evidence. Never mark an unmet gate as passed simply to populate a readiness file. If publication reveals a secret, follow the [incident procedure](OPERATIONS.md#incidents): revoke the credential before relying on history cleanup.
