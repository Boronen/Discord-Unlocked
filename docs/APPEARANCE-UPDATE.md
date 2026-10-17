# Appearance, album artwork and supporter colors

Profile Studio remains a privately distributed custom Vencord userplugin. Its self-hosted API, bot integration and DOM adapters do not meet upstream Vencord contribution rules. This update does not change those integration boundaries or the pinned Vencord commit.

## Supporter access

Set `SUPPORTER_ROLE_ID=YOUR_ROLE_ID` locally in **both** `secrets/api.env` and `secrets/bot.env`, then recreate the API and bot containers. Do not paste either file into chat or commit it. No payment integration is included. With no role configured, the owner alone gets custom HEX colors; every member can choose the 28 basic colors.

The role is checked on the server for saves, submissions and approval. The editor reports `canUseCustomTint`; it does not expose role membership lists. Previously published custom colors can be retained after role loss, including strength changes. A new custom color or copying one to another layer requires supporter access. Older clients can view new profiles but do not offer the new controls.

## Profile settings

`albumBackground` is optional: `{ enabled, opacity, blur }`, with opacity in 0–1 and blur in 0–32 pixels. The new defaults are off, 0.25 and 12. The displayed profile owner's current music activity is preferred, then their configured favorite-song cover; failed covers return to the original profile background. Covers use an allowlisted native download, image decode checks and a 20 MiB in-memory cache. Track data and dynamic artwork are never persisted to the service.

`effectTint` and `decorationTint` are independent optional `{ color, intensity }` objects or null. Colors are six-digit HEX and strength is 0–1. Only the media layer is filtered; alpha, avatar, banner, text and music styling are preserved. Basic color definitions are shared by the editor and server in `packages/plugin/tint.ts`.

The appearance picker uses a bounded, opaque dialog, an 8px blurred backdrop, a separate results scroll area, a preview frame and measured page capacity up to 12 tiles. The editor uses a sticky preview with a compact pinned variant in narrow containers. Search, reset, pagination, Cancel and Use selection preserve draft/moderation semantics.

## Rollout

Run `sudo sh deploy/update-appearance-library.sh` on the VM after staging the updated sources. It creates an encrypted consistent backup, retains the previous application image, builds the update and restarts only API/bot/worker. It restores the old image if the API fails to become healthy. No database schema migration is needed. Existing sessions and published revisions are retained.

Then distribute the freshly built `dist/windows/ProfileStudio-Windows.zip`. Close Discord before running its installer. Node.js, Git, Docker and Tailscale are not needed by participants. Reinstalling an old ZIP will not install this update.

## Verification

Run the regular typecheck, service/UI tests, server and preview builds, the pinned plugin check/build, and the Windows package integrity test. Verify the native Discord modal's surface colors, scroll geometry, SVG alpha/tints and music activity rendering in a real Windows session before calling runtime acceptance complete. Browser fixtures are explicitly simulated, not evidence of live Discord integration.
