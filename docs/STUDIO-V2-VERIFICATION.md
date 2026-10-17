# Studio v2 verification record

Local verification on 2026-10-17:

- The complete application suite passed: 154 tests in 32 Vitest files, plus 10 Node backup/package tests, including readability, layer selection/locking and moderation/admin access restrictions.
- TypeScript validation passed for the server and the pinned Vencord checkout. Server, browser-preview and standalone Vencord builds passed. The pinned commit remains `32c90633ce6a95d7e56c95479efbb431bacf1eac`.
- The legacy-data migration test preserves the publication, manual fallback, draft and approved-preset references when applying migration 006 to an already populated database.
- The encrypted database snapshot test restores the new preset/library/share/provenance tables, reapplies a newer source-account erasure, revokes descendant uploads and invalidates every session.
- Service tests cover ownership, version conflicts, immutable decisions, preset/collection limits, supporter loss, nested tint validation, copying consent, idempotent import, daily copying limits, media retention, erasure, automation leases and exact one-use owner publication confirmation.
- UI tests cover idle local recovery, Undo/Redo, separate save/submit steps, dialog dismissal, view-specific panels, static artwork and animation sessions that do not restart on rerender.
- A browser trial of the real editor with simulated integration data confirmed that the preview remains visible while the form scrolls. The appearance picker uses a separate preview, compact thumbnails and an opaque blurred-backdrop modal. The strict UI audit reports no findings.
- Source/release and Windows-package secret scans exclude operator secrets, data, backups, diagnostics and the independent OAuth website checkout. The Windows package verifier checks integrity and rejects a modified renderer.
- PNG export regression: the card is served from memory at a short address inside an isolated Electron session instead of a large navigation data URL. Two unit tests cover large payload delivery and request restrictions. `node scripts/test-png-export.mjs /absolute/path/to/electron.exe` passed with Electron 41.2.1 on Windows: a >3 MiB SVG produced a 900 × 900 PNG with verified embedded-image and styled-card pixels; cancellation, bounds, window cleanup and sanitized native load failures also passed. This isolated test uses synthetic content and does not reload Discord.
- Readability/layer regression: `preview/profile-readability.html` exercises the shared renderer and native-card DOM adapter with synthetic content. In-browser measurements showed the native-card scene growing from 638 to 1044 CSS px with the appended panels; the preview scene also matched its card height. Dark and light user palettes select white and black text respectively, and opaque Studio surfaces pass the numerical contrast tests. Selecting a locked second layer removes the drag handle; unlocking restores only `Move layer 2`. Ordinary-member API calls to moderation/admin return 403, the configured moderator can read the queue, and only the owner can read admin badge management. These checks do not claim a new live Discord two-account trial.

Still required before enabling this release for the community:

- The operator VM has not been upgraded. SSH access is working again after the Tailscale account check; privileged deployment still requires the operator's Linux password in their terminal. The updater must complete the actual container-image scan, consistent encrypted backup and isolated PostgreSQL migration/restore rehearsal before touching the live database.
- The updated native Discord build has not completed a live two-account acceptance run. Windows Computer Use was stopped with the physical Escape key. No further UI input or Discord reload was performed after that stop.
- PNG export from the actual Discord editor, real provider playback, Windows encrypted draft recovery after a Discord restart, offscreen rendering under sustained load and the friend-account workflow remain live acceptance checks. The isolated native export test and browser/unit-test evidence do not replace them.

Use [the deployment procedure](STUDIO-V2-DEPLOYMENT.md) and [the feature guide](STUDIO-WORKSPACE.md). Do not start an older application image against v2 data or remove current recovery-journal entries to make an old recovery tool accept them.
