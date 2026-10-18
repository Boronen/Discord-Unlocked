# Media and scene resource ownership

Stage 2 changes client resource scheduling without changing profile DTOs, image fidelity, animation speed, upload allowances or moderation rules. The server, database schema and pinned Vencord revision are unchanged.

## Protected media

`media-cache.ts` owns native-download scheduling and object URLs. The public profile pool and private editor pool each allow four in-flight downloads and 128 queued sources. Duplicate requests share one download. An overloaded queue fails that preview rather than starting unbounded native requests; picker retry remains available. This is a transient client work limit, not a reduction of the user's 100 MiB storage allowance.

Each pool accounts for the encoded `Blob.size`. It retains at most 64 recent entries and targets 64 MiB of idle-and-active encoded blobs. Eviction walks the least recently used entries and skips active consumers. Active images may exceed either target: revoking a mounted image to satisfy a cache limit would break rendering. These are **soft retention targets**, not a hard browser/process-memory cap. Decoded pixels, native IPC/base64 buffers, GPU allocations and artwork caches are separate costs.

- Public images are protected while any registered profile observer uses their owner. `useProfile` releases the observer and prunes on unmount. Historical media from an observed owner can remain pinned until that profile closes.
- Private callers pass an `AbortSignal` as a lease. `usePrivateMedia` holds the displayed batch until its replacement commits, then releases the previous batch. Closing a view releases both displayed and pending batches. A shared source survives until its last lease ends.
- The local test-profile feature also holds a lease until its test is replaced or cleared. Legacy calls without a signal retain their URLs until `clearBlobs()`; new views should always use scoped leases.
- Unobserved, unleased queued work is discarded. Clear/access loss rejects pending work, revokes retained URLs, removes abort listeners and suppresses late notifications and URL creation.

The native transport does not expose request cancellation. An already-started IPC request can finish after cancellation, but its result is discarded. Its concurrency slot remains occupied until it settles, even across account changes. This prevents repeated clears from multiplying native requests. The next queued request starts only when a real slot is free.

`StudioClient` validates the API origin/media path and sends the session only in the native Authorization transport. Private cache identity includes API base, token and session generation. Foreign origins and stale-session responses are rejected. Access loss clears the UI batch as well as the backing object URLs. No token is introduced into a media URL, diagnostic or log.

## Scene scheduling

Native animated images and CSS animations advance in the browser. React only updates scene membership at Intro/Idle delay/end boundaries, Hover/focus changes, and catalogue SVG visibility/loop boundaries. Catalogue image keys still change at loop starts, so their animated assets restart correctly.

- Quality mode uses a one-shot timer for the next actual scene/catalogue boundary. CSS-only idle scenes need no animation frame or recurring timer.
- Auto mode shares one animation-frame request across all active scenes. It retains the previous sustained-slow-frame quality fallback; the frame sampler itself does not update React every 50 ms.
- Document visibility uses one shared listener, and intersections use one observer with per-element subscribers. The last unmount removes their underlying resources.
- Offscreen/background/reduced-motion/Low scenes stop scheduling. Paused time does not count toward the scene clock. A session key resets the Intro; ordinary prop updates do not.
- Pointer-based depth still writes CSS properties directly. Layer selection/locks, front/back order, tint, static fallbacks and native controls retain their existing behavior.

## Verification

`tests/media-cache.test.ts` covers coalescing, 80-source concurrency, byte eviction, overlapping leases, canceled queues, access-loss clears and session replacement. `tests/private-media-lifecycle.test.tsx` covers replacement-after-commit, abandoned requests, unmount and late access-loss results. Renderer tests cover shared frames, idle Quality mode, catalogue cycles, paused Intro clocks, keyboard Hover and Auto degradation.

For reproducible synthetic renderer measurements, provide an explicit output directory:

```sh
node scripts/assessment/renderer.mjs /path/to/electron 1 diagnostics/refactor-stage2/renderer
```

The harness calibrates frame delivery independently before the scenarios. Counting scene RAFs as a calibration would incorrectly reject a successfully optimized CSS-only Quality scene. Existing baseline captures are preserved. These fixtures are isolated Electron tests, not live Discord or VM acceptance.

Run `npm run format:resources`, lint, root and pinned-plugin typechecks, the complete test suite, plugin/server/preview builds, native GIF/PNG tests and package integrity/secret checks before handing off a candidate. Keep the previous Windows ZIP separately. No production deployment or Discord installation is implied by a local candidate.
