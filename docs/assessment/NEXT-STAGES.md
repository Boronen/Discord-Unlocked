# Proposed refactor budgets — approval required

No stage below has started. These are reviewable work packages, not promises of new product features. Approve one package at a time; update the estimate from observed usage at the next checkpoint. Do not infer approval of all later stages from approval of Stage 0.

## Recommended first package: 1A, shared domain boundary

Scope: move only pure model, tint/palette constants, music-link validation and shared serialization helpers into an explicit shared domain folder. Keep compatibility re-exports for plugin callers. Server/bot/shared must no longer import plugin implementations. Add narrow import-boundary tests and lint/format configuration without mass-changing unrelated source. Produce a reviewable diff and English developer notes.

Acceptance: zero server/bot/shared → plugin imports; unchanged v1/v2 DTOs, defaults and stored configs; old profile fixtures still load; auth/moderation/supporter/quota/recovery suites pass; pinned plugin typecheck and server/preview/plugin builds pass. No API feature, database migration, production deployment, visual redesign or deletion of legacy paths in this package.

Estimate: **45–90 minutes of agent wall time**, plus machine test time. Working budget: **100k–250k uncached input tokens and 8k–20k output tokens**. Gross input including repeated cached context could be **2m–6m** in this long thread; that is not an additional quantity to add to input. These broad estimates are not credit/price quotes. Recommend a short scoped continuation context to reduce repeated context processing. Check usage at each small completed change. Before starting another change, stop if observed work has reached **90 minutes excluding recorded test/build waits, 250k uncached input, or 20k output**, whichever is reached first. Finish/undo an in-flight edit into a coherent state and report remaining work before requesting an extension; do not begin another task merely to use the rest of a different limit. Token totals are delayed by log flushing, so this is an operational checkpoint rather than an exact billing cap.

Use GPT-6.1 Sol Low/Medium for routine moves, higher effort only for a demonstrated schema/compatibility issue. No Astra task is expected. The parent chat's selected model/effort is controlled by the app; do not claim it was switched when it was not.

## Remaining structural package: 1B

Split workspace/editor/community responsibilities into feature modules, typed state/data hooks and rendering components. Retain existing behavior and entrypoints. Add a documented dynamic/native exception list for unused-code tooling; delete only proven unreachable code. Do not introduce a general state framework solely to reduce file length.

Estimate: 1–2 hours; 150k–350k uncached input and 12k–30k output; gross input 3m–9m depending on retained context. Success is testable ownership and smaller review units, not an arbitrary line-count percentage.

## Stage 2: measured resource work

Start with the confirmed media-concurrency and animation-commit findings. Add byte accounting, active-resource ownership and cancellation/clear semantics before cache eviction changes. Preserve the 100 MiB user allowance, animation fidelity and tall GIF capability. Only then examine query batching, palette decode reuse and packaging debug artifacts.

Targets to validate, not claimed results: bounded pending media work under the 80-request probe; every active blob remains valid; zero stale callbacks/resources after access loss; CSS-only layers do not require approximately 20 React commits/second; timed catalogue layer changes/Intro/Hover stay correct; GIF end panel and frame timing remain intact. Profile CPU/memory must improve beyond repeated-run spread on the real client before advertising a percentage. Docker packaging improvements require real image/layer sizes first.

Estimate: 2–4 hours; 250k–600k uncached input, 20k–45k output; gross input 5m–15m. A narrowly bounded higher-effort Sol review may be justified for resource ownership. Astra requires an explicit reason and a small input/output handoff recorded privately.

## Stage 3: editor consistency

Use Discord theme/font tokens with a restrained Linear-inspired information hierarchy. Unify controls and loading/error/empty/conflict states across workspace, media, catalogue and authorized admin/review panels. Preserve fixed preview, small thumbnails, tint placement, selected/locked layers and effect stacking. Keep user-created profile visuals unchanged. At most two consolidated visual-review rounds, with light/dark/narrow/keyboard/motion states grouped in each.

Estimate: 1.5–3 hours; 180k–450k uncached input, 15k–35k output; gross input 4m–11m. Gate: true Windows Discord acceptance plus fixture checks, not a browser screenshot alone.

## Documentation and privacy package

One English Markdown source with separately built stable VitePress site and search. Cover user installation, feature walkthroughs, API contracts, Docker/VM/network/config, operations, moderation/media/automation/export, privacy/retention, backups/restore/incidents, development, licences and sources. Add automated route/contract coverage, operator-filled public privacy notice and contributor/Supporter guidance. No payment or scoring integration.

Operator facts and repository URL are required before final public pages. Preserve incomplete facts as explicitly incomplete during drafting. Use synthetic screenshots and small diagrams. Docs tooling must remain outside plugin/server production dependencies. Existing provider OAuth mini-site is a separate ignored checkout and must not be swept into the docs build.

Estimate: 2–4 hours; 200k–500k uncached input, 20k–45k output; gross input 4m–12m. Reader testing uses one brief, context-isolated Sol review rather than repeated full-conversation handoffs.

## Final acceptance and release

Run format/lint/typecheck/full tests/builds, route coverage, package integrity and all-history/ZIP/image secret scans. Complete two-account Discord, production-sized encrypted restore, deletion/revocation fences and host/Funnel load tests. Save the image plus database rollback point. Deploy the compatible server before the Windows package only when these gates pass. Select the GitHub repository, configure protections/private reporting and publish only reviewed sources/docs/artifacts.

Estimate: 1–2 hours of agent work plus build, operator and real-client test time; 100k–250k uncached input, 8k–20k output; gross input 2m–6m. No deadline or credit amount can be guaranteed from model tokens alone.

## Accounting rules

Uncached input = input minus cached input. Cached input is a subset of input; reasoning output is a subset of output. Report each separately, not as extra totals. Ranges are independent planning estimates and should not be added as a purchased allowance. Actual usage, effort, cache ratio and elapsed/tool times are retained in ignored private reports. Active inference time and account credits are unavailable unless the host exposes them. A partial final-turn log must be labelled partial.

The next action is approval of **1A only**, with the proposed scope, limits and acceptance criteria. Stage 2–release estimates are provisional and must be revisited after 1A/1B.
