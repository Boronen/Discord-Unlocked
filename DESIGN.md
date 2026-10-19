---
name: Profile Studio
register: product
locale: en-US
omitted:
  - section: colors
    reason: Discord runtime theme variables own the palette.
  - section: typography
    reason: Discord runtime font variables own type.
  - section: spacing
    reason: Runtime values are documented below.
  - section: rounded
    reason: Discord primitives own control geometry.
---

# Profile Studio design

## North star

The supplied compact Discord profile references: expressive banner and avatar above restrained profile details and a dedicated music surface. This is an embedded Discord tool, with no marketing shell or independent branding chrome.

## Runtime tokens

Discord is canonical: `--background-primary`, `--background-secondary`, `--background-tertiary`, `--text-normal`, `--text-muted`, `--brand-500`, `--font-primary`. Profile colors are approved user content, not global app theme changes. `packages/plugin/styles.css` maps these to scoped `--ps-*` tokens. Preview-only theme fallbacks live in `preview/preview.css`.

## Layout and type

Inherit Discord's font; 14px body, 12px help, 20px section heading. Left aligned editor with a 280px pinned live preview on wide screens; a compact pinned preview band below 560px container width. Spacing rhythm 8/12/16/24px. Profile radius 12px; controls use Discord primitives. Editor status and errors have reserved room. No decorative application gradients; user-selected gradients are an explicit profile/music effect.

Preset controls, feedback, section navigation and the active form occupy the left column; the preview begins alongside the preset controls. Shared `StudioTabs` uses quiet text tabs and an inset brand underline, with horizontal scrolling on narrow columns. Workspace tabs activate on click or Enter/Space; arrow keys move focus without starting panel requests. Picker tabs activate immediately. Compact preview controls use two equal grid columns with one gap calculation, leaving room for the profile itself.

`StudioSearch`, `StudioState` and `Notice` own search clearing, loading/empty/retry feedback and committed error focus. Use existing surface/text/stroke tokens, sentence case and native controls; no new icon/font dependency or application animation is introduced. The live profile, tint, layer order and exported card retain their existing design.

## Motion and layers

Only profile and music effects animate. All decorative layers ignore pointer input. Reduced motion uses static media thumbnails and pauses CSS motion. Background layer 0, native and Studio content 1, isolated decorative scene 2, local sound controls 3; never escape the owning card's stacking context. The profile effect paints over the banner, music presence and appended favorite-song panels in both preview and native profiles. Front/back layer ordering applies inside the decorative scene. Effect artwork never captures clicks or keyboard focus; editable handles are confined to the editing preview. Discord manages modal and tooltip layers.

`profile-readability.ts` owns `--ps-profile-text`, `--ps-profile-secondary` and `--ps-profile-surface` for preview and native cards. User colors determine text polarity and an opaque content surface; primary text has at least 7:1 and secondary text at least 4.5:1 against that surface. Studio panels, badges and viewer controls consume this pair rather than inheriting Discord's page text. Music cards retain their own background/text pair, with effects around a stable inset surface and underlined inherited-color links. Catalogue profile frames stretch their normalized 450×880 canvas to the current full card height, including appended blocks; uploaded standalone art keeps contain fitting.

Custom profile effects have an explicit black-background removal option. It uses screen compositing at the effect group's boundary in both preview and live profiles; it does not rewrite the uploaded file's alpha channel. Normal compositing remains the default for existing profiles and Discord catalogue effects.

Keep uploaded effect artwork proportional with contain fitting. Viewer animation preference is a shared Choice above the editor, with a short static/animated state explanation. Appearance selection uses a shared MediaPicker in a native modal dialog, with measured thumbnail columns, at most twelve items per page and a separate 280px live preview. Nameplates use a wide row preview. Candidate selection stays local until Use selection; Cancel and Escape preserve the draft. Favorite song reuses the music surface with title/artist, optional artwork, Play and provider link; detailed provider playback stays in an isolated small window. Uploaded sound controls stay inside the profile and reveal on hover/focus, without adding a footer strip outside the card.

## Canonical controls

CardExportControls sits below Save and review, keeping recording controls out of the pinned preview’s height budget. It owns the shared PNG/GIF format choice, export action, inline status/error, recording progress and cancellation. PNG is the default high-resolution still; GIF is a four-second looping card recording up to 450px wide, automatically fitted to retain all panels on tall cards with no sound. It samples the existing renderer without changing drafts or forcing motion on. Backgrounding, closing the editor or cancelling stops GIF work; a complete file is atomically saved through the native dialog. The isolated scriptless export surface renders card-only snapshots; no desktop or surrounding Discord content is captured. In narrow containers, preview view/compare choices share one row and secondary animation controls collapse to preserve room for the compact card.

Games panels reuse Field/Action: enter a Steam store link or App ID and explicitly Select Steam game. The approved panel stores a canonical HTTPS link and bounded title in its existing link field. SteamGameCard is shared by preview, live profiles and export. A 16:9 thumbnail frame reserves loading space, rotates at four-second intervals and pauses on pointer/focus, Pause, hidden/offscreen state or static mode. Manual arrows and a Steam link remain available. Only allowlisted, bounded Steam metadata/images pass through the native bridge; no Steam sign-in or arbitrary web embed is used.

HoverProfiles uses one delegated timer for avatars, chat authors and member/DM rows. It opens the native Discord small profile popout anchored to the hovered avatar/name/row once per continuous hover after a viewer-configurable 3–5 seconds (four by default). Exit, clicking, scrolling, Escape, backgrounding, recycled rows and plugin stop invalidate the timer. Existing dialogs and owned editor/profile surfaces do not trigger it. This local preference is independent of published profile settings.

All application-owned copy is English, including settings, bot commands and replies, validation, accessibility labels, diagnostics and preview controls. Use en-US formatting. User-entered names, moderation reasons and Discord product titles remain user/provider content. Native Discord and Windows dialogs follow their own client locale.

Native chat avatars use centered cover fitting inside Discord's existing square image area, preserving the native circle/status mask and decoration sizing. Non-square uploads are cropped instead of stretched.

Shared `Field`, `Action`, `Choice`, `Notice` in the plugin editor own labels, error feedback and disabled/busy behavior. Choice uses a native select intentionally: Windows owns its popup geometry and keyboard behavior. Action wraps the maintained Vencord Button. Color inputs use native color controls plus an explicit label. Form save preserves the editor and selection.

## Verification

StudioField, StudioAction and StudioChoice in studio-controls.tsx are the shared control owners for both editor versions. StudioWorkspace owns preset selection and private draft state. SceneRenderer and StudioBlocks resolve the same scene for previews, native profile attachment and card export. StudioDialog owns library/review modals; MediaPicker owns appearance/tint selection. Export captures only the card renderer, never the desktop.

Compare small/full profile, light/dark, narrow editor, keyboard and reduced motion. Runtime acceptance requires a real Discord session; the browser harness is clearly identified as simulated integration data.

## Appearance library and nameplates

MediaPicker owns the visual selection workflow for avatars, banners, decorations, profile effects and nameplates. Native HTML dialog owns its top layer, focus trap, inert background and Escape behavior; closing restores focus to Browse. It inherits the editor theme and scoped scrollbars. Below 560px the preview becomes a compact pinned band above the results. Search and source filtering are local, Clear is explicit, and measured pages can be changed without losing the candidate. A tile previews an item; Use selection changes only the local draft. Saving and moderation retain the existing immutable revision rules. Audio keeps the canonical native Choice.

Gallery cards use static thumbnails; the selected appearance animates only when the viewer allows motion. Uploaded previews use authenticated private-media loading and retry feedback. Nameplates use Discord-hosted WebM with a static PNG fallback. NameplateRows shares one DOM observer and one profile subscription per visible account for member and DM rows; recycled rows, revoked access and plugin stop remove custom layers. A separate viewer setting disables nameplates. Shop refresh includes the nameplates tab; unavailable or retired products remain unavailable.

## Album background, tint and preview geometry

The picker has a fixed header/footer, an opaque Discord-theme surface, an 8px blurred backdrop and separate results scrolling. Art is bounded to 96px, nameplates to 48px. Page capacity comes from the actual results area, not viewport assumptions. The original-appearance reset is outside the grid. PreviewFrame uniformly fits the card into the available space. PinnedPreview measures the visible scrollport intersection, including Discord's overflow-hidden wrappers, and compensates for scrolling within the editor layout bounds; narrow containers use a compact pinned version. New and legacy Discord theme variables map to the scoped --ps-* tokens with explicit light/dark fallbacks.

AlbumBackground is a separate decorative layer behind content and below profile effects. It prefers the displayed owner's current activity, then favorite-song artwork. It has independent 0–1 opacity and 0–32px blur; old profiles default to disabled. Only settings are saved or moderated. Artwork passes the native allowlist and decode limits; a 20MiB memory cache clears on account/access changes, and stale responses cannot replace a new track.

Effect and decoration tints are independent alpha-preserving SVG color matrices. They never filter the avatar, banner, text or music card. Each effect/decoration picker has Appearances and Tint tabs beside the persistent preview. TintControls owns 28 named preset swatches, strength, reset and supporter-only HEX/color inputs. Show original colors is local picker preview state for that layer. Use selection applies appearance and tint together; Cancel/Escape discards both. The server enforces new custom colors at save, submit and approval. An unchanged published custom color remains allowed after role loss. Supporter access comes from SUPPORTER_ROLE_ID, not moderator status or a client flag; the owner is allowed even when no role is configured.

BannerLayerEditor owns the shared small/full header stack: at most three uploaded banner images, explicit named selection, ordering and numeric transforms. It reuses Field/Action, MediaPicker and TintControls. BannerLayers composes only header artwork with the same alpha-preserving filter; it does not apply the profile-effect tint to the banner. Each banner/effect layer can opt out of music colors independently. Legacy banners default to opting out; new banner layers default to following available artwork colors. Manual tint remains the fallback. Native attachment preserves Discord's existing banner positioning and restores its host state on close/replacement. New editing waits for the server's bannerLayers capability.

Music priority is an owner-controlled, moderated profile preference. The canonical Music priority Choice selects favorites or current Discord music first. With current priority, StudioBlocks uses LiveMusicCard and the profile palette follows the selected cover. Missing activity returns to favorites; missing artwork keeps configured colors. Native music is hidden only while a visible Studio music block replaces it, with exact restoration on teardown. Live activity is transient and never written into a profile revision. New preference editing waits for the server’s musicPriority capability.
