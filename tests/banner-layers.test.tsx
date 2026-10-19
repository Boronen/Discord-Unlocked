// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { BannerLayers, useBannerHost } from "../packages/plugin/BannerLayers.js";
import { SceneRenderer } from "../packages/plugin/scene-renderer.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { newBannerLayer, newLayer, normalizeStudio, resolveScene } from "../packages/plugin/studio-model.js";

afterEach(cleanup);

test("banner layers keep alpha filters scoped and use music or manual tint per image", () => {
  const one = newBannerLayer("one"),
    two = { ...newBannerLayer("two"), followMusicColors: false, tint: { color: "#123456", intensity: 0.5 } };
  one.transform = { x: 0.1, y: -0.2, rotation: 15, scale: 1.2, opacity: 0.6 };
  const { container, rerender } = render(
    <BannerLayers
      layers={[one, two]}
      urls={{ one: "one.gif", "one:static": "one.png", two: "two.png" }}
      palette={["#ff0000", "#0000ff"]}
    />,
  );
  expect([...container.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual([
    "one.gif",
    "two.png",
  ]);
  const layers = container.querySelectorAll<HTMLElement>(".ps-banner-layer");
  expect(layers[0]!.style.transform).toContain("translate(10%,-20%)");
  expect(layers[0]!.style.opacity).toBe("0.6");
  const original = layers[1]!.querySelector("feColorMatrix")!.getAttribute("values");
  const adaptive = layers[0]!.querySelector("feColorMatrix")!.getAttribute("values");
  rerender(
    <BannerLayers
      layers={[one, two]}
      urls={{ one: "one.gif", "one:static": "one.png", two: "two.png" }}
      palette={["#00ff00"]}
      reduced
    />,
  );
  expect(container.querySelector("img")!.getAttribute("src")).toBe("one.png");
  expect(container.querySelectorAll("feColorMatrix")[0]!.getAttribute("values")).not.toBe(adaptive);
  expect(container.querySelectorAll("feColorMatrix")[1]!.getAttribute("values")).toBe(original);
  expect(original!.trim().split(/\s+/).slice(-5)).toEqual(["0", "0", "0", "1", "0"]);
});

test("effect layers opt out of adaptive colors independently", () => {
  const config = normalizeStudio(DEFAULT_CONFIG);
  config.studio.base.layers = [
    { ...newLayer("texture"), color: "#123456", followMusicColors: false },
    newLayer("texture"),
  ];
  const { container } = render(
    <SceneRenderer
      scene={resolveScene(config, "small")}
      urls={{}}
      items={[]}
      reduced
      adaptivePalette={["#ff0000", "#0000ff"]}
    />,
  );
  const layers = container.querySelectorAll<HTMLElement>(".ps-scene-layer");
  expect(layers[0]!.style.getPropertyValue("--ps-effect-color")).toBe("#123456");
  expect(layers[1]!.style.getPropertyValue("--ps-effect-color")).toBe("#0000ff");
});

test("native banner attachment follows node replacement and restores original host state", async () => {
  const root = document.createElement("div");
  document.body.append(root);
  const first = document.createElement("div");
  first.className = "banner_first";
  first.style.position = "absolute";
  root.append(first);
  function Host() {
    const host = useBannerHost(root, true);
    return <span>{host?.className}</span>;
  }
  const { unmount } = render(<Host />);
  expect(first.classList.contains("ps-banner-host")).toBe(true);
  expect(first.style.position).toBe("absolute");
  const replacement = document.createElement("div");
  replacement.className = "banner_second";
  first.replaceWith(replacement);
  await waitFor(() => expect(replacement.classList.contains("ps-banner-host")).toBe(true));
  expect(first.className).toBe("banner_first");
  unmount();
  expect(replacement.className).toBe("banner_second");
  root.remove();
});
