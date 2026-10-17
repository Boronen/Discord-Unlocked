import { createProfileCapture } from "./profile-export.js";
export interface GifExporter {
  begin(width: number, height: number): Promise<string | null>;
  frame(id: string, svg: string, time: number): Promise<void>;
  finish(id: string, time: number): Promise<boolean>;
  cancel(id: string): Promise<void>;
}
function wait(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("Export cancelled."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function recordProfileGif(
  card: HTMLElement,
  loadArtwork: (url: string) => Promise<string>,
  native: GifExporter,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  const capture = createProfileCapture(card, loadArtwork, true);
  let id: string | null = null;
  let hiddenDuringRecording = false;
  const hidden = () => {
    if (document.hidden && id) {
      hiddenDuringRecording = true;
      void native.cancel(id).catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", hidden);
  const abort = () => {
    if (id) void native.cancel(id).catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await capture.snapshot(); // Load and validate artwork before opening the save dialog.
    signal.throwIfAborted();
    id = await native.begin(capture.width, capture.height);
    if (!id) return false;
    signal.throwIfAborted();
    const start = performance.now();
    let time = 0;
    for (let frame = 0; frame < 32; frame++) {
      signal.throwIfAborted();
      if (document.hidden || hiddenDuringRecording)
        throw new Error("The preview was hidden. Keep Discord visible while exporting GIF.");
      const sample = await capture.snapshot(time);
      signal.throwIfAborted();
      await native.frame(id, sample.svg, time);
      const elapsed = performance.now() - start;
      progress(Math.min(1, elapsed / 4000));
      if (elapsed >= 4000 || frame === 31) break;
      await wait(Math.max(0, 125 - (elapsed - time)), signal);
      const nextTime = Math.round(performance.now() - start);
      if (nextTime >= 4000) break;
      time = nextTime;
    }
    signal.throwIfAborted();
    const saved = await native.finish(id, 4000);
    id = null;
    return saved;
  } catch (error) {
    if (hiddenDuringRecording)
      throw new Error("The preview was hidden. Keep Discord visible while exporting GIF.");
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    document.removeEventListener("visibilitychange", hidden);
    capture.close();
    if (id) await native.cancel(id).catch(() => {});
  }
}
