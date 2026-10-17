// Behavioral cache probe with synthetic blobs; no network or operator media.
import { MediaUrlCache } from "../../packages/plugin/media-cache.js";
import { mkdir, writeFile } from "node:fs/promises";
const live = new Map<string, number>();
const create = URL.createObjectURL,
  revoke = URL.revokeObjectURL;
let serial = 0,
  downloads = 0,
  pending = 0,
  peakConcurrentDownloads = 0;
URL.createObjectURL = (blob) => {
  const key = `blob:assessment-${serial++}`;
  live.set(key, blob.size);
  return key;
};
URL.revokeObjectURL = (url) => {
  live.delete(url);
};
const bytes = new Uint8Array(128 * 1024);
let release: () => void = () => {};
const gate = new Promise<void>((done) => {
  release = done;
});
const cache = new MediaUrlCache(
  async () => {
    downloads++;
    pending++;
    peakConcurrentDownloads = Math.max(peakConcurrentDownloads, pending);
    await gate;
    pending--;
    return new Blob([bytes]);
  },
  () => {},
  () => true,
);
try {
  for (let i = 0; i < 80; i++) cache.resolve(`https://assessment.invalid/media/${i}`, "observed-user");
  for (let i = 0; i < 20; i++) cache.resolve("https://assessment.invalid/media/0", "observed-user");
  release();
  await new Promise((done) => setTimeout(done, 30));
  const result = {
    at: new Date().toISOString(),
    kind: "Actual MediaUrlCache with 80 synthetic 128 KiB blobs; every owner observed; no HTTP",
    downloads,
    peakConcurrentDownloads,
    liveObjectUrls: live.size,
    liveBlobBytes: [...live.values()].reduce((a, b) => a + b, 0),
    duplicateRequestsCoalesced: downloads === 80,
  };
  cache.clear();
  Object.assign(result, { liveAfterClear: live.size });
  if (downloads !== 80 || live.size !== 0) throw new Error("Cache probe invariant failed");
  await mkdir("diagnostics/refactor-stage0", { recursive: true });
  await writeFile("diagnostics/refactor-stage0/media.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  cache.clear();
  URL.createObjectURL = create;
  URL.revokeObjectURL = revoke;
}
