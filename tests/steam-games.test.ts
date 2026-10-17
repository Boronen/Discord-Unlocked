import { afterEach, expect, test, vi } from "vitest";
import {
  steamGameId,
  steamArtwork,
  parseSteamGame,
  configureSteamGames,
  loadSteamGame,
} from "../packages/plugin/steam-games.js";
const screenshot =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/440/ss_example.600x338.jpg?t=1";
afterEach(() => configureSteamGames());
test("Steam selection accepts only a public store game URL or bounded App ID", () => {
  expect(steamGameId("440")).toBe("440");
  expect(steamGameId("https://store.steampowered.com/app/440/Team_Fortress_2/?l=english")).toBe("440");
  for (const input of [
    "0",
    "-440",
    "https://store.steampowered.com.evil.example/app/440",
    "http://store.steampowered.com/app/440",
    "https://user@store.steampowered.com/app/440",
    "https://store.steampowered.com:444/app/440",
    "https://127.0.0.1/app/440",
    "https://store.steampowered.com/app/440/../../api/",
  ])
    expect(() => steamGameId(input)).toThrow();
});
test("metadata is plain, bounded and contains only allowlisted images for the selected App ID", () => {
  const data = {
    type: "game",
    steam_appid: 440,
    name: "Team Fortress 2",
    header_image: screenshot,
    screenshots: [
      { path_thumbnail: screenshot },
      { path_thumbnail: screenshot },
      { path_thumbnail: "https://evil.example/asset.jpg" },
      { path_thumbnail: screenshot.replace("/440/", "/570/") },
    ],
  };
  const game = parseSteamGame("440", { "440": { success: true, data } });
  expect(game.images).toEqual([screenshot]);
  expect(game.url).toBe("https://store.steampowered.com/app/440/");
  expect(steamArtwork(screenshot)).toBe(true);
  expect(
    steamArtwork(
      screenshot.replace("shared.akamai.steamstatic.com", "shared.akamai.steamstatic.com.evil.example"),
    ),
  ).toBe(false);
  expect(steamArtwork(screenshot.replace("https://", "https://name:secret@"))).toBe(false);
  expect(() => parseSteamGame("570", { "570": { success: true, data } })).toThrow();
  expect(() => parseSteamGame("440", { "440": { success: false } })).toThrow();
});
test("shared game loads are cached but failures can be retried", async () => {
  const resolve = vi
    .fn()
    .mockRejectedValueOnce(new Error("outage"))
    .mockResolvedValue({
      appId: "440",
      name: "Example",
      url: "https://store.steampowered.com/app/440/",
      images: [],
    });
  configureSteamGames(resolve);
  await expect(loadSteamGame("440")).rejects.toThrow("outage");
  await loadSteamGame("440");
  await loadSteamGame("https://store.steampowered.com/app/440/");
  expect(resolve).toHaveBeenCalledTimes(2);
});
