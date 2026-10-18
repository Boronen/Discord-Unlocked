# Profile Studio interaction contract

## Domain and authority

One global approved profile per Discord account in a community beta of at most 50 members. All ordinary changes create immutable pending snapshots. Owner quick-publish requires one exact, five-minute, bot-confirmed draft and is audited. Only a freshly server-verified beta moderator or configured owner can moderate. Membership and the beta role are checked on reads (at most 30 seconds cached) and freshly on writes. Pending uploads and profiles are private to their owner and moderators; approved uploads also require paired beta access.

## Canonical UI map

| Capability     | Canonical owner                 | Source of truth                  | Allowed variants                         | Verification                                    |
| -------------- | ------------------------------- | -------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Select/Listbox | Editor Choice                   | Native Windows select; DESIGN.md | Media slot, preset, music mode           | Editor UI tests and live popup check            |
| Form           | Editor and Field                | Shared schema and versioned API  | Save, submit, owner publish              | Service and API tests; editor interaction tests |
| Toast          | Editor Notice                   | UX-CONTRACT.md                   | Status, assertive error                  | Editor interaction tests                        |
| CRUD           | ProfileService and StudioClient | API.md and immutable revisions   | Draft, submit, decision, restore, revoke | PostgreSQL lifecycle and API/media tests        |

- Form: Editor + shared Field; shared server schema is authoritative validation.
- Studio v2 uses the same controls through StudioField, StudioAction and StudioChoice. Save, submit, activation, gallery approval and owner test publication remain separate operations. Native modal dialogs retain focus and restore their opener; Cancel preserves edits. Studio layers never capture native profile actions outside the editing preview.
- Profile effects paint above the banner, native music presence and Studio favorite-song blocks. Preview, live profiles and export share that stacking order. Artwork remains clipped to its own card and pointer-transparent, so profile actions, music links and viewer controls stay usable.
- Select/Listbox: Choice, native select, platform-owned popup geometry.
- Toast/status: Notice, inline polite status and assertive errors. No browser dialogs.
- Navigation: StudioTabs owns section and picker tabs, tab/panel associations, one selected tab stop and arrow/Home/End focus. Workspace tabs use manual activation to avoid accidental protected-panel requests; picker tabs preserve immediate activation. IME composition does not trigger shortcuts.
- Search: StudioSearch clears local queries immediately and restores input focus. Library paging counts filtered results, resets on query/folder changes and clamps after removal. Local search state stays inside the embedded editor, never Discord's route URL.
- Lists: StudioState distinguishes initial loading, empty data, no matches and retryable errors. Read-only sharing/review/admin queries retain successful data on refresh failure and ignore superseded/unmounted/access-lost results. Protected panels still mount only through StudioCommunity's existing permission gate.
- Validation: StudioField associates help and error text with its direct native/shared control; errors expose aria-invalid. Notice focuses committed save errors, preserving the draft and the existing explicit recovery action. Read refreshes never save, submit or publish a draft.
- CRUD: versioned draft save stays in editor; submit publishes only after moderation. Save conflicts preserve local work and offer explicit reload.
- Overlay: Discord's existing modal host owns confirmations; profile effects use a scoped non-interactive overlay.
- Readability: Studio blocks and their actions use an opaque, automatically contrasted content surface. Animated decorations cannot cover readable native content. Catalogue profile frames follow the full card bounds when panels are added; the native header banner remains a cover-fitted header.
- Layer editing: the named layer list owns selection; only the selected unlocked layer captures preview dragging. Local preview locks preserve visibility and numeric editing without modifying a published profile. Admin panels mount only for the owner; Review mounts only for the owner or server-verified moderator. Hidden or stale tab state cannot mount a protected panel; API checks remain authoritative.
- Custom effect compositing: “Hide black background” is shown only for an uploaded profile effect, uses the shared checkbox pattern, previews immediately, and is saved and moderated with the full revision. It never silently modifies an approved profile or catalogue effect.
- Scrollbar: `.ps-root` and owned descendants use the scoped standard scrollbar tokens in styles.css; the editor has natural document height.
- Search: catalogue search is local, with explicit clear action; remote API calls are not triggered per keystroke.

## States

Card export offers PNG and GIF through the canonical Choice. Preparing, recording, finishing, saved, cancelled and failed states stay inline; duplicate export is blocked. GIF captures at most 32 frames over four seconds at up to 450px wide, fitting the entire height automatically, with adaptive artwork compression, a two-megapixel frame budget and bounded incremental encoding. Cancel, editor teardown or hidden preview discards unfinished recordings. The native session is renderer-bound, expires after 90 seconds and cannot be replayed or finalized by another sender. PNG remains a high-resolution still. GIF respects static mode, samples animated image frames explicitly, freezes videos to their poster and contains no audio. Export never saves, submits or publishes a draft.

Favorite games use the existing moderated link/title fields. Selection is explicit; failed or superseded Steam lookups preserve other edits. The gallery reserves a thumbnail frame and keeps the previous decoded image while loading the next. Hidden/offscreen, hovered/focused and static galleries do not auto-advance; manual navigation remains available. Missing provider data shows an English fallback and Steam link.

Hover opening is local and opens the native Discord small profile popout once, anchored to the source element after a stable avatar/author/member-row hover. Timers cancel on exit, input, scroll, Escape, lost visibility/focus, account access loss and teardown. No provider player starts from hover. Viewers can disable opening or set a 3–5 second delay in plugin settings.

Editor distinguishes loading, disconnected, paired, saving, saved, pending, rejected and published. Server errors retain input. Duplicate mutations are disabled in flight. Draft saves use an optimistic version number; a stale client receives 409. Navigation away from dirty work is guarded with the browser lifecycle handler and Discord's confirmation modal where applicable.

## Sound and motion

One active profile audio instance or favorite-song player. No restart on rerender or cache refresh. Close, profile switch, mute and plugin stop cancel outstanding playback. Favorite links replace uploaded audio and open the provider player only on explicit Play. The isolated native window has no Node access, a separate cookie partition and a fixed HTTPS navigation allowlist. It closes on profile teardown/mute. Full playback remains provider-controlled. Viewer mute settings never become profile settings. Motion follows OS/Discord by default; explicit Always Animate or Static viewer choices override that default. Uploaded effects keep aspect ratio.

## Authentication

Profile/media loading waits for session restoration. A missing or denied beta role clears viewer profiles, media blobs and playback but keeps the authenticated privacy controls usable. Logout, account/API switch and plugin stop clear viewer state. The native media bridge sends Authorization and never shares a token in a URL. The account disclosure uses the existing Field/Action/Notice controls; exports open a native ZIP save dialog, sessions show last-use dates, and destructive account erasure requires typing its exact label. These data-subject controls remain visible if editor access is denied after guild departure.

Pairing code and poll secret are independent, expire in five minutes, and are single-use. Codes appear only in the paired editor and the user's ephemeral bot interaction. Session tokens are service-specific, hashed on the server and sent as Authorization headers. A local copy is encrypted with OS safeStorage, scoped by Discord account and API base. Restart restores and validates the session; successful authenticated use renews ninety days. Account/API switches drop the in-memory session. Explicit disconnect or Discord logout removes local credentials and revokes the server session. An outage preserves the encrypted session. No plaintext fallback and no Discord user token.

The existing Choice, Field, Action, Notice and checkbox controls own the animation preference, favorite-song link resolution and catalogue gallery. Favourite metadata loading is separate from save/submit; only a full approved revision becomes public. Gallery buttons are keyboard-operable with pressed state; paginated thumbnails use lazy image loading. Import uses owner-verified batches of 100 items. The client requests published Discord categories including bundles and variant groups, without filtering for purchases. The shared API pages through every enabled item in blocks of 250; there is no 1,000-item or 200-option cutoff. Search reports an empty result and offers the shared clear action. Unavailable Discord assets cannot be reconstructed or promised as available.

All owned UI copy, bot commands/replies, validation, status, help, accessible names and diagnostics are English with en-US formatting, regardless of the Discord interface language. Native Windows/Discord-owned dialogs keep their client language. Provider/user content is preserved verbatim. Previously stored system-generated media errors are mapped to English at the API boundary; moderation reasons are never translated or rewritten.

Shop refresh uses the current `CollectiblesShopHomesStore` and native Shop home action for catalog, avatar decorations, profile effects and bundles. It snapshots loaded assets before requests and merges each result, preserving usable entries if a failed Discord action clears a store. Per-tab errors produce an explicit partial-refresh notice with HTTP status, while available items are still imported. An unrelated error in the legacy category store never blocks a successful modern refresh. No usable items produces an actionable error; partial data is never described as a complete catalog.

## Moderation

Approval atomically changes the published revision. Duplicate decisions return conflict. Every publish, rejection, rollback and revocation is audited. Revoked media cannot be downloaded, even through an old URL. Public responses contain only active approved assets. Moderators must use the plugin to inspect native animated Discord effects; the bot includes a static preview and references.

## Appearance library and nameplates

MediaPicker owns the visual selection workflow for avatars, banners, decorations, profile effects and nameplates. Native HTML dialog owns its top layer, focus trap, inert background and Escape behavior; closing restores focus to Browse. It inherits the editor theme and scoped scrollbars. Below 560px the preview becomes a compact pinned band above the results. Search and source filtering are local, Clear is explicit, and measured pages can be changed without losing the candidate. A tile previews an item; Use selection changes only the local draft. Saving and moderation retain the existing immutable revision rules. Audio keeps the canonical native Choice.

Gallery cards use static thumbnails; the selected appearance animates only when the viewer allows motion. Uploaded previews use authenticated private-media loading and retry feedback. Nameplates use Discord-hosted WebM with a static PNG fallback. NameplateRows shares one DOM observer and one profile subscription per visible account for member and DM rows; recycled rows, revoked access and plugin stop remove custom layers. A separate viewer setting disables nameplates. Shop refresh includes the nameplates tab; unavailable or retired products remain unavailable.

## Album background, tint and preview geometry

The picker has a fixed header/footer, an opaque Discord-theme surface, an 8px blurred backdrop and separate results scrolling. Art is bounded to 96px, nameplates to 48px. Page capacity comes from the actual results area, not viewport assumptions. The original-appearance reset is outside the grid. PreviewFrame uniformly fits the card into the available space. PinnedPreview measures the visible scrollport intersection, including Discord's overflow-hidden wrappers, and compensates for scrolling within the editor layout bounds; narrow containers use a compact pinned version. New and legacy Discord theme variables map to the scoped --ps-* tokens with explicit light/dark fallbacks.

AlbumBackground is a separate decorative layer behind content and below profile effects. It prefers the displayed owner's current activity, then favorite-song artwork. It has independent 0–1 opacity and 0–32px blur; old profiles default to disabled. Only settings are saved or moderated. Artwork passes the native allowlist and decode limits; a 20MiB memory cache clears on account/access changes, and stale responses cannot replace a new track.

Effect and decoration tints are independent alpha-preserving SVG color matrices. They never filter the avatar, banner, text or music card. Each effect/decoration picker has Appearances and Tint tabs beside the persistent preview. TintControls owns 28 named preset swatches, strength, reset and supporter-only HEX/color inputs. Show original colors is local picker preview state for that layer. Use selection applies appearance and tint together; Cancel/Escape discards both. Arrow keys and Home/End switch tabs without losing keyboard focus. The server enforces new custom colors at save, submit and approval. An unchanged published custom color remains allowed after role loss. Supporter access comes from SUPPORTER_ROLE_ID, not moderator status or a client flag; the owner is allowed even when no role is configured.

Hover cards use the native popout wrapper, loading and actions. They do not open a full-profile modal or steal focus. Escape, native dismissal, a removed/recycled source, access loss and plugin teardown close the owned card; moving into the card preserves its controls. Music priority is saved/submitted like other profile changes and is capability-gated on older servers. Priority affects the Studio music block, cover source and profile colors. Favorite songs remain the fallback, live track/cover/timing data stays out of revisions, artwork races are ignored, and no audio starts automatically. Viewer background overrides still win.
