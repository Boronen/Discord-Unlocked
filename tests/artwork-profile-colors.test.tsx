// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ProfilePreview } from "../packages/plugin/visuals.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { artworkPalette, artworkTint } from "../packages/plugin/palette.js";
import { normalizeStudio, newLayer } from "../packages/plugin/studio-model.js";
import { tintMatrix } from "../packages/plugin/tint.js";
import { profileReadability } from "../packages/plugin/profile-readability.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("album backgrounds adapt profile content surfaces without enabling current-track replacement", async () => {
  let rgb = [35, 70, 170];
  const pixels = () => new Uint8ClampedArray(Array.from({ length: 32 * 32 }, () => [...rgb, 255]).flat());
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 32;
      naturalHeight = 32;
      async decode() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage() {},
    getImageData: () => ({ data: pixels() }),
  } as unknown as CanvasRenderingContext2D);
  const config = {
    ...DEFAULT_CONFIG,
    colors: ["#bb0000", "#660000"] as [string, string],
    musicPriority: false,
    albumBackground: { enabled: true, opacity: 0.3, blur: 12 },
  };
  const view = render(
    <ProfilePreview
      config={config}
      urls={{}}
      items={[]}
      account={{ name: "Example" }}
      albumUrl="data:first"
      reduced
    />,
  );
  const card = () => document.querySelector<HTMLElement>(".ps-profile")!;
  const first = artworkPalette(pixels())!;
  await waitFor(() =>
    expect(card().style.getPropertyValue("--ps-profile-surface")).toBe(
      profileReadability([first.background, first.accent])["--ps-profile-surface"],
    ),
  );
  rgb = [115, 40, 180];
  const second = artworkPalette(pixels())!;
  view.rerender(
    <ProfilePreview
      config={config}
      urls={{}}
      items={[]}
      account={{ name: "Example" }}
      albumUrl="data:second"
      reduced
    />,
  );
  await waitFor(() =>
    expect(card().style.getPropertyValue("--ps-profile-surface")).toBe(
      profileReadability([second.background, second.accent])["--ps-profile-surface"],
    ),
  );
  view.rerender(
    <ProfilePreview
      config={{ ...config, albumBackground: { ...config.albumBackground, enabled: false } }}
      urls={{}}
      items={[]}
      account={{ name: "Example" }}
      albumUrl="data:second"
      reduced
    />,
  );
  expect(card().style.getPropertyValue("--ps-profile-surface")).toBe(
    profileReadability(config.colors)["--ps-profile-surface"],
  );
});

test("a multicolor cover yields distinct bounded swatches without rewriting saved tints", () => {
  const palette = artworkPalette(
    new Uint8Array([
      220, 30, 40, 255, 215, 32, 42, 255, 30, 70, 220, 255, 31, 72, 219, 255, 30, 200, 50, 255, 31, 202, 51,
      255, 240, 0, 250, 0,
    ]),
  )!;
  expect(palette.swatches).toHaveLength(3);
  expect(new Set(palette.swatches).size).toBe(3);
  expect(artworkTint(palette.swatches, 3)).toEqual(artworkTint(palette.swatches, 0));
  expect(artworkTint(undefined)).toBeUndefined();
  expect(artworkPalette(new Uint8Array([0, 0, 0, 0]))).toBeNull();
});

test("preview applies cover colors to decoration, separate layers and transparent banner backing", async () => {
  const data = new Uint8ClampedArray([220, 30, 40, 255, 30, 70, 220, 255, 30, 200, 50, 255]);
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 32;
      naturalHeight = 32;
      async decode() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage() {},
    getImageData: () => ({ data }),
  } as unknown as CanvasRenderingContext2D);
  const config = normalizeStudio({ ...DEFAULT_CONFIG, musicPriority: true });
  config.studio.base.layers = [newLayer("texture"), newLayer("texture")];
  const props = {
    urls: {},
    items: [],
    account: { name: "Example", original: { decorationUrl: "decoration.gif", bannerUrl: "banner.gif" } },
    albumUrl: "data:cover",
    reduced: true,
  };
  const view = render(<ProfilePreview {...props} config={config} />);
  const palette = artworkPalette(data)!;
  await waitFor(() =>
    expect(document.querySelector(".ps-decoration-tint feColorMatrix")?.getAttribute("values")).toBe(
      tintMatrix(artworkTint(palette.swatches, 1)!),
    ),
  );
  expect(
    [...document.querySelectorAll<HTMLElement>(".ps-scene-layer")].map((el) =>
      el.style.getPropertyValue("--ps-effect-color"),
    ),
  ).toEqual(palette.swatches.slice(0, 2));
  expect(document.querySelector(".ps-banner img")?.getAttribute("src")).toBe("banner.gif");
  expect(document.querySelector<HTMLElement>(".ps-banner")?.style.backgroundColor).not.toBe("");
  view.rerender(<ProfilePreview {...props} config={{ ...config, musicPriority: false }} />);
  expect(document.querySelector(".ps-decoration-tint feColorMatrix")).toBeNull();
});
