# Editor ownership and safe unused-code review

Stage 1B keeps the existing appearance, routes, event handlers, hook order and API contracts. No general state framework was added. This is structural work, not a claimed CPU/memory optimization or a visual redesign.

## Editor boundaries

`Editor.tsx` remains the public entrypoint. `useEditorController.ts` owns the legacy session/pairing, draft restoration, loading, save/submit, asynchronous guards and media state. `editor-types.ts` defines its integration inputs; `editor-labels.ts` keeps existing media/status labels shared. `legacy-panels.tsx` contains the account/privacy, pairing, catalogue action, moderator/admin and preview surfaces. `legacy-effects.tsx` owns legacy effect controls. `Notice` remains exported from the old entrypoint through `studio-notice.tsx`.

`StudioWorkspace.tsx` coordinates the v2 workspace, preserves its loading guard, toolbar/navigation, layer/panel editing and save/review controls. `useWorkspaceController.ts` owns draft/history, scene state, encrypted recovery, preset loading/version checks, pending operations and media/palette loading. `workspace-types.ts` describes the existing integration props. Appearance, music and pinned preview live in `workspace-appearance.tsx`, `workspace-music.tsx` and `workspace-preview.tsx` respectively. These views receive the typed controller and context; they do not create competing draft state or another persistence layer.

`studio-community.tsx` is a small tab/permission router. Library/media rows, sharing, automation, review and owner administration live in `community/`, with common input types in `community/types.ts`. Keep the router's moderator/owner checks before mounting protected panels; server checks remain authoritative. Moving a component into a module does not authorize fetching its data for everyone.

`studio-dialogs.tsx` owns the existing Studio dialog and confirmation implementations. The old `StudioDialog` and `ConfirmAction` export paths re-export those same functions. Focus, Escape, cancellation and confirmation behavior are unchanged.

## Lifetime and data rules

Hook extraction is mechanical: existing effects, cancellation flags, generation counters, operation guards and dependency lists are retained. Shared refs and current-state reads still belong to one mounted controller. Views must not introduce another autosave, pairing poll, media cache or undo stack. Preserve account/API/preset scoping and immutable moderation targets.

Stage 2 subsequently centralized private media loading in `usePrivateMedia.ts`, shared by controllers, picker and community views. Its committed-batch leases replace their duplicated loading effects; ownership and cancellation rules are documented in [Resource lifecycle](RESOURCE-LIFECYCLE.md).

No styles or DOM wrappers were added. Profile designs, pinned preview, small thumbnails, layer locking and effect stacking use the existing renderer and classes. Isolated/browser evidence is not a real Discord two-account test. No production deployment or Discord installation/restart is part of this stage.

## Unused-code policy

`scripts/dead-code-entrypoints.json` documents runtime roots and compatibility exports for future reachability tooling. It is a review input, not a blanket lint suppression or proof that everything else is unused. Native bridge exports, dynamic patches, bot events, container/installer commands, migrations, restore paths and compatibility projections can be live without a normal static import.

Before deleting a candidate:

1. Check ordinary references, dynamic patch strings, native exports, package/Compose/systemd commands, test and operator entrypoints.
2. Inspect feature gates and old clients/configs; absence from the currently visible tab is not dead code.
3. Confirm the candidate is outside protected roots, or explicitly review why that root is obsolete.
4. Run appropriate behavior, build, package-source and compatibility checks; preserve licence/corresponding-source requirements.

This stage removes only imports and destructured view bindings made unnecessary by the split. No legacy feature, native entrypoint, migration, licence or recovery path was deleted. New feature modules have a scoped unused-binding lint gate; broader unused-code removal remains evidence-driven.
