// Synthetic fixture for the isolated Electron runner. Never imports Discord state.
import React, { Profiler } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProfilePreview } from "../../packages/plugin/visuals.js";
import { MediaPicker } from "../../packages/plugin/MediaPicker.js";
import { StudioWorkspace } from "../../packages/plugin/StudioWorkspace.js";
import { StudioClient } from "../../packages/plugin/client.js";
import { DEFAULT_CONFIG, type CatalogItem, type EditorState } from "../../packages/plugin/model.js";
import { normalizeStudio, newLayer } from "../../packages/plugin/studio-model.js";
import { studioFixture } from "../../preview/studio-fixture.js";
import "../../packages/plugin/styles.css";
import "../../preview/preview.css";

const counters = { rafCallbacks: 0, commits: 0, renderMs: 0, requests: 0 };
const frames = new Set<number>(),
  intervals = new Set<number>(),
  timeouts = new Set<number>();
const raf = window.requestAnimationFrame.bind(window),
  cancel = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = (callback) => {
  const id = raf((time) => {
    frames.delete(id);
    counters.rafCallbacks++;
    callback(time);
  });
  frames.add(id);
  return id;
};
window.cancelAnimationFrame = (id) => {
  frames.delete(id);
  cancel(id);
};
const every = window.setInterval.bind(window),
  clear = window.clearInterval.bind(window);
window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
  const id = every(handler, timeout, ...args);
  intervals.add(id);
  return id;
}) as typeof setInterval;
window.clearInterval = (id) => {
  intervals.delete(Number(id));
  clear(id);
};
const nativeWait = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);
window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
  if (typeof handler !== "function") return nativeWait(handler, delay, ...args);
  const id = nativeWait(() => {
    timeouts.delete(id);
    handler(...args);
  }, delay);
  timeouts.add(id);
  return id;
}) as typeof setTimeout;
window.clearTimeout = (id) => {
  timeouts.delete(Number(id));
  nativeClearTimeout(id);
};
const wait = (ms: number) => new Promise<void>((resolve) => nativeWait(resolve, ms));
const art =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#5865f2"/><circle cx="150" cy="90" r="50" fill="#e0e7ff"/></svg>',
  );
const account = { id: "100000000000000001", name: "Example member", avatar: art };
const base = normalizeStudio(DEFAULT_CONFIG);
base.studio.base.layers = [newLayer("preset"), newLayer("texture"), newLayer("texture")];
const items: CatalogItem[] = Array.from({ length: 700 }, (_, i) => ({
  id: `sample-${i}`,
  kind: "effect",
  name: `Sample effect ${String(i).padStart(3, "0")}`,
  imageUrl: art,
  staticUrl: art,
  discordAsset: null,
  layers: [],
}));
let root = createRoot(document.getElementById("root")!);
let api: StudioClient;
function client() {
  const state: EditorState = {
    userId: account.id,
    isOwner: true,
    canModerate: true,
    canUseCustomTint: true,
    draft: structuredClone(DEFAULT_CONFIG),
    draftVersion: 0,
    revisions: [],
    published: null,
    assets: [],
  };
  const fixture = studioFixture(state, items);
  api = new StudioClient("https://assessment.invalid", async (_base, path, method, body) => {
    counters.requests++;
    const response = fixture(path, method, body);
    if (!response) throw new Error(`Unmocked assessment request: ${path}`);
    return response;
  });
  api.token = "synthetic-only";
  api.userId = account.id;
  api.accessAllowed = true;
  api.studioV2 = true;
  api.musicPrioritySupported = true;
  return state;
}
function profile(count: number, reduced = false, full = false) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <ProfilePreview
          key={i}
          config={base}
          urls={{}}
          items={[]}
          account={account}
          reduced={reduced}
          full={full}
          performanceMode="quality"
        />
      ))}
    </div>
  );
}
function mount(name: string) {
  const state = client();
  let node: React.ReactNode = null;
  if (name === "profile-static") node = profile(1, true);
  else if (name === "profile-small") node = profile(1);
  else if (name === "profile-full") node = profile(1, false, true);
  else if (name === "profiles-five") node = profile(5);
  else if (name === "profile-offscreen")
    node = <div style={{ transform: "translateY(2500px)" }}>{profile(1)}</div>;
  else if (name === "editor")
    node = (
      <StudioWorkspace
        api={api}
        state={state}
        account={account}
        items={items}
        reduced={false}
        onReload={async () => {}}
      />
    );
  else if (name === "catalog")
    node = (
      <MediaPicker
        slot="effect"
        config={base}
        assets={[]}
        items={items}
        account={account}
        api={api}
        reduced={false}
        onUse={() => {}}
        onClose={() => {}}
      />
    );
  else if (name !== "empty") throw new Error("Unknown synthetic scenario");
  flushSync(() =>
    root.render(
      <Profiler
        id={name}
        onRender={(_id, _phase, actual) => {
          counters.commits++;
          counters.renderMs += actual;
        }}
      >
        {node}
      </Profiler>,
    ),
  );
}
function stats() {
  return {
    ...counters,
    pendingAnimationFrames: frames.size,
    activeIntervals: intervals.size,
    activeTimeouts: timeouts.size,
    domNodes: document.querySelectorAll("*").length,
    heap:
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
  };
}
async function clearRoot() {
  flushSync(() => root.unmount());
  root = createRoot(document.getElementById("root")!);
  await wait(200);
  return stats();
}
async function churn() {
  for (let i = 0; i < 20; i++) {
    mount("profile-small");
    await wait(35);
    await clearRoot();
  }
  return stats();
}
async function search() {
  const input = document.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error("Search field not rendered");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  const before = stats(),
    at = performance.now();
  for (const value of ["S", "Sa", "Sam", "Sample", "Sample effect 6"]) {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(80);
  }
  const after = stats();
  if (
    !document.body.textContent?.includes("Sample effect 600") ||
    document.body.textContent.includes("Sample effect 000")
  )
    throw new Error("Search did not filter the fixture");
  return {
    wallMs: performance.now() - at,
    commits: after.commits - before.commits,
    reactRenderMs: after.renderMs - before.renderMs,
    results: document.querySelectorAll(".ps-picker-option").length,
  };
}
Object.assign(window, { assessment: { mount, stats, clear: clearRoot, churn, search } });
