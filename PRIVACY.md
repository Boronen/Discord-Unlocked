# Discord Unlocked beta privacy notice

Last updated: **19 October 2026**.

**Controller/operator: Kovács Kevin · Hungary · boronengames.support@gmail.com.** The project is **Discord Unlocked**. **Boronen Games** is the planned company/brand name, not the current legal operator. The operator acts as a private individual. The beta is for invited adults (18+), admitted through invitations and beta-role assignment; age is not automatically verified. The operator has reviewed this notice and its operating commitments. The public API's configured flag identifies whether deployment-specific wording has been loaded; it is not a legal certification.

## Legal bases and interests

For pairing, membership checks, requested draft/profile/preset features and restricted community display, the basis is Article 6(1)(f): the operator's and participating members' interest in operating a voluntary, moderated profile-sharing community. Optional gallery sharing and permitted in-service copying serve the distinct interest of enabling member-requested style exchange while respecting the source owner's sharing choices. Those activities are also assessed under Article 6(1)(f); copying permissions are not treated as GDPR consent or permission for unrelated uses.

For access protection, moderation, bounded recovery and erasure/revocation fences, the basis is Article 6(1)(f): preventing misuse and keeping the community recoverable without restoring erased data. This does not justify collecting unrelated Discord activity or keeping records indefinitely.

For processing necessary to fulfil applicable access, correction, erasure and other rights obligations, the basis is Article 6(1)(c), with the relevant GDPR obligation identified for the request. This is not a blanket basis for all account operations.

Installation, saving or submission is not treated as a contract or a recorded GDPR consent. These bases are purpose-specific; changing the service or its purposes requires a fresh assessment and updated information. See [EDPB lawful-processing guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en).

**Right to object:** where legitimate interests are used, contact boronengames.support@gmail.com to object on grounds relating to your situation. The operator must assess the objection and stop the relevant processing unless an applicable overriding ground or legal-claims exception is established. Available access/export controls remain available; statutory portability depends on its legal conditions. See [GDPR Articles 20–21](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).

## Data and purpose

We store your Discord user ID, profile drafts, immutable submitted revisions, saved presets, private collections, media metadata/folders/tags, shared styles and copying permissions, media-copy provenance, automation rules/controller leases, Studio badge assignments, moderation decisions, normalized uploaded images/audio and technical file metadata. Local draft recovery is account/API/preset-bound and Windows-encrypted; local viewer preferences and undo history are not a server publication. We use Discord to verify guild/beta/moderator access. Your session secret is stored only as a hash on the server; Windows encrypted storage keeps a local copy. Session IDs, creation/last-use dates and device labels support sign-out controls. Pairing and owner-confirmation hashes are short-lived. No Discord user token or Discord password is requested.

Your approved profile and its uploaded media are visible to authenticated community beta members using the plugin. A viewer can save displayed content; this is not copy protection. Drafts and pending media are limited to you, authorized moderators and the operator. Moderation previews are also posted in the configured private Discord channel; Discord retains those messages under its own policies. The operator must restrict that channel and remove its preview messages when handling an erasure request.

API access logs use route templates, status and request IDs. Raw IP addresses, requested profile-ID lists, song links, tokens and upload bodies are not persisted in application access logs. IP addresses are used transiently for connection handling and rate limiting. External providers may maintain their own traffic/security logs under the policies linked below; the project's application-log limits do not bind those providers.

Favorite-song links and metadata are stored only as part of your chosen profile. The API requests supported providers for link metadata; playing opens a third-party player on explicit action. Artwork requests can also reach a supported provider/CDN when a profile is displayed. Providers may receive the viewer's IP address and apply their own cookie, account and privacy rules. No listening history, music audio stream or Discord messages are collected by Profile Studio.

## Access and retention

Favorite-game selection stores only its Steam store link and display title in the moderated profile. Displaying the game card requests public game metadata and screenshots directly from Steam and its allowlisted CDN hosts through the native client. Steam/CDN providers receive the game ID and the viewer's network address. No Steam login, credentials, library contents or play history are requested. Metadata is cached in memory for up to one hour with a 50-game bound; images share the existing 20 MiB artwork cache. Sign-out/access loss clears these client caches. Hover-opening delays are local preferences; pointer movements and hovering history are not sent to the Profile Studio server.

Operators can administer the database and backups; moderators inspect submissions and decide approval. Paired viewers receive only display data from approved revisions. The decoder sees opaque media jobs and has no access to profile, identity or session tables.

| Data                                       | Default maximum retention                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| Input upload                               | Removed after processing by the next cleanup cycle (normally within one minute) |
| Failed/revoked or solely rejected media    | 7 days                                                                          |
| Unused uploads and old revisions           | 30 days; expired pending submissions close after 30 days                        |
| Current approved profile                   | Until revocation or deletion                                                    |
| Sessions                                   | 90 days of inactivity, or earlier revocation; at most 10 remembered devices     |
| Pairing and owner-confirmation codes       | 5 minutes, one use                                                              |
| Moderation/security records                | 30 days                                                                         |
| Hashed erasure/revocation recovery markers | 31 days, to fence backups retained for 30 days                                  |
| Encrypted offsite backups                  | 30 days                                                                         |

Cleanup runs every minute while the service is healthy. Account deletion immediately removes viewer access, publication and sessions; active account data and files are removed within 24 hours. Cleanup failure must alert the operator and stop further beta expansion. Shared Discord preview messages require operator deletion as well. Backup copies age out rather than being silently restored into use: erasures/revocations are reapplied before restarting a restored server. A recovered account must pair again.

Saved presets, pending submissions and pending/approved shared styles retain their referenced media until no valid retained object needs it. Normal gallery withdrawal stops new imports but does not erase existing permitted copies. Source-account erasure or security revocation also invalidates copied assets through provenance.

## Your controls

Open **Account, devices and privacy** in the plugin editor to export metadata and normalized media, revoke individual/all devices or delete the account. These authenticated routes remain available after guild departure or removal of the beta role. After a session expires, contact the operator through the verified support process; the operator verifies the same Discord account, never asks for a Discord token and provides a secure export or carries out erasure. Do not post private exports in public issues.

Send applicable access, rectification, erasure, restriction, objection or portability requests to **boronengames.support@gmail.com**, or use the authenticated controls above. The operator has committed to monitoring this mailbox, proportionate account verification and responding without undue delay, normally within one month. Where an extension is permitted, the operator will explain it within that month. Do not send passwords, session tokens or backup keys. See the [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en). In an incident, the controller documents and assesses risk; where notification is required under GDPR, the supervisory-authority deadline is generally 72 hours after awareness, and high-risk cases can require informing affected individuals. See [EDPB guidance](https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en).

## Providers and location

The operator confirmed the actual host is in Hungary, only they have Windows/VM administrator access, and the deployment remains an isolated Linux VM on their Windows computer, exposed using Tailscale Funnel without personal file sharing or router port forwarding; encrypted offsite backups use private Google Drive. The operator confirmed personal, free Google Drive and Tailscale Personal accounts; no Google Workspace or business-plan agreement is assumed. Discord supplies identity/role checks and private bot moderation messages. Supported music services/CDNs and Steam may receive metadata/artwork requests as described above. The provider descriptions below distinguish local storage from international services. They do not promise exclusively Hungarian or EU processing or a fixed data centre. Oracle/DuckDNS/Caddy are documented alternatives, not the current hosting claim. No paid plan or hosting migration is automatically enabled. Free-service capacity and availability can constrain the beta.

Profile-card PNG/GIF export is local and initiated explicitly. The chosen draft preview or the user's own open Discord profile card is serialized, with allowlisted artwork loaded through the existing native bridge. Complete-profile export can include the native identity, badges, collections and visible music presence within that own card; export controls and surrounding content are excluded. GIF processing uses temporary in-memory frames and a renderer-bound session; cancelled sessions expire and no unfinished file is retained. Complete files are saved to the location chosen in the native dialog and are not uploaded to the Profile Studio server. Desktop pixels, surrounding Discord content and audio are not captured.

Optional current-music priority reads only music activity already visible in Discord (title, artist, cover, timing and supported provider link). The preference is saved and moderated; current activity and listening history are not stored in the database or sent to the Profile Studio API. Cover loading uses the existing allowlist and in-memory artwork cache.

## External provider terms and processing

The operator uses consumer Google Drive for encrypted backups and consumer Gmail for support correspondence. Google's [official help page](https://support.google.com/policies/answer/9581826?hl=en) states that it offers no data processing agreement and does not act as a processor for consumer Gmail/Drive. The operator retains these consumer services following their deployment-specific review. No Google Workspace processor agreement is claimed. Support correspondence is an additional data flow, separate from application database retention.

Tailscale's public privacy policy lists processing in Canada, Germany, the United States and the United Kingdom, with other jurisdictions possible. It describes contractual safeguards through its DPA. Its published DPA is incorporated into the applicable Tailscale agreement, and describes safeguards for the processing within its scope. These published locations do not identify the exact data centre used for an individual connection. [Tailscale location and transfer policy](https://tailscale.com/privacy-policy).

The actual supported music services are Spotify, Apple Music and YouTube/YouTube Music. Optional music metadata, artwork and explicitly opened players are covered by their applicable policies: [Spotify](https://www.spotify.com/legal/privacy-policy/), [Apple](https://www.apple.com/legal/privacy/), [Google/YouTube](https://policies.google.com/privacy?hl=en). Optional game metadata/artwork requests also involve [Valve/Steam](https://store.steampowered.com/privacy_agreement/). These services are not assumed to be solely the operator's processors or to use only EU servers.

## Project purpose and discontinuation

Discord Unlocked is a personal learning and community hobby project, intended for enjoyment and the operator's own development. It is not an official Discord product and is not endorsed by Discord.

If Discord makes a verified request to discontinue the project, the operator will immediately disable public access and stop accepting new users, uploads and submissions. The operator will promptly decommission the project service, revoke project credentials and remove project materials and source distributions under their control, subject to applicable legal obligations. This commitment concerns project resources, not unrelated files or services on the host computer.

Project personal data, uploaded media and controlled copies will be erased as part of the shutdown. Active-storage removal will follow the documented 24-hour deletion target. Encrypted backup copies will not be restored into service and will be removed under the documented maximum 30-day retention schedule, or sooner where feasible. Provider-side retention and copies independently downloaded or forked by others are outside the operator's direct deletion control; complete instantaneous removal of every copy cannot be promised.

The operator will keep the support contact available for outstanding data-subject requests. Any information that must lawfully be retained to handle an incident, an outstanding obligation or a legal claim will be limited, access-restricted, documented and kept only as long as justified. This is not an unrestricted exception to deletion, and closure does not cancel applicable request or incident obligations. See [EDPB rights guidance](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en) and [incident guidance](https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en).

The hobby purpose and willingness to discontinue do not establish Discord's permission, waive third-party rights or guarantee immunity from claims or platform enforcement. See [Discord's terms](https://discord.com/terms).

## Request-handling records

The operator keeps only the minimal record needed to handle a request: a private reference, receipt/response and closure dates, requested action, verification outcome and completion/refusal reason. Unnecessary request records and correspondence are removed 30 days after closure. Any individually justified legal retention is limited, documented and reviewed. Full exports, passwords and session tokens are not copied into this register. This is a manual operating commitment; the application does not automatically clean the support mailbox.

## Complaints

You may complain to Hungary's NAIH or another competent supervisory authority without first contacting the operator. Follow [NAIH's official submission instructions](https://www.naih.hu/online-ugyinditas); its general email is not a formal procedure-initiation channel. The support mailbox above remains available for requests and questions.
