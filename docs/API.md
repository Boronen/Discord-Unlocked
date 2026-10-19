# API conventions and DTOs

The [generated reference](API-REFERENCE.md) lists every explicit route, request, response and access policy. Requests use JSON unless multipart or binary is specified. Both versions share authentication, membership, quotas and moderation. `/v2` adds scene/preset/community workflows; it is not a separate security boundary.

## Authentication

Only health, the public privacy notice and short-lived pairing initiation/polling are anonymous. No profile, catalog or uploaded-media route is anonymous.

1. POST `{userId}` to `/v1/auth/pair` for `id`, `code`, `pollSecret` and `expiresIn:300`.
2. The same Discord account confirms `/profile connect code:…` in the configured community.
3. POST `{id,pollSecret}` to `/v1/auth/poll`. `ready:true` returns `token` and `userId` once.
4. Send `Authorization: Bearer <service-session>`. Never supply a Discord user token or put a service token in URLs, logs, screenshots or issues.

Tokens are hashed server-side and stored encrypted on Windows. Sessions expire after 90 days of inactivity; ten devices maximum. Reads use current guild/beta membership cached at most 30 seconds; mutations request fresh checks. Moderator/owner operations enforce their own privileges. Discord failure grants no access.

Own-session and own-data operations remain authenticated but usable after community departure. An expired session requires [verified support](OPERATIONS.md#verified-support-after-session-expiry). The notice contains only operator-approved public facts and generic data-handling text.

## v1 contracts

Canonical types: `packages/shared/domain/model.ts`. Strict schemas: `packages/shared/schema.ts`. Serialization/authorization: `packages/server/service.ts`.

- `ProfileConfig`: selected uploaded/catalog assets, profile/music colors and effects, favorite song, optional `albumBackground`, `effectTint`, `decorationTint` and compatible scene projection. Missing newer fields preserve legacy behavior.
- `MediaAsset`: opaque UUID, slot, processing state, safe technical metadata and authenticated URLs. Internal storage paths and worker leases are private.
- `ProfileRevision`: immutable ID, owner, status, config, dates and review reason. Decisions target that exact snapshot.
- `PublicProfile`: approved display config, revision ID, displayable assets and badges; no drafts or session records. Missing/unavailable profiles are `null`.
- `EditorState`: own draft/version, publication, recent revisions, uploads and privilege flags. v1 reads project v2 scenes; old clients cannot overwrite a v2 document.
- `FavoriteSong`: supported provider/link and bounded display metadata. Playback requires explicit action and opens an external provider player.
- `PrivacyNotice`: version `1`, `configured`, nullable update date/operator/legal basis, purpose, provider list, rights instructions and plain-text sections. `configured:false` is an incomplete deployment notice, not a complete privacy statement. Its type is in `packages/shared/domain/privacy-notice.ts`; deployment validation is in `packages/server/privacy-notice.ts`.

## v2 contracts

Canonical types: `packages/shared/domain/studio-model.ts`. Validation: `packages/shared/studio-schema.ts`. `StudioService` in `packages/server/studio.ts` additionally enforces ownership, quotas, asset references, immutable approvals and supporter access.

- `ProfileConfigV2` extends the base with `configVersion:2` and `studio`: small/full scenes, layers, blocks, songs and view options. A scene has at most three decorative layers; small/full show three/eight Studio blocks. Coordinates and opacity are normalized. No arbitrary CSS, HTML or executable uploads.
- `studio.bannerLayers` is an optional shared header stack, independent of the three scene effects. It accepts at most three entries with unique `id`, nullable uploaded-banner UUID `assetId`, normalized `transform` (`x/y` −1…1, `scale` 0.1…3, `rotation` −180…180, `opacity` 0…1), nullable `{color,intensity}` tint and boolean `followMusicColors`. Missing stacks preserve the legacy banner; an empty stack restores the original Discord banner. The first nonempty image is the `/v1` fallback. All images must be ready, owned banner uploads; references participate in retention, moderation, revocation and consented style copying. Manual custom tints use existing supporter validation and unchanged-approved-color grandfathering.
- Scene effects also accept optional `followMusicColors`; omission retains previous adaptive behavior, while `false` keeps manual/original colors. Music-derived display colors remain transient. The `bannerLayers` capability enables both new editing controls only after a compatible API is deployed. Old profiles need no data migration. Viewer background/tint overrides apply to the new header stack as well.
- `Preset`: `id`, `name`, optimistic `version`, `draft`, nullable `approvedRevisionId`/`approved`, `updatedAt`. Fetch the preset by ID for full editing. Workspace summaries may use legacy projection; never round-trip a summary as a full scene.
- `WorkspaceState`: presets, library/version, automation/version, manual/active revision IDs, capacity, tint entitlement, shares, badges, media metadata and usage references.
- `PersonalLibrary`: favorite/recent catalog IDs and named collections. `librarySchema` bounds arrays; the service enforces five/twenty collections.
- `MediaMetadata`: name, tags, virtual folder, checked by `metadataSchema`. `CatalogMetadata`: dominant color, theme/mood tags, checked by `catalogMetadataSchema` and owner authorization.
- `StyleShare`: owner, title, description, status, copying permission and independent approved variants. Import uses an idempotency UUID plus keep-own avatar/songs/panels choices. Media copies consume storage/file/daily quotas. Ordinary withdrawal stops future imports; security revocation and source erasure also invalidate copied assets through provenance.
- `AutomationRule[]`: ordered conditions and approved targets. The controller evaluates activity locally, waits 20 seconds of stability and sends preset IDs. The lease expires after 90 seconds; no activity history is uploaded.
- Badges use built-in icons and owner-only assignment; they grant no permission. Moderation detail includes the captured previous publication, display assets and field/layer differences.

The checked models, schemas, serializers and route handlers have reviewed fingerprints in `docs/api-contracts.json`. A change requires reconciling the documentation before updating its fingerprint. `node scripts/docs-api.mjs --write` regenerates prose only; it does not approve semantic changes. `npm run docs:check` rejects drift. This structural check supplements runtime tests; it is not formal OpenAPI or exhaustive behavioral validation.

## Concurrency and moderation

Send the last loaded nonnegative `version` when saving. On conflict, preserve local edits, reload and explicitly reconcile; do not silently retry with a newer version. There is one pending profile submission per account. Editing a draft never edits its submitted snapshot.

Owner publication requires **prepare → `/profile confirm` → publish the exact saved version**. Five-minute, one-use confirmation is bound to action/target/version; a draft change invalidates it. v1 moderation refuses v2 scene decisions so the reviewer must inspect the updated Review view. Hiding a tab is not authorization; the server enforces access.

## Errors

Application errors use `{code:string,message:string}`. Framework/proxy errors, including rate-limit responses, can have a different envelope; clients must tolerate them. Validation returns `400 VALIDATION`; unexpected errors return redacted `500 INTERNAL`. Messages are for display; branch on a documented code/status, not its wording.

- **401:** `UNAUTHORIZED`, `SESSION_EXPIRED`: pair again; never loop anonymous profile requests.
- **403:** `NOT_MEMBER`, `BETA_ROLE_REQUIRED`, `FORBIDDEN`, `OWNER_REQUIRED`: clear protected viewer data. Authenticated privacy controls may remain usable.
- **404/410:** missing, revoked, expired or disabled resource, including `FEATURE_UNAVAILABLE`. Do not revive cached revoked media.
- **409:** stale versions such as `DRAFT_CONFLICT`, pending submissions, required client update or controller conflicts. Preserve edits and reload deliberately.
- **413/429:** request/media size, rate, queue or quota rejection. Respect retry timing; decoded-media limits still apply.
- **5xx:** API/Discord dependency failure; no privilege is granted. Preserve local work and allow explicit retry.

Operation-specific codes are defined at the checked service invariant sites. These families do not imply every code applies to every endpoint. Handle unknown codes safely.

## Quotas and media

Single-API deployment: 50 enrolled accounts; 15 MiB input and processed output per file; 100 MiB/200 retained files per account; ten uploads per rolling 24 hours; one pending processing upload/account; ten pending jobs globally; one decoder. Copies consume these limits. Normal/supporter accounts have five/twenty presets and independently five/twenty collections. Existing objects survive role loss; new objects must fit the lower cap.

Global limit: 600 requests/minute per verified address. Account buckets include ordinary API 120/minute, media 600/minute, uploads ten/minute plus the daily allowance, music metadata 20/minute. Pair initiation has its own address-based ten/minute limit. Proxy headers are trusted only from the exact configured proxy IP. Simply increasing API replicas is unsupported; shared rate state and scheduling would need redesign.

Protected images are downloaded with Authorization then shown as local blobs. Never attach a token to an image URL. Binary responses set `nosniff` and restrictive CSP; responses use `no-store`. See [Resource lifecycle](RESOURCE-LIFECYCLE.md) for ownership, cancellation and cache limits.

## Examples

```sh
curl --fail --silent --show-error https://YOUR-DEPLOYMENT/health
curl --fail --silent --show-error https://YOUR-DEPLOYMENT/v1/privacy/notice
```

After pairing, from an in-memory client context (never log `session`):

```js
const response = await fetch(`${apiOrigin}/v2/me/workspace`, {
  headers: { Authorization: `Bearer ${session}` },
});
if (!response.ok) throw new Error("Workspace unavailable; preserve local edits.");
const workspace = await response.json();
```

Use a validated HTTPS origin and your own test account. Do not paste real sessions into terminal history, public API explorers or bug reports.
