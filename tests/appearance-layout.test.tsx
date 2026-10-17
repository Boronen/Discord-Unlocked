// @vitest-environment jsdom
import React from "react";
import { expect, test, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { pickerPageLayout } from "../packages/plugin/picker-layout.js";
import { ProfilePreview } from "../packages/plugin/visuals.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { DecorationTints } from "../packages/plugin/decoration-tints.js";
import { tagDecorationTint } from "../packages/plugin/tint.js";

test("page capacity fits measured rows, adapts to nameplates and stays bounded", () => {
  expect(pickerPageLayout(560, 400)).toEqual({ columns: 4, capacity: 8 });
  expect(pickerPageLayout(280, 198)).toEqual({ columns: 2, capacity: 2 });
  expect(pickerPageLayout(560, 400, true)).toEqual({ columns: 4, capacity: 8 });
  expect(pickerPageLayout(1000, 1000).capacity).toBe(12);
  expect(pickerPageLayout(0, 0).capacity).toBe(1);
});
test("profile filters tint only effect and decoration; artwork is an independent background", () => {
  const effect = {
    id: "fx",
    kind: "effect" as const,
    name: "Effect",
    imageUrl: "https://cdn.discordapp.com/fx.png",
    staticUrl: "https://cdn.discordapp.com/fx.png",
    discordAsset: null,
    layers: [],
  };
  render(
    <ProfilePreview
      config={{
        ...DEFAULT_CONFIG,
        avatar: "avatar",
        decoration: { source: "media", id: "dec" },
        effect: { source: "discord", id: "fx" },
        effectTint: { color: "#ff0000", intensity: 1 },
        decorationTint: { color: "#00ff00", intensity: 0.5 },
        albumBackground: { enabled: true, opacity: 0.4, blur: 12 },
      }}
      urls={{ avatar: "blob:avatar", dec: "blob:dec" }}
      items={[effect]}
      account={{ name: "Alice" }}
      albumUrl="data:artwork"
    />,
  );
  expect((document.querySelector(".ps-avatar") as HTMLElement).style.filter).toBe("");
  expect(document.querySelectorAll("feColorMatrix")).toHaveLength(2);
  expect((document.querySelector(".ps-album-background") as HTMLElement).style.opacity).toBe("0.4");
  expect((document.querySelector(".ps-album-background img") as HTMLElement).style.filter).toBe("blur(12px)");
  cleanup();
});
test("native decoration tint restores pre-existing filters when reused or stopped", () => {
  let pending: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const flush = () => {
    const callback = pending;
    pending = undefined;
    callback?.(0);
  };
  const image = document.createElement("img");
  image.style.filter = "contrast(1.1)";
  image.src = tagDecorationTint("https://cdn.discordapp.com/art.png", { color: "#ff0000", intensity: 0.5 });
  document.body.append(image);
  const manager = new DecorationTints();
  try {
    manager.start();
    flush();
    expect(image.style.filter).toMatch(/ps-native-tint/);
    image.src = "https://cdn.discordapp.com/original.png";
    manager.refresh();
    flush();
    expect(image.style.filter).toBe("contrast(1.1)");
  } finally {
    manager.stop();
    image.remove();
    vi.unstubAllGlobals();
  }
});
