import { TINT_PALETTE } from "./tint.js";
export function nearestBasic(hex: string) {
  const distance = (v: string) =>
    [1, 3, 5].reduce(
      (sum, i) => sum + (parseInt(v.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16)) ** 2,
      0,
    );
  return TINT_PALETTE.reduce((best, c) => (distance(c.color) < distance(best.color) ? c : best)).color;
}
function mix(a: string, b: string, ratio: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - ratio) + parseInt(b.slice(i, i + 2), 16) * ratio)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function colorProposals(palette: { background: string; accent: string; text: string }) {
  return [
    {
      name: "Subtle",
      primary: mix(palette.background, "#15171c", 0.55),
      secondary: mix(palette.accent, "#15171c", 0.8),
      accent: mix(palette.accent, "#b8bdc9", 0.3),
      intensity: 0.25,
    },
    {
      name: "Balanced",
      primary: palette.background,
      secondary: mix(palette.accent, palette.background, 0.6),
      accent: palette.accent,
      intensity: 0.55,
    },
    {
      name: "Vivid",
      primary: mix(palette.background, palette.accent, 0.25),
      secondary: mix(palette.accent, "#10121b", 0.4),
      accent: mix(palette.accent, "#ffffff", 0.12),
      intensity: 0.85,
    },
  ];
}
