export function GIFEncoder(): {
  writeFrame(
    index: Uint8Array,
    width: number,
    height: number,
    options: {
      palette: number[][];
      delay: number;
      repeat: number;
      dispose: number;
      transparent: boolean;
      transparentIndex: number;
    },
  ): void;
  bytesView(): Uint8Array;
  finish(): void;
  bytes(): Uint8Array;
};
export function quantize(
  rgba: Uint8Array,
  colors: number,
  options: {
    format: "rgba4444";
    oneBitAlpha: boolean;
  },
): number[][];
export function applyPalette(rgba: Uint8Array, palette: number[][], format: "rgba4444"): Uint8Array;
