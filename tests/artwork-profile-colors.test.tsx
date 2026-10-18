// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ProfilePreview } from "../packages/plugin/visuals.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { artworkPalette } from "../packages/plugin/palette.js";
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
