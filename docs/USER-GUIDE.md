# Getting started and troubleshooting

## What you need

A Windows computer with Discord Stable, a trusted operator's Windows ZIP/checksum, and access to that operator's Discord community and beta role. Participants do **not** need Git, Node, Docker, a Steam login or a music API key. The [Windows installation guide](INSTALL-WINDOWS.md) covers the installer; the server is operated separately.

The community uses a custom Vencord build. It does not grant Discord Nitro or purchases, and other people need the same plugin plus pairing to see Studio appearances. Discord's client-modification policy still applies. Never disable antivirus or bypass a checksum failure to install it.

## Install and pair

1. Get `ProfileStudio-Windows.zip` and its checksum from your trusted operator. Extract the ZIP; close Discord completely, including the tray process. Run `Install.cmd` as your normal Windows account. This changes the Discord/Vencord installation, so follow the included installer prompts.
2. Restart Discord. Enable **ProfileStudio** in Vencord plugins. Set the API origin supplied by the operator; do not use your own `localhost` for someone else's server.
3. Open Profile Studio. Expand **Privacy notice · read before pairing**. Check who operates the service, its providers and data rules. If the notice is incomplete/unavailable, ask the operator before sharing data.
4. Choose **Pair with the bot**. Copy the displayed `/profile connect code:…` command and run it as the same Discord account in the configured server. Codes last five minutes and are single use. The editor remembers the service session through Windows encrypted storage.

If encrypted storage fails, the editor explains that reconnecting will be needed after restart. Changing accounts or API clears protected in-memory profiles/media/playback. Never give anyone a Discord password or user token.

## Make a profile

Choose a saved preset or create one, then use **Appearance**, **Customisation**, **Media** and the other workspace sections. The preview is a local draft; other members continue to see your last approved publication. [The complete walkthrough](STUDIO-WORKSPACE.md) explains all 27 feature groups plus Steam, hovering, GIF and music priority.

Upload through `/profile upload` and refresh processed files. Browse catalog items visually, select a row before moving its layer, and lock layers to avoid dragging the wrong one. Color controls are in the relevant appearance picker. The right preview stays alongside the form; a compact pinned preview is used on narrow windows.

**Save** sends the draft to the server. **Submit** captures an immutable revision for moderation. An approved preset can be activated again without another review; a changed preset needs a new approval. Local autosave and Undo/Redo do not publish or automatically save to the server. A version conflict preserves your draft and asks you to reconcile it.

Normal members can save five presets and five collections. Supporters can save twenty of each and use custom HEX tints; everyone has 100 MiB media storage and the same editor features. Supporter is [owner-awarded contribution recognition](CONTRIBUTING.md), not a purchase.

## Music, games and sharing

Save up to three favorites using supported Spotify, Apple Music or YouTube links. **Play** explicitly opens the isolated provider player. Provider accounts, regional restrictions and subscriptions can affect playback. The separate Music Presence application supplies Discord music activity; Studio styles/displays that activity and cannot make Music Presence report it.

**Current Discord music first** can prioritize activity in both the music block and artwork/colors after saving and approval. Favorites are the fallback. No hover or profile opening starts audio.

Games panels can display a Steam store screenshot slideshow. Hover/focus/pause stops it; static mode keeps manual controls. Gallery sharing is separate from profile approval. Uploaded assets may be copied only with explicit permission; imported styles become independent drafts and require their own review.

## Data, updates and removal

Expand **Account, devices and privacy** to export your data/media, sign out one/all devices or delete your account. These authenticated controls work after leaving the server. Expired sessions require the operator's verified support process. Locally saved exports are yours to manage; deletion cannot retract files another authorized viewer saved.

Obtain updates from the same trusted operator and check the checksum. Quit Discord fully and rerun the updated package's installer. Custom builds disable the upstream updater to preserve this userplugin; the operator must distribute reviewed security updates.

Use the included uninstaller to remove the Vencord patch from Discord Stable. It removes Vencord as a whole, not just Profile Studio; settings/local files can remain. Uninstalling does not delete the server account. Export/delete or sign out first if that is your intent. Do not erase your entire Discord application-data folder to remove this plugin.

## Troubleshooting

- **No Studio plugin:** confirm the custom build was actually installed, not merely extracted/built. Fully restart Discord Stable and enable ProfileStudio. Another updater may have replaced the custom build.
- **Cannot pair / code expired:** use the configured community and same account; check the beta role and ask the operator to check the bot. Start a fresh pairing code after five minutes.
- **Repeated sign-in:** check the encrypted-storage error. Different Windows users, Discord accounts or API origins have different sessions. Revoked/90-day inactive sessions need pairing again.
- **Profile not visible:** saving is not publication. Check review status and current beta access on both accounts. Losing a role clears viewer data; it does not delete your account.
- **Shop refresh failed:** ask the owner to retry the catalog import using the pinned client. Discord data/asset availability can change. Never extract a user token or bypass access checks to refresh it.
- **Music missing:** confirm an activity is actually visible in Discord/Music Presence. Favorites need a valid link and explicit Play; Studio does not download music streams. Check current-music priority and fallback settings.
- **Animation stopped:** inspect Windows/Discord reduced motion and Studio's animation/performance preference. Hidden profiles pause work; Low/static modes simplify decoration. Viewer overrides may hide effects locally.
- **Upload rejected:** check 15 MiB input/output, storage/daily quotas, one pending task and supported media. Decoder safety limits still apply to a small compressed file. Ask the operator about stuck processing; do not retry indefinitely.
- **GIF cancelled/slow:** keep Discord and the preview visible. Tall cards fit automatically, but GIF has limited colors/transparency. PNG is a better still. Cancel or close the editor to discard unfinished work.
- **Network/server unavailable:** confirm the operator's HTTPS origin and `/health`; preserve local edits and retry. Never publish tokens or private diagnostics in screenshots.

Report the action, expected/actual result, version and a redacted or synthetic image. Security issues follow [private reporting](SECURITY.md).
