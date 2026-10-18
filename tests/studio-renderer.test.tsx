// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
import { nextSceneBoundary } from "../packages/plugin/scene-scheduler.js";
import { SceneRenderer, phaseVisible, StudioBlocks } from "../packages/plugin/scene-renderer.js";
import { newLayer, normalizeStudio, resolveScene } from "../packages/plugin/studio-model.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { ProfilePreview } from "../packages/plugin/visuals.js";
test("original comparison retains cached Discord appearance without a fabricated music activity", () => {
  render(
    <ProfilePreview
      config={DEFAULT_CONFIG}
      urls={{}}
      items={[]}
      account={{
        name: "Alice",
        avatar: "native-avatar.png",
        original: {
          bannerUrl: "native-banner.png",
          decorationUrl: "native-decoration.png",
          bio: "Native bio",
          colors: ["#123456", "#111111"],
        },
      }}
      originalView
      reduced
    />,
  );
  expect(document.querySelector(".ps-banner img")?.getAttribute("src")).toBe("native-banner.png");
  expect(document.querySelector(".ps-decoration")?.getAttribute("src")).toBe("native-decoration.png");
  expect(document.querySelector(".ps-avatar")?.getAttribute("src")).toBe("native-avatar.png");
  expect(document.body.textContent).toContain("Native bio");
  expect(document.body.textContent).not.toContain("Story of My Life");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFrames() {
  let now = 0,
    serial = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++serial;
    pending.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  return {
    pending,
    tick(time: number) {
      now = time;
      act(() => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((fn) => fn(time));
      });
    },
  };
}

test("five CSS scenes share a frame sampler and perform no React work between phase boundaries", () => {
  const frames = mockFrames();
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [newLayer("preset"), newLayer("texture")];
  const scene = resolveScene(c, "small"),
    items: [] = [];
  let commits = 0;
  const { unmount } = render(
    <React.Profiler id="scenes" onRender={() => commits++}>
      {Array.from({ length: 5 }, (_, i) => (
        <SceneRenderer key={i} scene={scene} items={items} urls={{}} />
      ))}
    </React.Profiler>,
  );
  const settled = commits;
  for (let i = 1; i <= 200; i++) frames.tick(i * 16);
  expect(frames.pending.size).toBe(1);
  expect(commits).toBe(settled);
  unmount();
  expect(frames.pending.size).toBe(0);
});

test("quality CSS scenes need neither a frame sampler nor a recurring timer", () => {
  vi.useFakeTimers();
  const raf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [newLayer("texture")];
  render(<SceneRenderer scene={resolveScene(c, "small")} items={[]} urls={{}} mode="quality" />);
  expect(raf).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

test("quality timers honor intro and catalogue loop edges without changing animation sessions", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [{ ...newLayer("discord"), assetId: "effect" }];
  const item = {
    id: "effect",
    kind: "effect" as const,
    name: "Effect",
    imageUrl: "still",
    staticUrl: "still",
    discordAsset: null,
    layers: [
      {
        src: "animated",
        x: 0,
        y: 0,
        width: 450,
        height: 880,
        start: 100,
        duration: 200,
        loop: true,
        loopDelay: 100,
        zIndex: 0,
      },
    ],
  };
  render(<SceneRenderer scene={resolveScene(c, "small")} items={[item]} urls={{}} mode="quality" />);
  expect(document.querySelector("image")).toBeNull();
  act(() => vi.advanceTimersByTime(100));
  const first = document.querySelector("image");
  expect(first).not.toBeNull();
  act(() => vi.advanceTimersByTime(200));
  expect(document.querySelector("image")).toBeNull();
  act(() => vi.advanceTimersByTime(100));
  expect(document.querySelector("image")).not.toBeNull();
  expect(document.querySelector("image")).not.toBe(first);
});

test("offscreen and background scenes pause their intro clock and release the shared frame", () => {
  const frames = mockFrames();
  let intersects!: (entries: { target: Element; isIntersecting: boolean }[]) => void;
  const targets = new Set<Element>();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof intersects) {
        intersects = cb;
      }
      observe(target: Element) {
        targets.add(target);
      }
      unobserve(target: Element) {
        targets.delete(target);
      }
      disconnect = disconnect;
    },
  );
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [{ ...newLayer("media"), assetId: "intro", phase: "intro", durationMs: 300 }];
  const { unmount } = render(
    <SceneRenderer scene={resolveScene(c, "small")} items={[]} urls={{ intro: "animated" }} />,
  );
  frames.tick(100);
  act(() => intersects([...targets].map((target) => ({ target, isIntersecting: false }))));
  expect(frames.pending.size).toBe(0);
  frames.tick(10_000);
  act(() => intersects([...targets].map((target) => ({ target, isIntersecting: true }))));
  expect(document.querySelector(".ps-scene-image")).not.toBeNull();
  frames.tick(10_199);
  expect(document.querySelector(".ps-scene-image")).not.toBeNull();
  frames.tick(10_201);
  expect(document.querySelector(".ps-scene-image")).toBeNull();
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(frames.pending.size).toBe(0);
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});

test("auto quality still degrades on sustained slow frames and hover supports keyboard focus", () => {
  const frames = mockFrames();
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [{ ...newLayer("media"), assetId: "hover", phase: "hover" }];
  render(<SceneRenderer scene={resolveScene(c, "small")} items={[]} urls={{ hover: "animated" }} />);
  const host = document.querySelector(".ps-scene")!;
  expect(document.querySelector("img")).toBeNull();
  fireEvent.focusIn(host);
  expect(document.querySelector("img")).not.toBeNull();
  fireEvent.focusOut(host);
  expect(document.querySelector("img")).toBeNull();
  for (let i = 1; i <= 360; i++) frames.tick(i * 50);
  expect(host.classList.contains("ps-scene-static")).toBe(true);
  expect(frames.pending.size).toBe(0);
});

test("boundary calculation stops completed intros and ignores inactive hover catalogue work", () => {
  const intro = { ...newLayer(), phase: "intro" as const, delayMs: 100, durationMs: 200 };
  expect(nextSceneBoundary([intro], [], 0, false)).toBe(100);
  expect(nextSceneBoundary([intro], [], 100, false)).toBe(300);
  expect(nextSceneBoundary([intro], [], 300, false)).toBe(Infinity);
  expect(nextSceneBoundary([{ ...intro, phase: "hover" }], [], 0, false)).toBe(Infinity);
});

test("overlapping layers expose a handle only for the selected unlocked layer", () => {
  const config = normalizeStudio(DEFAULT_CONFIG);
  const first = { ...newLayer(), id: "lower" },
    second = { ...newLayer(), id: "upper", plane: "front" as const };
  config.studio.base.layers = [first, second];
  const props = {
    scene: resolveScene(config, "small"),
    items: [],
    urls: {},
    reduced: true,
    onTransform: vi.fn(),
  };
  const { rerender } = render(<SceneRenderer {...props} selected="lower" />);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Move layer 1" })).toBeTruthy();
  rerender(<SceneRenderer {...props} selected="upper" />);
  expect(screen.queryByRole("button", { name: "Move layer 1" })).toBeNull();
  expect(screen.getByRole("button", { name: "Move layer 2" })).toBeTruthy();
  rerender(<SceneRenderer {...props} selected="upper" lockedLayers={["upper"]} />);
  expect(screen.queryByRole("button")).toBeNull();
});

test("catalogue effects fill an expanded card while uploaded artwork stays proportional", () => {
  const config = normalizeStudio(DEFAULT_CONFIG);
  config.studio.base.layers = [{ ...newLayer("discord"), assetId: "frame" }];
  const item = {
    id: "frame",
    kind: "effect" as const,
    name: "Frame",
    imageUrl: "frame.png",
    staticUrl: "still.png",
    discordAsset: null,
    layers: [
      {
        src: "layer.png",
        x: 0,
        y: 0,
        width: 450,
        height: 880,
        start: 0,
        duration: 10000,
        loop: true,
        loopDelay: 0,
        zIndex: 0,
      },
    ],
  };
  const { rerender } = render(
    <SceneRenderer scene={resolveScene(config, "small")} items={[item]} urls={{}} forcedPhase="idle" />,
  );
  expect(document.querySelector(".ps-scene-catalog")?.getAttribute("preserveAspectRatio")).toBe("none");
  rerender(<SceneRenderer scene={resolveScene(config, "small")} items={[item]} urls={{}} reduced />);
  expect(document.querySelector(".ps-scene-catalog-still")?.getAttribute("src")).toBe("still.png");
  config.studio.base.layers = [{ ...newLayer("media"), assetId: "upload" }];
  rerender(
    <SceneRenderer
      scene={resolveScene(config, "small")}
      items={[item]}
      urls={{ upload: "upload.png" }}
      reduced
    />,
  );
  expect(document.querySelector(".ps-scene-image")?.classList.contains("ps-scene-catalog-still")).toBe(false);
});
test("phase windows have deterministic boundaries and hover also supports focus state", () => {
  const l = { ...newLayer(), phase: "intro" as const, delayMs: 100, durationMs: 200 };
  expect(phaseVisible(l, 99, false)).toBe(false);
  expect(phaseVisible(l, 100, false)).toBe(true);
  expect(phaseVisible(l, 300, false)).toBe(false);
  expect(phaseVisible({ ...l, phase: "hover" }, 1000, true)).toBe(true);
  expect(phaseVisible({ ...l, phase: "hover" }, 1000, false)).toBe(false);
});
test("rerendering a scene does not restart its completed intro", () => {
  let now = 0;
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [{ ...newLayer("media"), assetId: "intro", phase: "intro", durationMs: 100 }];
  const scene = resolveScene(c, "small");
  const { rerender } = render(
    <SceneRenderer
      scene={scene}
      items={[]}
      urls={{ intro: "data:image/png;base64,AA==" }}
      sessionKey="opening-1"
    />,
  );
  expect(document.querySelector(".ps-scene-image")).not.toBeNull();
  now = 200;
  act(() => frames.shift()!(200));
  expect(document.querySelector(".ps-scene-image")).toBeNull();
  rerender(
    <SceneRenderer
      scene={{ ...scene, colors: ["#ffffff", "#000000"] }}
      items={[]}
      urls={{ intro: "data:image/png;base64,AA==" }}
      sessionKey="opening-1"
    />,
  );
  expect(document.querySelector(".ps-scene-image")).toBeNull();
});
test("static mode uses the normalized still and never starts a frame timer", () => {
  const raf = vi.fn();
  vi.stubGlobal("requestAnimationFrame", raf);
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [{ ...newLayer("media"), assetId: "asset" }];
  render(
    <SceneRenderer
      scene={resolveScene(c, "small")}
      items={[]}
      urls={{ asset: "animated.webp", "asset:static": "still.png" }}
      reduced
    />,
  );
  expect(document.querySelector("img")?.getAttribute("src")).toBe("still.png");
  expect(raf).not.toHaveBeenCalled();
});
test("small and full views use the same panel order with stable native identity outside Studio", () => {
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.blocks = Array.from({ length: 5 }, (_, i) => ({
    id: `b${i}`,
    kind: "text",
    title: `Panel ${i + 1}`,
    text: `Text ${i + 1}`,
    links: [],
    visible: true,
  }));
  const { rerender } = render(<StudioBlocks config={c} surface="small" reduced />);
  expect(document.querySelectorAll(".ps-studio-block")).toHaveLength(3);
  rerender(<StudioBlocks config={c} surface="full" reduced />);
  expect([...document.querySelectorAll("h3")].map((n) => n.textContent)).toEqual([
    "Panel 1",
    "Panel 2",
    "Panel 3",
    "Panel 4",
    "Panel 5",
  ]);
});
