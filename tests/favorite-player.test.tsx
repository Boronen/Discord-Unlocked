// @vitest-environment jsdom
import React from "react";
import { expect, test, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FavoriteSongCard } from "../packages/plugin/FavoriteSong";
import { DEFAULT_CONFIG } from "../packages/plugin/model";
afterEach(cleanup);
test("opens playback only on user action and stops it on profile close or mute", async () => {
  const play = vi.fn().mockResolvedValue(undefined),
    close = vi.fn();
  const song = {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Favorite",
    artist: "Artist",
    artwork: null,
  };
  const view = render(
    <FavoriteSongCard
      song={song}
      style={DEFAULT_CONFIG.music}
      reduced={false}
      onPlay={play}
      onClose={close}
    />,
  );
  expect(play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  expect(play).toHaveBeenCalledTimes(1);
  await screen.findByRole("button", { name: "Play" });
  view.rerender(
    <FavoriteSongCard
      song={song}
      style={DEFAULT_CONFIG.music}
      reduced={false}
      muted
      onPlay={play}
      onClose={close}
    />,
  );
  expect(close).toHaveBeenCalled();
  expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
  view.unmount();
  expect(close).toHaveBeenCalledTimes(3);
});
