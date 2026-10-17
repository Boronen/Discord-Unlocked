# ProfileStudio

Shared animated profiles, moderated uploads, profile sounds and music cards with artwork-based colors. Requires Windows Discord and a custom Vencord build. The application interface, bot messages, settings and validation are English.

Copy this folder to `src/userplugins/profileStudio` in the pinned Vencord source checkout, then rebuild Vencord. Standalone `.plugin.js` files are not supported. The full source package contains the backend and installation instructions. Set the plugin's API URL to your community's HTTPS service.

Use **Refresh Discord Shop catalog** as the configured owner to fetch Discord's available published categories, bundles and product variants. Avatar decorations and profile effects are included regardless of purchase ownership. Choose an item from the searchable gallery, save and submit it for approval. Only Profile Studio users see this shared appearance. This does not make a Discord purchase or change account entitlements. Retired, unpublished or regionally unavailable products cannot be guaranteed when Discord does not supply their assets. Unsupported non-image effect formats are outside the current renderer.

Refresh reads the current native Shop tabs and preserves already loaded items when a section fails. A **Partial refresh** notice identifies unavailable sections with their HTTP status; usable items are still selectable. Open the missing native Shop section and retry to load more. Diagnostics includes the most recent Shop refresh result.

Sessions are encrypted with Windows safeStorage/DPAPI and remembered per Discord account and API URL. Restarting restores the session. **Disconnect** removes and revokes it; 90 days of inactivity requires pairing again. Visible profiles refresh within 25 seconds. **Animations on this computer → Always animate** overrides reduced motion for plugin media.

Native avatars preserve the source aspect ratio with centered cover cropping inside Discord's existing avatar mask. Decorations retain Discord's native sizing.

**Favorite song** accepts Spotify, Apple Music and YouTube Music song links. **Play** opens an isolated service player and closes it when the profile closes or is muted. Full playback depends on the service's account and subscription requirements. Music Presence styling works independently of the favorite song.
