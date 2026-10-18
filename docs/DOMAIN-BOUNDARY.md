# Shared domain boundary (Stage 1A)

Canonical browser-safe contracts live in `packages/shared/domain/`: `model.ts` (v1/defaults/media), `studio-model.ts` (v2/scenes/presets/sharing), `tint.ts` (palette and pure tint helpers), `music-links.ts` (provider/artwork validation) and `export-zip.ts` (bounded account ZIP serialization).

All five implementations were moved byte-for-byte from the pre-refactor baseline. DTOs, defaults, stored profile behavior, limits and permission rules remain unchanged. Plugin files at the old paths re-export the canonical modules. Server, bot and schema modules import the shared domain directly.

## Self-contained participant builds

Vencord expects a self-contained `src/userplugins/profileStudio/` directory. Repository compatibility exports refer to `../shared/domain/`; that path would escape a participant's plugin folder.

`scripts/plugin-source.mjs` is the shared source assembler for plugin synchronization, participant/source release ZIPs and Windows corresponding source. It copies canonical modules into the generated plugin's `domain/` directory and rewrites only compatibility export paths to `./domain/`. It rejects links, unexpected source extensions and missing compatibility exports. Generated copies are not independently maintained implementations.

Use `npm run plugin:sync` or a generated participant package; do not copy `packages/plugin/` alone. The normal repository source archive includes both source trees and build scripts. Windows packaging compares assembled source with the pinned build checkout and preserves corresponding source/licence notices.

## Checks and scope

- `npm run typecheck` checks application types; `npm run plugin:check` checks the assembled pinned Vencord plugin.
- `npm run lint` enforces narrow static import/export boundaries (including type-only imports), duplicate imports and basic unreachable/debugger checks. It is not a full React audit.
- `npm run format:domain` checks the new domain/compatibility/assembly surface without mass-formatting unrelated files.
- `npm test` retains authorization, moderation, quotas, old configs, recovery, media and package regression coverage. New negative fixtures verify real lint rejection; assembled modules compile without repository fallback paths, and old/canonical exports retain identical runtime bindings.

Domain modules may import only sibling pure modules, never Node, React, Discord or parent schema/service implementations. Oxlint is pinned and development-only: the available TypeScript-ESLint parser did not support the existing TypeScript 7 compiler, so an independent parser avoids a compiler downgrade. Broader TypeScript/React cleanup remains later work.

Third-party GIF source/licence formatting is explicitly excluded. Two unrelated prior test-formatting deviations remain in the global baseline; CI enforces the scoped new format/lint gates.

Stage 1A creates local source/build candidates. It adds no API, migration or visual redesign, and does not deploy the VM, install/restart Discord or assign roles. Real-client acceptance remains necessary before deployment. Stage 1B needs its own approval checkpoint.
