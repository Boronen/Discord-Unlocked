// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ArtworkCache, albumArtworkCache } from "../packages/plugin/artwork-cache.js";
import { useAlbumArtwork } from "../packages/plugin/album-art.js";
afterEach(() => {
  cleanup();
  albumArtworkCache.clear();
  vi.unstubAllGlobals();
});

test("artwork cache enforces its byte budget, deduplicates and cannot repopulate after logout", async () => {
  const cache = new ArtworkCache(16);
  await cache.load("one", async () => "123456");
  await cache.load("two", async () => "abcd");
  expect(cache.sizeBytes).toBeLessThanOrEqual(16);
  const loader = vi.fn(async () => "z");
  await Promise.all([cache.load("same", loader), cache.load("same", loader)]);
  expect(loader).toHaveBeenCalledOnce();
  let finish!: (value: string) => void;
  const pending = cache.load(
    "pending",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  cache.clear();
  finish("late");
  await pending;
  expect(cache.sizeBytes).toBe(0);
});
test("song changes ignore stale responses and unavailable activity falls back to the favorite", async () => {
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 512;
      naturalHeight = 512;
      async decode() {}
    },
  );
  let finish!: (value: string) => void;
  const loader = vi.fn((source: string) =>
    source === "old"
      ? new Promise<string>((resolve) => {
          finish = resolve;
        })
      : source === "unavailable"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(`data:${source}`),
  );
  function Sample({ source, enabled = true }: { source: string; enabled?: boolean }) {
    const art = useAlbumArtwork(source, "favorite", enabled, loader);
    return (
      <p>
        {art.state}:{art.url}
      </p>
    );
  }
  const view = render(<Sample source="old" />);
  view.rerender(<Sample source="new" />);
  await screen.findByText("activity:data:new");
  finish("data:old");
  await waitFor(() => expect(screen.queryByText("activity:data:old")).toBeNull());
  view.rerender(<Sample source="unavailable" />);
  await screen.findByText("favorite:data:favorite");
  view.rerender(<Sample source="new" enabled={false} />);
  await screen.findByText("off:");
});
