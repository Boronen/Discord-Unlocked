// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render, cleanup, act, screen } from "@testing-library/react";
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
