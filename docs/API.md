# API v1

All endpoints except health and short-lived pairing initiation/polling require `Authorization: Bearer <service-session>`. There is no anonymous profile, catalog or uploaded-media endpoint. Never put tokens in URLs. Responses use `Cache-Control: no-store`. `/health` returns only service health.

| Method and path                        | Authorization and purpose                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| POST `/v1/auth/pair`                   | `{userId}` starts a 5-minute account-bound pairing                                               |
| POST `/v1/auth/poll`                   | `{id,pollSecret}` consumes confirmed pairing once                                                |
| POST `/v1/auth/logout`                 | Valid session, also after guild departure                                                        |
| GET `/v1/auth/sessions`                | Own device IDs/labels/dates; never token hashes                                                  |
| DELETE `/v1/auth/sessions/:id`         | Revoke only the caller's selected device                                                         |
| DELETE `/v1/auth/sessions`             | Revoke all caller devices                                                                        |
| GET `/v1/privacy/export`               | Own portable metadata and authenticated media manifest; no guild requirement                     |
| GET `/v1/privacy/media/:id`            | Own normalized media for export; no guild requirement                                            |
| DELETE `/v1/privacy/account`           | `{confirmation:"DELETE MY ACCOUNT"}`; immediately hides account and revokes sessions             |
| GET `/v1/profiles?ids=…`               | Guild + beta role; at most 100 requested Discord IDs; approved display DTO only                  |
| GET `/v1/media/:id[/preview]`          | Guild + beta role; published media, or owner/moderator private preview                           |
| GET `/v1/catalog?after=…`              | Authenticated beta viewer; 250-item cursor pages                                                 |
| GET `/v1/me`                           | Own editor state, uploads and recent revisions                                                   |
| PUT `/v1/me/draft`                     | `{version,config}`; fresh beta membership, strict schema and owned/ready/slot-matching assets    |
| POST `/v1/me/submit`                   | `{version}`; one immutable pending snapshot                                                      |
| POST `/v1/me/publish-confirmation`     | Owner `{version}`; returns opaque id + 5-minute code                                             |
| POST `/v1/me/publish`                  | Owner `{version,confirmationId}`; exact draft must be confirmed by `/profile confirm` and unused |
| POST `/v1/me/media/:slot`              | Multipart single file ≤15 MiB; quota and concurrency checks                                      |
| GET `/v1/music/resolve?url=…`          | Supported provider links only, bounded metadata retrieval                                        |
| GET `/v1/moderation/:id`               | Fresh moderator membership; exact submitted revision and media                                   |
| POST `/v1/moderation/:id/decision`     | `{action:"approve"                                                                               | "reject",reason?}`; row-locked single decision |
| POST `/v1/moderation/:id/restore`      | Fresh moderator; previous approved, still-valid snapshot                                         |
| POST `/v1/moderation/users/:id/revoke` | Fresh moderator `{reason}`                                                                       |
| POST `/v1/moderation/media/:id/revoke` | Fresh moderator `{reason}`; also hides affected current publication                              |
| POST `/v1/admin/catalog[/batch]`       | Fresh beta owner; validated Discord CDN metadata, batch ≤100                                     |

Read membership caching lasts at most 30 seconds. Privileged and mutating routes request fresh Discord checks. The separate data-subject endpoints deliberately remain usable by a still-authenticated former member; they cannot read another account's data. A role/guild failure clears viewer caches while retaining the session for those privacy actions.

Limits: 50 enrolled accounts; 10 device sessions/account; 15 MiB input and output per file; 100 MiB and at most 200 retained files/account including reservations for processing; 10 uploads/rolling 24 hours; one processing upload/account; 10 globally pending jobs; one active decoder. IP limits apply to the direct connection unless it came from the exact configured proxy address. Additional account buckets limit API, metadata, upload and media requests. Deployment is intentionally one API/decoder replica; multi-replica scaling requires shared rate-limit state and redesigned scheduling.

The decoder database account can only execute `claim_media_job()` and `report_media_job(uuid,uuid,jsonb)`. Lease tokens are random, expire after two minutes and cannot publish a file. Only the API validates the result and promotes staging into final storage. Output/staging paths never appear in public DTOs.
