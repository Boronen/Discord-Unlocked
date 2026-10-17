import { contrast, textOn } from "./palette.js";

function mix(a: string, b: string, amount: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(a.slice(offset, offset + 2), 16) * (1 - amount) +
            parseInt(b.slice(offset, offset + 2), 16) * amount,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Opaque text surfaces keep artwork and animated effects from changing contrast. */
export function profileReadability(colors?: [string, string] | null) {
  const valid = colors?.every((color) => /^#[a-f\d]{6}$/i.test(color));
  const base = valid ? mix(colors![0], colors![1], 0.5) : "#2b2d31";
  const foreground = textOn(base);
  const end = foreground === "#ffffff" ? "#000000" : "#ffffff";
  let surface = base;
  for (let step = 0; contrast(surface, foreground) < 7 && step <= 100; step++)
    surface = mix(base, end, step / 100);
  let secondary = foreground;
  for (let step = 1; step <= 25; step++) {
    const candidate = mix(foreground, surface, step / 100);
    if (contrast(surface, candidate) < 4.5) break;
    secondary = candidate;
  }
  return {
    "--ps-profile-text": foreground,
    "--ps-profile-secondary": secondary,
    "--ps-profile-surface": surface,
  };
}
