export interface TintStyle {
  color: string;
  intensity: number;
}
function hex(h: number, lightness: number) {
  const s = 0.85,
    l = lightness / 100,
    a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
const hues = [
  "Red",
  "Orange",
  "Amber",
  "Lime",
  "Green",
  "Mint",
  "Cyan",
  "Azure",
  "Blue",
  "Violet",
  "Magenta",
  "Rose",
];
export const TINT_PALETTE = [
  ...hues.flatMap((name, index) => [
    { name, color: hex(index * 30, 55) },
    { name: `Light ${name.toLowerCase()}`, color: hex(index * 30, 70) },
  ]),
  { name: "White", color: "#ffffff" },
  { name: "Silver", color: "#c0c0c0" },
  { name: "Charcoal", color: "#444444" },
  { name: "Black", color: "#000000" },
];
export const isBasicTint = (color: string) => TINT_PALETTE.some((item) => item.color === color.toLowerCase());
/** Interpolate RGB luminance toward the selected hue, leaving alpha untouched. */
export function tintMatrix(tint: TintStyle): string {
  const amount = Math.min(1, Math.max(0, tint.intensity));
  const rgb = [1, 3, 5].map((start) => parseInt(tint.color.slice(start, start + 2), 16) / 255);
  const luminance = [0.2126, 0.7152, 0.0722];
  return [
    ...rgb.flatMap((channel, row) => [
      ...luminance.map((weight, col) =>
        Number((channel * weight * amount + (row === col ? 1 - amount : 0)).toFixed(6)),
      ),
      0,
      0,
    ]),
    0,
    0,
    0,
    1,
    0,
  ].join(" ");
}
export function tagDecorationTint(source: string, tint?: TintStyle | null) {
  if (!tint || !tint.intensity) return source;
  const url = new URL(source);
  url.hash = `ps-tint=${tint.color.slice(1).toLowerCase()}-${Math.round(tint.intensity * 100)}`;
  return url.toString();
}
