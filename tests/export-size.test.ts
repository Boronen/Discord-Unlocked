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
