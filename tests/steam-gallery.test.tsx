// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, test, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { SteamGameCard } from "../packages/plugin/SteamGameCard.js";
import { configureSteamGames } from "../packages/plugin/steam-games.js";
const urls = [1, 2, 3].map(
  (i) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440/ss_${i}.jpg`,
);
afterEach(() => {
  cleanup();
  configureSteamGames();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(reduced = false) {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 600;
      naturalHeight = 338;
      decode() {
        return Promise.resolve();
      }
    },
  );
  const images = vi.fn(async (url: string) => `data:image/png;base64,${urls.indexOf(url)}`);
  configureSteamGames(
    async () => ({
      appId: "440",
      name: "Example game",
      url: "https://store.steampowered.com/app/440/",
      images: urls,
    }),
    images,
  );
  render(<SteamGameCard url="https://store.steampowered.com/app/440/" reduced={reduced} />);
  return images;
}
test("gallery changes every four seconds and pauses on hover, by button and on teardown", async () => {
  const images = setup();
  await act(async () => {});
  expect(screen.getByAltText(/screenshot 1 of 3/)).toBeTruthy();
  await act(() => vi.advanceTimersByTimeAsync(4000));
  expect(screen.getByAltText(/screenshot 2 of 3/)).toBeTruthy();
  fireEvent.mouseEnter(screen.getByLabelText("Favorite game"));
  await act(() => vi.advanceTimersByTimeAsync(8000));
  expect(images).toHaveBeenCalledTimes(2);
  fireEvent.mouseLeave(screen.getByLabelText("Favorite game"));
  fireEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
  await act(() => vi.advanceTimersByTimeAsync(8000));
  expect(images).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Next game screenshot" }));
  await act(async () => {});
  expect(screen.getByAltText(/screenshot 3 of 3/)).toBeTruthy();
  cleanup();
  await act(() => vi.advanceTimersByTimeAsync(8000));
  expect(images).toHaveBeenCalledTimes(3);
});
test("static mode keeps one image while retaining manual browsing", async () => {
  const images = setup(true);
  await act(async () => {});
  await act(() => vi.advanceTimersByTimeAsync(8000));
  expect(images).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Pause slideshow" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next game screenshot" }));
  await act(async () => {});
  expect(screen.getByAltText(/screenshot 2 of 3/)).toBeTruthy();
});
