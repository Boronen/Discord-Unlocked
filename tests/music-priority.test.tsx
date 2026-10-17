// @vitest-environment jsdom
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { currentMusic } from "../packages/plugin/music-surface.js";
import { StudioBlocks } from "../packages/plugin/scene-renderer.js";
import { DEFAULT_CONFIG } from "../packages/plugin/model.js";
import { normalizeStudio, configDiff } from "../packages/plugin/studio-model.js";
import { profileConfigSchema } from "../packages/shared/schema.js";
import { profileV2Schema } from "../packages/shared/studio-schema.js";
afterEach(cleanup);
test("reads current Discord music without arbitrary navigation links", () => {
  const activity = {
    type: 2,
    name: "Apple Music",
    details: "Current song",
    state: "Artist",
    metadata: { button_urls: ["https://example.com/unsafe", "https://music.apple.com/hu/song/1234567890"] },
    timestamps: { start: 1700000000, end: 1700000200 },
  };
  const track = currentMusic(activity, "https://cdn.discordapp.com/cover.png")!;
  expect(track).toMatchObject({
    title: "Current song",
    artist: "Artist",
    url: "https://music.apple.com/hu/song/1234567890",
    start: 1700000000000,
    end: 1700000200000,
  });
  expect(currentMusic({ ...activity, type: 0, name: "Visual Studio Code" })).toBeUndefined();
  expect(
    currentMusic({ ...activity, metadata: { button_urls: ["javascript:alert(1)"] } })?.url,
  ).toBeUndefined();
});
test("the priority preference is optional, validated and included in moderated differences", () => {
  expect(profileConfigSchema.parse(DEFAULT_CONFIG).musicPriority).toBeUndefined();
  const config = normalizeStudio({ ...DEFAULT_CONFIG, musicPriority: true });
  expect(profileV2Schema.parse(config).musicPriority).toBe(true);
  expect(profileV2Schema.safeParse({ ...config, musicPriority: "yes" }).success).toBe(false);
  expect(configDiff({ ...config, musicPriority: false }, config)).toContain("musicPriority");
});
test("prioritizes live music, falls back to favorites and respects the owner's choice", () => {
  const config = normalizeStudio({
    ...DEFAULT_CONFIG,
    musicPriority: true,
    favoriteSong: {
      title: "Saved favorite",
      artist: "Favorite artist",
      url: "https://music.apple.com/hu/song/1234567890",
      artwork: null,
    },
  });
  const live = { title: "Current song", artist: "Current artist", provider: "Apple Music" };
  const view = render(<StudioBlocks config={config} surface="small" liveMusic={live} reduced />);
  expect(screen.getByRole("region", { name: "Now playing" })).toBeTruthy();
  expect(screen.queryByText("Saved favorite")).toBeNull();
  view.rerender(<StudioBlocks config={config} surface="small" reduced />);
  expect(screen.getByText("Saved favorite")).toBeTruthy();
  view.rerender(
    <StudioBlocks config={{ ...config, musicPriority: false }} surface="small" liveMusic={live} reduced />,
  );
  expect(screen.getByText("Saved favorite")).toBeTruthy();
  expect(screen.queryByText("Current song")).toBeNull();
});
