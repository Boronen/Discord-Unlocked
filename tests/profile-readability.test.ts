import { expect, test } from "vitest";
import { contrast } from "../packages/plugin/palette.js";
import { profileReadability } from "../packages/plugin/profile-readability.js";

test("profile content has opaque, contrasting text surfaces across arbitrary user colors", () => {
  const colors = ["#000000", "#ffffff", "#ff0000", "#c3f0d7", "#777777", "#202f33", "#ffff00", "#121a62"];
  for (const a of colors)
    for (const b of colors) {
      const tokens = profileReadability([a, b]);
      expect(contrast(tokens["--ps-profile-text"], tokens["--ps-profile-surface"])).toBeGreaterThanOrEqual(7);
      expect(
        contrast(tokens["--ps-profile-secondary"], tokens["--ps-profile-surface"]),
      ).toBeGreaterThanOrEqual(4.5);
    }
  expect(profileReadability(["#ffffff", "#ffffdd"])["--ps-profile-text"]).toBe("#000000");
  expect(profileReadability(["#101014", "#202f33"])["--ps-profile-text"]).toBe("#ffffff");
  expect(profileReadability()).toEqual(profileReadability(["invalid", "invalid"]));
});
