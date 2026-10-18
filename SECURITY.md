# Security policy

## Reporting

**Operator security/privacy contact: Kovács Kevin — alisioboronen@gmail.com (Hungary).** Project: Boronen games. These public details were supplied by the operator. Send sensitive reports privately to this address. GitHub private vulnerability reporting must also be enabled and verified before public release; its availability is not implied by this document. The remaining deployment and privacy acceptance gates still apply.

Use the repository's **Security → Report a vulnerability** option after publication, or the operator's listed private contact. Do not open a public issue with tokens, private uploads, Discord identifiers, network addresses or full diagnostics. Include the affected version, impact and a minimal reproduction with synthetic data. Do not retrieve other users' data or run availability tests against a shared deployment without permission.

Only the current beta candidate and its pinned Vencord version are maintained. This is not a security certification or a promise of continuous availability.

## Boundaries

- Paired viewers need the configured guild and beta role; positive read checks last at most 30 seconds. Writes and privileged decisions use fresh checks. Discord failures grant no new access. Data-subject routes intentionally require a valid session but not ongoing guild membership.
- Pairing/confirmation codes last five minutes and are single-use. Owner publication is bound to an exact saved draft. Server sessions store only SHA-256 token hashes. Windows safeStorage protects remembered client tokens; no plaintext fallback is used. Other locally installed plugins and the host administrator are outside this trust boundary.
- API/bot/migration/decoder have separate database logins. Runtime accounts cannot create roles or databases. The decoder can execute only job claim/report functions, sees no account or session table and has no bot token. Its network namespace allows only the database job connection, with no internet, LAN, host-gateway or metadata route.
- Input, staging and final volumes are separate. Only the API promotes bounded, validated staging output. The decoder does not mount final media. Revocation races cannot publish revoked assets. File removal is a durable queue after database commit.
- Media is never executable HTML, JavaScript or arbitrary CSS. Image/frame/audio and input/output size limits apply server-side. Normalized output is immutable by UUID; quarantine input is queued for removal after processing. Container resource bounds and production bounded filesystems limit damage from decoder failures and storage abuse.
- All uploaded media requires Authorization and becomes a local viewer blob. Tokens never travel in URLs. API logs contain only request IDs, route templates and status/error codes, with raw request logging disabled. Caddy request/error logging is discarded to avoid recording private query data.
- Provider players have no Node access, use a separate temporary partition, reject permissions/downloads/new windows and check navigation and redirects. A third-party player opens only on explicit Play.
- Backups use AES-256-GCM with an independent random key and unique nonces. They remain sensitive encrypted personal data. A current, separately retained erasure/revocation journal must fence any restored snapshot; all restored sessions and confirmations are invalidated.

## Publication and operator duties

Reset the previously disclosed Discord token. Enable MFA/passkeys for GitHub, Discord and cloud accounts. Restrict secrets to the operator account; Compose secret/env files do not encrypt the host filesystem. Protect the VM and backups with encrypted disks where available. Never expose PostgreSQL, Docker or management SSH on a public interface.

Before publication enable GitHub push protection, secret scanning where available, Dependabot alerts, branch protection/rulesets and private reporting. Require CI and human approval for releases. Actions are pinned by commit, run without deployment secrets and have only `contents: read`. Review dependency and image updates before rebuilding. Use a GitHub noreply author address if you do not want a personal email in public commits.

Image scanning inspects each file in every saved layer, including gzip layers, and fails on unsupported Zstandard layers. Six public GnuTLS self-test key fingerprints were verified against the official [3.7.9 self-test source](https://gitlab.com/gnutls/gnutls/-/blob/3.7.9/lib/crypto-selftests-pk.c); only those exact vectors inside the GnuTLS shared library are exempt from the private-key rule. Application files, other keys and local secret-value matching remain checked.

For an exposed secret: disable public access, revoke the credential first, invalidate sessions if affected, preserve minimal evidence privately, rotate affected keys, investigate scope, patch and scan all history/artifacts/images. Removing a commit or ZIP alone does not revoke credentials. Follow [the incident runbook](https://github.com/Boronen/Discord-Unlocked/blob/main/docs/OPERATIONS.md#incidents).

References: [OWASP Docker guidance](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html), [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection). Store catalog and media rights remain the uploader/operator's responsibility; the distribution contains neither paid shop assets nor downloaded third-party music.
