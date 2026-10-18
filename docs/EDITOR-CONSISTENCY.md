# Editor consistency — Stage 3

The self-hosted plugin retains its existing Vencord pin, API, moderation, quotas and profile renderer. This package changes editor navigation, layout and feedback; it does not change published profile configuration or add a dependency.

## Shared controls and states

- `StudioTabs` supplies accessible section/picker tabs. Workspace arrows move focus; Enter/Space or clicking activates. Picker arrows activate immediately, preserving the tint workflow. Tabs have stable panel associations and do not intercept IME composition.
- `StudioSearch` owns local clearing and returns focus to its input. Local search stays outside Discord's URL. Media pagination uses the filtered dataset and cannot strand the user after filtering or removal.
- `StudioField` connects help/error descriptions to direct input, textarea, select, Choice and Search controls. Errors expose `aria-invalid`; native select popups remain platform-owned.
- `StudioState` provides loading/empty/no-results/retry feedback. `Notice` preserves polite status/assertive errors and focuses errors after the DOM commits, rather than querying a not-yet-rendered alert.
- `usePanelQuery` owns read-only sharing/review/admin list state. Refresh errors keep the last successful data visible; generations fence late responses and access loss clears data. Existing mutation controllers and server checks remain authoritative. It is not a write/autosave/cache framework.

Preset controls, status, tabs and the form now share the left column. The pinned preview begins beside the preset toolbar, giving it usable height before scrolling. In a narrow container, two compact control columns leave room for the profile card. User-created effects, fonts/colors, front/back ordering, selected/locked layer behavior, preview fitting, music and export surfaces retain their existing renderer.

## Verification and handoff

The synthetic preview supports dark/light themes, slow/error responses, nested Discord-like scrolling and narrow windows. `tests/studio-ui.test.tsx` covers field semantics, error focus, manual/automatic tabs, clearing, async refresh races/access loss and filtered pagination. Existing editor/workspace/picker, permission and resource tests remain required. The Premium static audit supplements these checks; it cannot prove live Discord behavior.

The Stage 3 Windows ZIP is a local candidate until actual Windows Discord acceptance is recorded. Browser/Electron evidence must not be described as a two-account Discord trial. Production deployment, Discord restart/installation and public release are separate handoff actions. See [next stages](assessment/NEXT-STAGES.md).

## Synthetic editor capture

This screenshot uses generated sample data in the browser fixture; it is not a live Discord account.

![Editor with preset controls and pinned preview](assessment/images/editor-stage3.webp)
