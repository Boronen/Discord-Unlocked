# Feature preservation inventory

Status definitions: **implemented** means a code path exists with the named automated evidence; it does not certify live deployment or complete user acceptance. **Integration gate** means a real Windows Discord/server check remains necessary. **Planned** means no current implementation was found for the new refactor capability.

## Existing capabilities

Each item below is implemented in source and must survive the refactor. Test files live in `tests/`; the source references identify ownership rather than every dependency.

1. **Saved presets:** `studio-model`, server `studio`, `StudioWorkspace`; `studio-service.test.ts`, `studio-workspace.test.tsx`. Preserve per-preset drafts/approvals, immutable submission, activation and 5/20 capacity.
2. **Draft recovery and undo/redo:** `draft-history`, `native`, workspace; `studio-recovery.test.ts`, `studio-workspace.test.tsx`. Preserve account/API/preset scoping, encrypted Windows persistence and gestures/history.
3. **Layer transforms and selection/locks:** `scene-renderer`, `studio-editor-panels`; `studio-renderer.test.tsx`, `studio-workspace.test.tsx`. Preserve normalized transforms and selected unlocked handles. Real pointer capture remains an integration gate.
4. **Intro/Idle/Hover phases:** `scene-renderer`; `studio-renderer.test.tsx`. Preserve session identity, completed intro state and reduced-motion behavior.
5. **Generated image palettes:** `palette`, `color-proposals`, workspace; `studio-model.test.ts`, tint/supporter tests. Preserve normal-user nearest-basic-color behavior and supporter validation.
6. **Before/after:** workspace and `visuals`; `studio-renderer.test.tsx`, workspace tests. Preserve original cached Discord appearance and current approved/local draft distinction.
7. **Favorites, recent items and collections:** workspace/library endpoints; `studio-service.test.ts`, `studio-workspace.test.tsx`. Preserve private library, 20 recents and unavailable-item placeholders.
8. **Moderated style gallery:** `studio-community`, server `studio`; `studio-service.test.ts`. Preserve separate approval, consented media copying, provenance, quota and idempotency rules.
9. **Three favorite songs:** `studio-model`, `StudioBlocks`, music resolver; `studio-model.test.ts`, `music.test.ts`, favorite-player tests. Preserve explicit single-player start and legacy first-song compatibility.
10. **Artwork/color transitions:** `album-art`, `music-presentation`, styles; `album-art.test.tsx`, `music-priority.test.tsx`. Preserve stale-result rejection, decoded-image handoff and static-mode transition suppression.
11. **Auto/Quality/Low rendering:** scene motion/runtime/settings; `studio-renderer.test.tsx`, `runtime.test.tsx`. Preserve offscreen/hidden stopping and viewer-local preferences. Measured real Discord adaptation remains an integration gate.
12. **Matching multi-variant style bundles:** sharing/community and import API; `studio-service.test.ts`. Preserve independent copied drafts and keep-own identity/media choices.
13. **Reorderable Studio blocks:** block editor, schemas and renderer; `studio-model.test.ts`, `studio-workspace.test.tsx`. Preserve native Discord controls and keyboard move actions.
14. **Small/full scenes:** `resolveScene`, schemas, renderer; `studio-model.test.ts`, `studio-renderer.test.tsx`. Preserve shared base overrides and 3/8 Studio-block limits.
15. **Three decorative layers/view:** schemas, layer editor/renderer; model/service/renderer tests. Preserve order, tint, plane, bounds and album background outside this count.
16. **Decorative parallax:** scene renderer/styles; renderer/model tests. Preserve stable text/buttons and disabled static/Low paths. Pointer behavior is an integration gate.
17. **Hover/focus-only layers:** renderer; `studio-renderer.test.tsx`. Preserve click pass-through and absence of sound/remote state changes.
18. **Approved-preset automation:** `automation`, runtime and server lease endpoints; `studio-model.test.ts`, `studio-service.test.ts`. Preserve priority, stable-state delay, manual override, lease handoff and approved-only activation. Real multi-device disconnect is an integration gate.
19. **Built-in textures:** scene renderer/model/styles; model/renderer tests. Preserve grain, VHS, rain, snow, stars and paper without arbitrary code/CSS.
20. **Structured panels:** schemas, block editor, renderer; model/workspace tests. Preserve plain-text limits, checked HTTPS links and visible-block limits.
21. **Studio badges:** bot/admin endpoints/community/rendering; `studio-service.test.ts`, recovery tests. Preserve owner-only assignment, display opt-out, three visible and no privilege grant.
22. **Catalogue filtering/metadata:** `MediaPicker`, server routes/catalogue import; `media-picker.test.tsx`, `catalog.test.ts`, `catalog-refresh.test.ts`. Preserve unknown/untagged access, pagination and owner-only labels.
23. **Media library metadata and usage:** community/server `studio`; service/workspace tests. Preserve labels, tags, one-level folders, references and affected-set warnings.
24. **Transparency inspection:** picker/thumbnail components and scene panels; picker/workspace tests. Preserve checker/light/dark/profile backgrounds, still comparison and black-background handling. Native image decoding is an integration gate.
25. **Local PNG/GIF export:** `profile-export`, `gif-recording`, `gif-encoder`, `native`; export tests and `scripts/test-{png,gif}-export.mjs`. Preserve tall cards, session ownership, cancellation, atomic file output and no surrounding Discord capture.
26. **Viewer overrides:** `viewer-overrides`, attachment/runtime; `studio-model.test.ts`, runtime tests. Preserve viewer/account scoping and unchanged owner publication.
27. **Exact visual moderation comparison:** community/server Studio and bot moderation; `studio-service.test.ts`, workspace tests. Preserve baseline revision at submission, immutable target, explicit phase/surface previews and server authorization.

Additional existing paths: remembered sessions and device revocation; authenticated profile/media reads; bot uploads and confirmations; avatar, banner, avatar decoration and nameplate replacement; tint palette and role checks; music-priority presentation; Steam screenshot slideshow; delayed native hover popout; account export/deletion; encrypted offsite backup/journal/alerts; Windows installer/updater controls. Evidence is in the matching security/session/catalogue/Steam/hover/backup/deployment/package test suites and deployment documentation. The refactor must retain these paths as well as the numbered list.

## Integration-sensitive roots: never auto-delete

- `packages/plugin/index.tsx`: Vencord plugin registration, lifecycle and dynamic patches.
- `packages/plugin/native.ts`: exported functions called by the generated Vencord native bridge.
- `packages/plugin/patches.ts`, DOM helpers, hover/decoration/nameplate adapters: Discord internals.
- `packages/server/main.ts`, `worker.ts`, `migrate.ts`, `packages/bot/main.ts`: service entrypoints selected outside ordinary imports.
- `migrations/*.sql`, `deploy/*.sh`, service/timer units, `scripts/*.mjs`, Windows installers: operational entrypoints.
- Legacy `Editor`, v1 model/DTO projection and `legacyConfig`: compatibility paths until verified otherwise.
- `packages/plugin/third-party/*`, licences and corresponding-source packaging: distribution obligations.

## New work still planned

- Move pure domain contracts to shared ownership; introduce scoped lint rules and component responsibility boundaries.
- Shared/edge-driven animation scheduling, protected byte-accounted media cache and download concurrency.
- Unified Discord-native editor design, at most two consolidated visual-review rounds.
- Public operator-filled `GET /v1/privacy/notice`, available before pairing; it does not exist in the baseline.
- Complete API contract coverage checks and a separate stable VitePress documentation build/GitHub Pages workflow.
- Complete deployment-specific privacy/provider details, contributor guidance and owner-awarded Supporter policy.

Supporter is currently a server-verified role with retained 5/20 preset/collection and custom-tint rules. The accepted contribution-recognition policy introduces no payment, scoring or new privilege. Its documentation and operator process belong to the approved later stage; no role was assigned during this assessment.

## Data handling to preserve

Authoritative implementation is in schemas/services, retention maintenance, secure backup/restore and `PRIVACY.md`. Input media is removed after processing; failed/rejected media is retained up to seven days; genuinely unused media/old versions up to 30 days, subject to active references; current publication until revocation/deletion. Security/moderation records are 30 days, sessions 90 days of inactivity, one-use codes five minutes, backups 30 days and recovery fences 31 days. Deletion revokes access immediately and removes active data within 24 hours. Do not shorten these safeguards merely to reduce disk use.

These defaults need a truthful operator-facing notice and confirmation of provider locations. Current activity/hover history is not server-side analytics. Draft recovery, sessions, playback and blob caches must remain account-bound and clear on access loss/sign-out.
