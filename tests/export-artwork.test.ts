// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { ExportArtwork } from "../packages/plugin/export-artwork.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture(frameCount: number, duration = (index: number) => 10000) {
  const decoded: number[] = [];
  const drawn: number[] = [];
  const closeFrame = vi.fn(),
    closeDecoder = vi.fn();
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 32;
      naturalHeight = 32;
      async decode() {}
    },
  );
  const OriginalURL = URL;
  vi.stubGlobal(
    "URL",
    class extends OriginalURL {
      static createObjectURL() {
        return "blob:export-fixture";
      }
      static revokeObjectURL() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      blob: async () => ({ size: 128, type: "image/gif", arrayBuffer: async () => new ArrayBuffer(128) }),
    })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage(image: { index?: number }) {
      if (image.index !== undefined) drawn.push(image.index);
    },
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,fixture");
  vi.stubGlobal(
    "ImageDecoder",
    class {
      static async isTypeSupported() {
        return true;
      }
      tracks = { ready: Promise.resolve(), selectedTrack: { frameCount } };
      async decode({ frameIndex }: { frameIndex: number }) {
        decoded.push(frameIndex);
        return {
          image: {
            index: frameIndex,
            displayWidth: 32,
            displayHeight: 32,
            duration: duration(frameIndex),
            close: closeFrame,
          },
        };
      }
      close = closeDecoder;
    },
  );
  return { decoded, drawn, closeFrame, closeDecoder };
}

test("long source animations export only requested samples instead of failing at 500 source frames", async () => {
  const f = fixture(10000);
  const loader = vi.fn(async () => "data:image/gif;base64,fixture");
  const artwork = new ExportArtwork(loader, true);
  try {
    for (const time of [0, 125, 3875])
      expect(await artwork.raster("https://cdn.discordapp.com/long.gif", time)).toContain("data:image/");
    expect(f.drawn).toEqual([0, 12, 387]);
    expect(Math.max(...f.decoded)).toBe(387);
    expect(f.decoded.length).toBeLessThan(400);
    expect(f.closeFrame).toHaveBeenCalledTimes(f.decoded.length);
    expect(loader).toHaveBeenCalledOnce();
  } finally {
    artwork.close();
  }
  await Promise.resolve();
  expect(f.closeDecoder).toHaveBeenCalledOnce();
});

test("short variable-duration animations still loop at their actual duration", async () => {
  const f = fixture(2, (index) => (index === 0 ? 20000 : 40000));
  const artwork = new ExportArtwork(async () => "data:image/gif;base64,fixture", true);
  try {
    for (const time of [0, 35, 65]) await artwork.raster("data:image/gif;base64,fixture", time);
    expect(f.drawn).toEqual([0, 1, 0]);
    expect(f.closeFrame).toHaveBeenCalledTimes(f.decoded.length);
  } finally {
    artwork.close();
  }
});

test("closing a long-animation capture releases the decoder and rejects further sampling", async () => {
  const f = fixture(10000);
  const artwork = new ExportArtwork(async () => "data:image/gif;base64,fixture", true);
  await artwork.raster("data:image/gif;base64,fixture", 0);
  artwork.close();
  await expect(artwork.raster("data:image/gif;base64,fixture", 100)).rejects.toThrow();
  expect(f.closeDecoder).toHaveBeenCalledOnce();
});
