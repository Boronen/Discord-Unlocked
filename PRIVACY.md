# Profile Studio beta privacy notice

**Operator: Boronen games · Hungary · alisioboronen@gmail.com.** These publication details were supplied by the operator. This document describes implemented defaults, not a completed deployment/legal assessment. The legal basis, provider processing locations/transfer arrangements and rights/complaints process still need completion before public release. The deployed public notice explicitly reports incomplete configuration until its operator fields are supplied and validated.

## Data and purpose

We store your Discord user ID, profile drafts, immutable submitted revisions, saved presets, private collections, media metadata/folders/tags, shared styles and copying permissions, media-copy provenance, automation rules/controller leases, Studio badge assignments, moderation decisions, normalized uploaded images/audio and technical file metadata. Local draft recovery is account/API/preset-bound and Windows-encrypted; local viewer preferences and undo history are not a server publication. We use Discord to verify guild/beta/moderator access. Your session secret is stored only as a hash on the server; Windows encrypted storage keeps a local copy. Session IDs, creation/last-use dates and device labels support sign-out controls. Pairing and owner-confirmation hashes are short-lived. No Discord user token or Discord password is requested.

Your approved profile and its uploaded media are visible to authenticated community beta members using the plugin. A viewer can save displayed content; this is not copy protection. Drafts and pending media are limited to you, authorized moderators and the operator. Moderation previews are also posted in the configured private Discord channel; Discord retains those messages under its own policies. The operator must restrict that channel and remove its preview messages when handling an erasure request.

API access logs use route templates, status and request IDs. Raw IP addresses, requested profile-ID lists, song links, tokens and upload bodies are not persisted in application access logs. IP addresses are used transiently for connection handling and rate limiting. Hosting/network providers may have their own traffic/security logs; list their actual policies here before launch.

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

Contact the controller for applicable access, rectification, erasure, restriction, objection or portability requests and information about the relevant supervisory authority. The controller must define and publish the actual legal basis and response process before launch. In an incident, the controller documents and assesses risk; where notification is required under GDPR, the supervisory-authority deadline is generally 72 hours after awareness, and high-risk cases can require informing affected individuals. See [EDPB guidance](https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en).

## Providers and location

The operator confirmed the intended deployment remains an isolated Linux VM on their Windows computer, exposed using Tailscale Funnel without personal file sharing or router port forwarding; encrypted offsite backups use private Google Drive. Discord supplies identity/role checks and private bot moderation messages. Supported music services/CDNs and Steam may receive metadata/artwork requests as described above. Actual provider processing/storage regions, contracts and international-transfer safeguards remain to be verified and entered in the deployment notice. Oracle/DuckDNS/Caddy are documented alternatives, not the current hosting claim. No paid plan or hosting migration is automatically enabled. Free-service capacity and availability can constrain the beta.

Profile-card PNG/GIF export is local and initiated explicitly. Only the owned preview card is serialized, with allowlisted artwork loaded through the existing native bridge. GIF processing uses temporary in-memory frames and a renderer-bound session; cancelled sessions expire and no unfinished file is retained. Complete files are saved to the location chosen in the native dialog and are not uploaded to the Profile Studio server. Desktop pixels, surrounding Discord content and audio are not captured.

Optional current-music priority reads only music activity already visible in Discord (title, artist, cover, timing and supported provider link). The preference is saved and moderated; current activity and listening history are not stored in the database or sent to the Profile Studio API. Cover loading uses the existing allowlist and in-memory artwork cache.
