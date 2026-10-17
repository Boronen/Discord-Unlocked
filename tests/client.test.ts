import { it, expect, vi, afterEach } from "vitest";
import { ProfileAudio } from "../packages/plugin/audio.js";
import { artworkPalette, contrast, textOn } from "../packages/plugin/palette.js";
import { ProfileCache } from "../packages/plugin/cache.js";
afterEach(() => vi.useRealTimers());
it("plays audio once, stops on profile switch, and offers retry after blocked autoplay", async () => {
  const created: {
    src: string;
    volume: number;
    currentTime: number;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
  }[] = [];
  const controller = new ProfileAudio((src) => {
    const audio = {
      src,
      volume: 0,
      currentTime: 0,
      pause: vi.fn(),
      play: vi.fn().mockRejectedValueOnce(new Error("autoplay")).mockResolvedValue(undefined),
    };
    created.push(audio);
    return audio;
  });
  expect(await controller.open("a", "a.ogg", 0.25)).toBe(true);
  await controller.open("a", "a.ogg", 0.25);
  expect(created).toHaveLength(1);
  expect(await controller.retry("a")).toBe(false);
  await controller.open("b", "b.ogg", 0.25);
  expect(created[0]!.pause).toHaveBeenCalled();
  controller.close("a");
  expect(created[1]!.pause).not.toHaveBeenCalled();
  controller.stop();
  expect(created[1]!.pause).toHaveBeenCalled();
});
it("cancels late playback when a profile was closed during play()", async () => {
  let resolve!: () => void;
  const audio = {
    src: "a.ogg",
    volume: 0,
    currentTime: 0,
    pause: vi.fn(),
    play: () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  };
  const controller = new ProfileAudio(() => audio);
  const opening = controller.open("a", "a.ogg", 0.25);
  controller.close("a");
  resolve();
  await opening;
  expect(audio.src).toBe("");
  expect(audio.pause).toHaveBeenCalled();
});
it("extracts album colors with readable text and handles empty covers", () => {
  const palette = artworkPalette(new Uint8Array([230, 30, 60, 255, 230, 30, 60, 255, 0, 0, 0, 0]));
  expect(palette?.accent).toBe("#e61e3c");
  expect(contrast(palette!.background, palette!.text)).toBeGreaterThanOrEqual(4.5);
  expect(artworkPalette(new Uint8Array([255, 255, 255, 0]))).toBeNull();
  expect(textOn("#ffffff")).toBe("#000000");
});
it("batches demand, preserves last known data on errors, and applies revocation", async () => {
  vi.useFakeTimers();
  let fail = false;
  const profile = { userId: "100000000000000001" } as any;
  const fetcher = vi.fn(async (ids: string[]) => {
    if (fail) throw new Error("offline");
    return Object.fromEntries(ids.map((id) => [id, profile]));
  });
  const cache = new ProfileCache(fetcher);
  cache.start();
  const stop = cache.observe(profile.userId, () => {});
  await vi.advanceTimersByTimeAsync(40);
  expect(cache.get(profile.userId)).toEqual(profile);
  fail = true;
  cache.want(profile.userId);
  await vi.advanceTimersByTimeAsync(40);
  expect(cache.get(profile.userId)).toEqual(profile);
  fail = false;
  fetcher.mockImplementationOnce(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, null])));
  cache.want(profile.userId);
  await vi.advanceTimersByTimeAsync(40);
  expect(cache.get(profile.userId)).toBeNull();
  stop();
  cache.stop();
});
