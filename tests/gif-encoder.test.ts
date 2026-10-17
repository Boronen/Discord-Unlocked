import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { CardGif } from "../packages/plugin/gif-encoder.js";
function bitmap(color: number[]) {
  const data = new Uint8Array(100 * 100 * 4);
  for (let i = 4; i < data.length; i += 4) data.set(color, i);
  return data;
}
describe("card GIF", () => {
  it("encodes distinct frames, loop, actual timing and transparent corners", async () => {
    const gif = new CardGif(100, 100);
    gif.add(bitmap([0, 0, 255, 255]), 0);
    gif.add(bitmap([0, 255, 0, 255]), 250);
    const bytes = gif.finish(1000);
    const image = sharp(bytes, { animated: true });
    const metadata = await image.metadata();
    expect(metadata.pages).toBe(2);
    expect(metadata.delay).toEqual([250, 750]);
    expect(metadata.loop).toBe(0);
    const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    expect([...data.subarray(4, 8)]).toEqual([255, 0, 0, 255]);
    expect([...data.subarray(100 * 100 * 4 + 4, 100 * 100 * 4 + 8)]).toEqual([0, 255, 0, 255]);
    expect(() => gif.add(bitmap([0, 0, 0, 255]), 2000)).toThrow(/limits/);
  });
  it("bounds dimensions, frame count, timestamps and incomplete recordings", () => {
    expect(() => new CardGif(451, 100)).toThrow(/limits/);
    expect(() => new CardGif(100, 8193)).toThrow(/limits/);
    const gif = new CardGif(100, 100);
    expect(() => gif.finish(100)).toThrow(/incomplete/);
    expect(() => gif.add(bitmap([0, 0, 0, 255]), 1)).toThrow(/limits/);
    gif.add(bitmap([0, 0, 0, 255]), 0);
    expect(() => gif.add(new Uint8Array(4), 100)).toThrow(/limits/);
    expect(() => gif.add(bitmap([0, 0, 0, 255]), 0)).toThrow(/limits/);
    for (let i = 1; i < 32; i++) gif.add(bitmap([0, 0, 0, 255]), i * 100);
    expect(() => gif.add(bitmap([0, 0, 0, 255]), 3200)).toThrow(/limits/);
    expect(() => gif.finish(8001)).toThrow(/incomplete/);
  });
});
