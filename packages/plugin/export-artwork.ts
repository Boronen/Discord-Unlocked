interface Decoder {
  tracks: { ready: Promise<void>; selectedTrack?: { frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<{ image: VideoFrame }>;
  close(): void;
}
type DecoderClass = {
  new (options: {
    data: ArrayBuffer;
    type: string;
    preferAnimation: boolean;
    desiredWidth?: number;
    desiredHeight?: number;
  }): Decoder;
  isTypeSupported(type: string): Promise<boolean>;
};
type Asset = { image: HTMLImageElement; decoder?: Decoder; durations: number[]; frames: number };

/** Reused by all samples so animated images are decoded at the requested recording time. */
export class ExportArtwork {
  private assets = new Map<string, Promise<Asset>>();
  private bytes = 0;
  private pixels = 0;
  private decodedPixels = 0;
  private closed = false;
  constructor(
    private load: (url: string) => Promise<string>,
    private animated: boolean,
  ) {}
  private async open(src: string): Promise<Asset> {
    const data = src.startsWith("blob:") || src.startsWith("data:image/") ? src : await this.load(src);
    if (!data.startsWith("blob:") && !data.startsWith("data:image/"))
      throw new Error("An export image is unavailable.");
    const blob = await fetch(data).then((response) => response.blob());
    this.bytes += blob.size;
    if (this.closed || this.bytes > (this.animated ? 128 : 20) * 1024 * 1024)
      throw new Error("The export contains too much artwork. Try a simpler preset.");
    const url = URL.createObjectURL(blob),
      image = new Image();
    try {
      image.src = url;
      await image.decode();
    } finally {
      URL.revokeObjectURL(url);
    }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16_000_000)
      throw new Error("Export images exceed their decoded size limit. Try a simpler preset.");
    if (this.animated) {
      const factor = Math.min(1, 450 / image.naturalWidth, 4096 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = canvas.toDataURL("image/webp", 0.92);
      await image.decode();
    }
    this.pixels += image.naturalWidth * image.naturalHeight;
    if (this.closed || this.pixels > (this.animated ? 64_000_000 : 16_000_000))
      throw new Error("Export images exceed their decoded size limit.");
    const Decoder = (globalThis as typeof globalThis & { ImageDecoder?: DecoderClass }).ImageDecoder;
    if (this.animated && !Decoder)
      throw new Error("Animated image decoding is unavailable in this client. Use PNG instead.");
    const asset: Asset = { image, durations: [], frames: 1 };
    if (this.animated && Decoder && (await Decoder.isTypeSupported(blob.type))) {
      const decoder = new Decoder({
        data: await blob.arrayBuffer(),
        type: blob.type,
        preferAnimation: true,
        ...(this.animated ? { desiredWidth: image.naturalWidth, desiredHeight: image.naturalHeight } : {}),
      });
      try {
        await decoder.tracks.ready;
        asset.frames = decoder.tracks.selectedTrack?.frameCount ?? 1;
        // Source length is not export length. raster() reads duration metadata
        // lazily only up to the requested four-second recording timestamp.
        // Keep byte/pixel/decode budgets instead of rejecting long animations.
        if (asset.frames > 1 && !this.closed) asset.decoder = decoder;
        else decoder.close();
      } catch (error) {
        decoder.close();
        throw error;
      }
    }
    if (this.closed) {
      asset.decoder?.close();
      throw new Error("Export cancelled.");
    }
    return asset;
  }
  async raster(src: string, time: number, characterBudget = Infinity) {
    let pending = this.assets.get(src);
    if (!pending) {
      pending = this.open(src);
      this.assets.set(src, pending);
    }
    const asset = await pending;
    if (this.closed) throw new Error("Export cancelled.");
    let frame: VideoFrame | undefined;
    try {
      if (asset.decoder) {
        let total = asset.durations.reduce((sum, duration) => sum + duration, 0);
        while (asset.durations.length < asset.frames && total <= time) {
          this.checkDecode(asset);
          const decoded = await asset.decoder.decode({ frameIndex: asset.durations.length });
          const duration = Math.max(10, (decoded.image.duration ?? 100000) / 1000);
          decoded.image.close();
          asset.durations.push(duration);
          total += duration;
        }
        const position = asset.durations.length === asset.frames ? time % total : time;
        let end = 0,
          index = 0;
        for (; index < asset.durations.length - 1; index++) {
          end += asset.durations[index]!;
          if (position < end) break;
        }
        this.checkDecode(asset);
        frame = (await asset.decoder.decode({ frameIndex: index })).image;
      }
      const width = frame?.displayWidth ?? asset.image.naturalWidth;
      const height = frame?.displayHeight ?? asset.image.naturalHeight;
      const factor = Math.min(1, (this.animated ? 450 : 900) / width, (this.animated ? 4096 : 1600) / height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * factor));
      canvas.height = Math.max(1, Math.round(height * factor));
      const draw = () =>
        canvas.getContext("2d")!.drawImage(frame ?? asset.image, 0, 0, canvas.width, canvas.height);
      draw();
      let result = this.animated ? canvas.toDataURL("image/webp", 0.92) : canvas.toDataURL("image/png");
      while (
        this.animated &&
        result.length > Math.max(1024, characterBudget) &&
        (canvas.width > 1 || canvas.height > 1)
      ) {
        canvas.width = Math.max(1, Math.floor(canvas.width * 0.75));
        canvas.height = Math.max(1, Math.floor(canvas.height * 0.75));
        draw();
        result = canvas.toDataURL("image/webp", 0.92);
      }
      return result;
    } finally {
      frame?.close();
    }
  }
  private checkDecode(asset: Asset) {
    this.decodedPixels += asset.image.naturalWidth * asset.image.naturalHeight;
    if (this.closed || this.decodedPixels > 512_000_000)
      throw new Error("The animation exceeds its decoding budget. Try fewer layers or PNG.");
  }
  close() {
    this.closed = true;
    for (const pending of this.assets.values())
      void pending.then(
        (asset) => asset.decoder?.close(),
        () => {},
      );
    this.assets.clear();
  }
}
