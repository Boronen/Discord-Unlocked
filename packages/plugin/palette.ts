export function luminance(hex: string) {
  const components = [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return components[0]! * 0.2126 + components[1]! * 0.7152 + components[2]! * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function textOn(background: string) {
  return contrast(background, "#ffffff") >= contrast(background, "#000000") ? "#ffffff" : "#000000";
}
export function artworkPalette(pixels: Uint8ClampedArray | Uint8Array) {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) < 160) continue;
    const r = pixels[i]!,
      g = pixels[i + 1]!,
      b = pixels[i + 2]!;
    const maximum = Math.max(r, g, b),
      minimum = Math.min(r, g, b);
    if (maximum < 24 || minimum > 235) continue;
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    const weight = 1 + (maximum - minimum) / 255;
    bucket.count += weight;
    bucket.r += r * weight;
    bucket.g += g * weight;
    bucket.b += b * weight;
    buckets.set(key, bucket);
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return null;
  const hex = (factor: number) =>
    "#" +
    [dominant.r, dominant.g, dominant.b]
      .map((v) =>
        Math.round((v / dominant.count) * factor)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const background = hex(0.32),
    accent = hex(1);
  return { background, accent, text: textOn(background) };
}
