import { expect, test } from "vitest";
import { discordAssetArtwork } from "../packages/plugin/artwork-policy.js";
test("export can load only Discord's canonical public UI image paths", () => {
  expect(discordAssetArtwork("https://discord.com/assets/abcdef123.svg")).toBe(true);
  expect(discordAssetArtwork("https://discord.com/assets/abcdef123.png?size=32")).toBe(true);
  for (const value of [
    "http://discord.com/assets/icon.svg",
    "https://evil.invalid/assets/icon.svg",
    "https://discord.com/api/users",
    "https://discord.com/assets/private.woff2",
    "https://discord.com/assets/../api/icon.svg",
    "https://discord.com/assets/path/icon.svg",
    "https://name:secret@discord.com/assets/icon.svg",
    "https://discord.com:1234/assets/icon.svg",
  ])
    expect(discordAssetArtwork(value)).toBe(false);
});
