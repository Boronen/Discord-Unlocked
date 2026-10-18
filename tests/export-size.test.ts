import { expect, test } from "vitest";
import { cardExportSize, GIF_LIMITS } from "../packages/plugin/export-limits.js";
test.each([500, 1600, 3000, 8000, 20000])(
  "fits every panel of a %ipx card into GIF without cropping or the old height rejection",
  (height) => {
    const size = cardExportSize(height, true);
    expect(size.width).toBeLessThanOrEqual(450);
    expect(size.height).toBeLessThanOrEqual(GIF_LIMITS.height);
    expect(size.width * size.height).toBeLessThanOrEqual(GIF_LIMITS.pixels);
    expect(size.height).toBe(Math.ceil(height * size.scale));
    expect(size.height).toBeGreaterThan(0);
  },
);
test("retains high-resolution PNG size and rejects missing dimensions", () => {
  expect(cardExportSize(500, false)).toEqual({ width: 900, height: 1500, scale: 3 });
  expect(() => cardExportSize(0, true)).toThrow();
});

test.each([240, 304, 600])("preserves the actual %ipx profile width and fits every panel", (width) => {
  const height = 1400;
  const gif = cardExportSize(height, true, width);
  expect(gif.width).toBeLessThanOrEqual(450);
  expect(Math.abs(gif.height / gif.width - height / width)).toBeLessThan(0.01);
  const png = cardExportSize(20000, false, width);
  expect(png.height).toBeLessThanOrEqual(4000);
  expect(png.width * png.height).toBeLessThanOrEqual(8000000);
});
