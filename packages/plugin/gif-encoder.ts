import { GIFEncoder, quantize, applyPalette } from "./third-party/gifenc.js";

import { GIF_LIMITS } from "./export-limits.js";
export { GIF_LIMITS } from "./export-limits.js";

/** Incremental encoder: only one unencoded bitmap is retained, never the whole recording. */
export class CardGif {
  private encoder = GIFEncoder();
  private previous?: { rgba: Uint8Array; time: number };
  private count = 0;
  private finished = false;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > GIF_LIMITS.width ||
      height > GIF_LIMITS.height ||
      width * height > GIF_LIMITS.pixels
    )
      throw new Error("The GIF exceeds its image limits.");
  }
  add(bgra: Uint8Array, time: number) {
    if (
      this.finished ||
      this.count >= GIF_LIMITS.frames ||
      bgra.length !== this.width * this.height * 4 ||
      !Number.isFinite(time) ||
      time < 0 ||
      time > GIF_LIMITS.duration ||
      (this.previous ? time <= this.previous.time : time !== 0)
    )
      throw new Error("The GIF exceeds its recording limits.");
    if (this.previous) this.write(time - this.previous.time);
    const rgba = new Uint8Array(bgra.length);
    for (let i = 0; i < bgra.length; i += 4) {
      const alpha = bgra[i + 3]!;
      // Electron supplies premultiplied BGRA on Windows. GIF has one-bit alpha.
      const factor = alpha ? 255 / alpha : 0;
      rgba[i] = Math.min(255, Math.round(bgra[i + 2]! * factor));
      rgba[i + 1] = Math.min(255, Math.round(bgra[i + 1]! * factor));
      rgba[i + 2] = Math.min(255, Math.round(bgra[i]! * factor));
      rgba[i + 3] = alpha < 128 ? 0 : 255;
    }
    this.previous = { rgba, time };
    this.count++;
  }
  private write(delay: number) {
    const rgba = this.previous!.rgba;
    const palette = quantize(rgba, 256, { format: "rgba4444", oneBitAlpha: true });
    const index = applyPalette(rgba, palette, "rgba4444");
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    this.encoder.writeFrame(index, this.width, this.height, {
      palette,
      delay: Math.max(20, Math.round(delay / 10) * 10),
      repeat: 0,
      dispose: 2,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
    if (this.encoder.bytesView().length > GIF_LIMITS.bytes)
      throw new Error("The GIF exceeds its recording memory budget.");
  }
  finish(time: number) {
    if (
      this.finished ||
      !this.previous ||
      !Number.isFinite(time) ||
      time <= this.previous.time ||
      time > GIF_LIMITS.duration
    )
      throw new Error("The GIF recording is incomplete.");
    this.write(time - this.previous.time);
    this.finished = true;
    this.previous = undefined;
    this.encoder.finish();
    return this.encoder.bytes();
  }
}
