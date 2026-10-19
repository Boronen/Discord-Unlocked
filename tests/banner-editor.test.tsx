// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { BannerLayerEditor } from "../packages/plugin/BannerLayerEditor.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { normalizeStudio, legacyConfig } from "../packages/plugin/studio-model.js";
import type { WorkspaceController } from "../packages/plugin/useWorkspaceController.js";
import type { WorkspaceProps } from "../packages/plugin/workspace-types.js";

afterEach(cleanup);

test("banner editor preserves legacy colors, supports independent layers and respects the three-layer limit", () => {
  let latest = normalizeStudio({ ...DEFAULT_CONFIG, banner: "11111111-1111-4111-8111-111111111111" });
  function Harness() {
    const [config, setConfig] = React.useState(latest);
    latest = config;
    const controller = {
      config,
      album: {},
      custom: false,
      change: (next: typeof config) =>
        setConfig({ ...legacyConfig(next), configVersion: 2, studio: next.studio }),
    } as unknown as WorkspaceController;
    const context = {
      api: { bannerLayersSupported: true },
      state: { assets: [] },
      items: [],
      account: { name: "Test" },
      reduced: true,
    } as unknown as WorkspaceProps;
    return <BannerLayerEditor controller={controller} context={context} />;
  }
  render(<Harness />);
  expect((screen.getByLabelText("Follow music colors") as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByLabelText("Follow music colors"));
  expect(latest.studio.bannerLayers?.[0]?.followMusicColors).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Add banner layer" }));
  expect(latest.studio.bannerLayers).toHaveLength(2);
  fireEvent.click(screen.getByLabelText("Follow music colors"));
  expect(latest.studio.bannerLayers?.map((l) => l.followMusicColors)).toEqual([true, false]);
  fireEvent.change(screen.getByLabelText("Horizontal offset"), { target: { value: "5" } });
  expect(latest.studio.bannerLayers?.[1]?.transform.x).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Add banner layer" }));
  expect((screen.getByRole("button", { name: "Add banner layer" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Remove banner layer" }));
  expect(latest.studio.bannerLayers).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Use original Discord banner" }));
  expect(latest.studio.bannerLayers).toEqual([]);
  expect(latest.banner).toBeNull();
});

test("an older server does not expose unsupported banner editing controls", () => {
  const controller = {
    config: normalizeStudio(DEFAULT_CONFIG),
    album: {},
    custom: false,
  } as unknown as WorkspaceController;
  const context = {
    api: { bannerLayersSupported: false },
    state: { assets: [] },
  } as unknown as WorkspaceProps;
  const { container } = render(<BannerLayerEditor controller={controller} context={context} />);
  expect(container.textContent).toBe("");
});
