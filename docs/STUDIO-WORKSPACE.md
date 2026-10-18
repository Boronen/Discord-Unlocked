# Using Studio v2

Pair with the community bot. The new workspace appears when your connected server advertises v2; older servers retain the previous editor. See [deployment](STUDIO-V2-DEPLOYMENT.md) before updating the server.

1. **Saved presets:** choose a named preset or Browse saved presets for thumbnails. New, Duplicate, rename and Delete affect private presets. Save preset stores a draft; Submit freezes a review snapshot; Activate approved preset reuses approval. The checkbox records whether approval also activates the preset.
2. **Recovery and undo:** edits are saved after 500 ms of inactivity in Windows encrypted storage, separately by account, API and preset. Restore local draft offers a choice when the server version changed. Undo/Redo retains 100 session steps. Local recovery never publishes anything.
3. **Positioning:** Layers provides dragging, a resize handle, arrow-key movement, numeric position, scale, rotation, opacity and Reset. Decorative artwork is clipped to the profile boundary.
4. **Animation roles:** choose Intro, Idle or Hover, with bounded delay and Intro duration. Replay animation starts a fresh preview opening. Ordinary edits do not restart it.
5. **Color generation:** choose banner or album artwork and Generate color suggestions. Subtle, Balanced and Vivid apply coordinated profile, tint and music colors. Ordinary accounts use the nearest basic tint; supporters may use the exact custom color.
6. **Comparison:** switch between Local draft, Published profile, Original Discord and Before / after. Comparison does not edit the preset.
7. **Collections:** Library contains private Favorites, the last 20 applied catalog items and named collections. Unavailable items remain removable. Normal accounts have five presets and five collections; supporters have twenty of each.
8. **Community styles:** choose a gallery entry and variant, decide whether to keep your avatar, panels and songs, then Try this style. Imports create independent drafts requiring your own approval. Gallery publication requires separate moderation and explicit permission to copy uploads.
9. **Favorite songs:** add up to three supported links in Music, edit labels, reorder or remove them. Play requires an explicit viewer action; only one provider player is active. Uploaded profile audio is used when no favorite songs exist.
10. **Music transitions:** successfully decoded artwork crossfades over 350 ms; card colors change over 300 ms. Failed and stale loads cannot replace a newer cover. Static display skips artwork motion.
11. **Performance:** viewers choose Auto, Quality or Low in plugin settings. The preview has a local selector too. Auto reduces depth and heavy decoration after sustained slow frames; hidden decorative scenes stop their frame clock.
12. **Matching bundles:** share multiple approved presets as variants of one style. Each participant imports their chosen variant independently. The creator cannot later change another participant's profile.
13. **Panel order:** Panels supports dragging and Up/Down buttons. Native Discord identity and action buttons remain in place.
14. **Small/full views:** edit a Shared base scene or a view override. Reset to shared scene clears the override. Small profiles show three visible Studio panels; full profiles show eight.
15. **Layers:** scenes support up to three uploaded, catalog, built-in effect or texture layers with independent order, transform, tint, opacity and animation role. Select the named row before dragging; only that layer has an interactive preview frame. Lock removes its drag/resize handle without hiding the artwork. Locks are local to the open editor and are not published. Numeric controls remain available for precise changes. Album artwork is separate.
16. **Depth:** Follow pointer movement is limited to 8 px and 3 degrees. It affects decoration only and is disabled in static or Low mode.
17. **Hover:** Hover layers respond to pointer presence and keyboard focus. They do not intercept native clicks, start audio or change a public profile.
18. **Automation:** arrange approved-preset rules by priority. The first match must remain stable for 20 seconds. Enabling rules claims this device; a manual activation pauses automation. A lost controller expires after 90 seconds and falls back to the manual preset. Only preset IDs leave the client.
19. **Textures:** grain, VHS, rain, snow, stars and paper are built-in renderers; opacity controls intensity. Executable uploads are not accepted.
20. **Panels:** text, interests, games, setup, quote, links and music panels are available. Text is plain text, limited to 1,000 characters per panel. Links require HTTPS and do not embed external pages.
21. **Studio badges:** the owner defines and awards built-in-icon badges in Admin. These community labels grant no permissions and do not represent Discord verification. Three show directly; the remainder expand. Users can hide their badges.
22. **Catalog filters:** pickers support name, source, collection, color, theme and mood. Unclassified items remain available without filters. The owner manages labels and thumbnail-color analysis in Admin.
23. **Media library:** rename, tag and organize uploads into virtual folders. Size, processing state and using presets are shown. Review affected presets before removal; security deletion also revokes associated copied uploads.
24. **Transparency:** Inspect transparency offers checkerboard, light, dark and profile-color backgrounds, zoom, static/animated comparison and a local black-background-removal preview. Inspection never rewrites a file.
25. **PNG:** Export PNG writes only the displayed owned card to a local file. Its native renderer blocks network, scripts, downloads and permissions. Audio is excluded. Tall cards are fitted to retain the complete card; see the GIF/PNG export section below.
26. **Viewer preferences:** Profile display on this device hides another profile's background, effects, decoration, tint or depth locally. Preferences belong to the viewing account and do not edit the owner.
27. **Moderation:** Review compares the submitted snapshot with the publication captured at submission. Inspect small/full view and individual animation phases, then decide on that exact revision. Shared styles have separate approval.

Every account retains the same 100 MiB media allowance and daily ten-file budget, including copies. Role loss preserves existing presets and collections but prevents new objects above the normal allowance. Unchanged approved custom tints may remain. Ordinary gallery withdrawal stops new imports; security removal and source-account erasure also revoke linked uploads.

Owner test publication requires a fresh one-use bot confirmation for the exact saved preset. Local test tools never modify another account's server profile.

## Favorite Steam game

Open **Panels**, select **Games**, and choose **Add panel**. Paste the game's Steam store URL or App ID, then choose **Select Steam game**. Save the preset and submit it for review as usual. The profile card cycles through up to eight store screenshots every four seconds. Hovering, focusing or Pause stops the slideshow; Previous/Next work in static mode too. No Steam account or API key is required. Older clients display the saved game link.

## Hover profile opening

Plugin settings include **Open the small profile card after hovering over an avatar, name or member row** and **Hover profile delay (seconds)**. Opening is enabled with a four-second delay by default, adjustable from three to five seconds. Hover an avatar, chat author, member row or DM row. Leaving, clicking, scrolling or Escape cancels the pending opening. It opens the native small Discord profile card beside the target; an already open profile or editor does not trigger another opening. The preference stays on your device.

## Export a card as PNG or GIF

In the editor, below Save and review, choose **Card export → PNG · still image** or **GIF · animation**, then **Export PNG/GIF**. Choose a file location in the Windows save dialog. Exporting never saves, submits or publishes your draft.

For the complete Discord card, open **your own Discord profile → Export my complete profile**. This source includes the native username, badges, collections, current music presence and profile actions together with Studio blocks and effects. It is available only on your own profile. The editor's **Card export** continues to export its draft preview; it does not pretend to include native elements that the preview does not render. Export controls and local display controls are omitted from the image.

PNG saves a high-resolution still. GIF samples four seconds of the chosen card at eight frames per second, up to 450px wide, and loops without sound. Animated image artwork and CSS effect states are captured; video nameplates use their static poster. Motion preferences still apply: Static mode produces static artwork. Use Replay first if you want to capture an Intro phase. Source images with more than 500 animation frames are supported: export samples the recording interval lazily instead of rejecting the full source frame count. Existing byte, image-size and decoding budgets still apply.

Keep Discord and the chosen card open during GIF export. All 32 samples are encoded even when processing takes longer than four seconds; the resulting file still plays for four seconds. CSS animations and animated image sources are sampled at those timestamps. The native export session expires after six minutes. Cancel export, hiding Discord or closing the editor discards unfinished work. Tall cards are fitted automatically so every panel is retained; the previous 2,000px cutoff is removed. Artwork is resized and compressed specifically for GIF instead of repeating full-resolution PNG data in each sample. Encoding is incremental with bounded memory. No desktop pixels, other Discord messages or audio are recorded. GIF uses a limited color palette and one-bit transparency; PNG retains better still-image quality.

## Current music priority

With an album-artwork background enabled, the resolved cover also supplies the profile palette, including Studio panel/badge surfaces and Discord's nested theme/button colors. Current-music priority additionally controls whether the live track replaces favorites. If artwork is unavailable, saved colors remain the fallback. Disabling artwork colors restores the saved appearance; uploaded artwork and explicitly chosen effect/decorative tints are not recolored automatically.

In **Music → Music priority**, select **Current Discord music first**, then save and submit the preset. After approval, the current Discord music activity replaces favorites in Studio music blocks and its cover supplies the profile colors/artwork. When activity stops, saved favorites return. The album-background controls retain opacity/blur control; missing artwork preserves configured colors. Native Discord music is hidden while the Studio block shows the same current track and restored when it no longer replaces it. No music stream or listening history is stored, and audio never starts from this setting or hover.

The preference is disabled until the API advertises `musicPriority`. Upgrade the server before distributing the matching Windows client. Existing profiles without the field retain their previous behavior until an explicit priority choice is saved.


### Music colors on decorative layers

When **Album artwork background** or **Music priority → Current Discord music first** is enabled, the cover supplies up to three distinct colors for Studio effect layers, cycling through them in layer order. The avatar decoration uses the second color when available. The shared alpha-preserving tint keeps transparent areas transparent; uploaded avatars, banner pixels and text are not recolored. The surface behind a transparent banner follows the profile palette. A one-color cover uses that color throughout. Missing or unreadable covers fall back to saved colors and tints; favorites remain the artwork fallback when playback stops. Turning off both artwork background and music priority restores saved layer/decorative tints. These display colors are computed locally and never overwrite the submitted profile or grant custom-HEX editing rights. Viewer tint overrides still apply.
