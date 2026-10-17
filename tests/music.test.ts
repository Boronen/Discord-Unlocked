// @vitest-environment jsdom
import { expect, test, vi } from "vitest";
import { songLink } from "../packages/plugin/music-links.js";
import { reduceMotion } from "../packages/plugin/motion.js";
import { findMusicSurface, isMusicActivity, musicCover } from "../packages/plugin/music-surface.js";
test.each([
  ["https://open.spotify.com/intl-hu/track/0Lr4kGOYn9l83EjuK6cZFQ?si=x", "spotify"],
  ["spotify:track:0Lr4kGOYn9l83EjuK6cZFQ", "spotify"],
  ["https://music.apple.com/hu/album/example/123456789?i=234567890", "apple"],
  ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=x", "youtube"],
  ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
])("normalizes supported song URL %s", (url, provider) => {
  const value = songLink(url);
  expect(value.provider).toBe(provider);
  expect(value.embedUrl).toMatch(/^https:\/\//);
});
test.each([
  "javascript:alert(1)",
  "http://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ",
  "https://open.spotify.com.evil.test/track/0Lr4kGOYn9l83EjuK6cZFQ",
  "https://youtube.com/redirect?v=dQw4w9WgXcQ",
  "https://open.spotify.com/playlist/0Lr4kGOYn9l83EjuK6cZFQ",
])("rejects unsupported music input %s", (url) => expect(() => songLink(url)).toThrow());
test("explicit animation preference overrides reduced motion while system mode respects it", () => {
  expect(reduceMotion("always", true, true, true)).toBe(false);
  expect(reduceMotion("system", false, true, false)).toBe(true);
  expect(reduceMotion("static", false, false, false)).toBe(true);
});
test("finds the current Apple Music card without coloring the game collection or profile", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<section class="card_games"><img/><span>Game Collection</span></section><section class="card_music"><header>Listening to Apple Music</header><div class="activity_inner"><img/><strong>Story of My Life</strong></div></section>';
  expect(isMusicActivity({ name: "Visual Studio Code", type: 0 })).toBe(false);
  expect(findMusicSurface(root, { name: "Apple Music", details: "Story of My Life" })?.className).toBe(
    "card_music",
  );
  const resolver = vi.fn().mockReturnValue("cover");
  expect(musicCover({ application_id: "app", assets: { large_image: "image" } }, resolver)).toBe("cover");
  expect(resolver).toHaveBeenCalledWith("app", "image", [512, 512]);
});
