import { afterEach, expect, test, vi } from "vitest";
import { MediaUrlCache } from "../packages/plugin/media-cache.js";
import { StudioClient } from "../packages/plugin/client.js";

afterEach(() => vi.restoreAllMocks());

test("renders native-loaded blobs instead of exposing local HTTP URLs to Discord", async () => {
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:approved");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const notify = vi.fn();
  let finish!: (value: Blob) => void;
  const download = vi.fn(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
  );
  const cache = new MediaUrlCache(download, notify);
  const source = "http://localhost:3100/v1/media/11111111-1111-4111-8111-111111111111";
  expect(cache.resolve(source, "alice")).toBeUndefined();
  expect(cache.resolve(source, "bob")).toBeUndefined();
  expect(download).toHaveBeenCalledTimes(1);
  finish(new Blob(["image"], { type: "image/webp" }));
  await vi.waitFor(() => expect(notify).toHaveBeenCalledWith("alice"));
  expect(notify).toHaveBeenCalledWith("bob");
  expect(cache.resolve(source, "alice")).toBe("blob:approved");
  expect(create).toHaveBeenCalledTimes(1);
  cache.clear();
  expect(revoke).toHaveBeenCalledWith("blob:approved");
});

test("does not resurrect in-flight media after plugin stop", async () => {
  const create = vi.spyOn(URL, "createObjectURL");
  const notify = vi.fn();
  let finish!: (value: Blob) => void;
  const cache = new MediaUrlCache(
    () =>
      new Promise<Blob>((resolve) => {
        finish = resolve;
      }),
    notify,
  );
  cache.resolve("http://localhost:3100/v1/media/a", "alice");
  cache.clear();
  finish(new Blob(["image"]));
  await Promise.resolve();
  expect(create).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
});

test("downloads server media with Authorization only through the native bridge", async () => {
  const transport = vi.fn().mockResolvedValue({ status: 200, body: btoa("image"), mime: "image/webp" });
  const client = new StudioClient("http://localhost:3100", transport);
  client.token = "viewer-session";
  client.accessAllowed = true;
  const path = "/v1/media/11111111-1111-4111-8111-111111111111";
  const blob = await client.publicMedia(`http://localhost:3100${path}`);
  expect(blob.type).toBe("image/webp");
  expect(transport).toHaveBeenCalledWith(client.base, path, "GET", undefined, "viewer-session", true);
  await expect(client.publicMedia("https://evil.example" + path)).rejects.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
});

test("bounds 80 observed downloads, coalesces duplicates and retains every active blob", async () => {
  const live = new Set<string>();
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const url = `blob:${live.size}`;
    live.add(url);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    live.delete(url);
  });
  let release!: () => void,
    loading = 0,
    peak = 0,
    downloads = 0;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const observed = new Set(["alice"]);
  const cache = new MediaUrlCache(
    async () => {
      downloads++;
      peak = Math.max(peak, ++loading);
      await gate;
      loading--;
      return new Blob([new Uint8Array(128 * 1024)]);
    },
    () => {},
    (id) => observed.has(id),
    { bytes: 1024 * 1024 },
  );
  for (let i = 0; i < 80; i++) cache.resolve(`media:${i}`, "alice");
  for (let i = 0; i < 20; i++) cache.resolve("media:0", "alice");
  expect(downloads).toBe(4);
  release();
  await vi.waitFor(() => expect(live.size).toBe(80));
  expect(peak).toBe(4);
  expect(downloads).toBe(80);
  expect(cache.sizeBytes).toBe(80 * 128 * 1024);
  observed.clear();
  cache.prune();
  expect(cache.sizeBytes).toBeLessThanOrEqual(1024 * 1024);
  cache.clear();
  expect(live.size).toBe(0);
  expect(cache.sizeBytes).toBe(0);
});

test("independent leases protect active URLs while idle blobs follow a byte LRU", async () => {
  let serial = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${serial++}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const download = vi.fn(async () => new Blob([new Uint8Array(8)]));
  const cache = new MediaUrlCache(download, undefined, undefined, { bytes: 8, entries: 1 });
  const first = new AbortController(),
    second = new AbortController(),
    third = new AbortController();
  const a = await cache.acquire("a", first.signal);
  expect(await cache.acquire("a", second.signal)).toBe(a);
  const b = await cache.acquire("b", third.signal);
  expect(cache.sizeBytes).toBe(16);
  first.abort();
  expect(revoke).not.toHaveBeenCalled();
  second.abort();
  expect(revoke).toHaveBeenCalledWith(a);
  expect(revoke).not.toHaveBeenCalledWith(b);
  expect(download).toHaveBeenCalledTimes(2);
  third.abort();
  cache.clear();
  expect(cache.sizeBytes).toBe(0);
});

test("clear cancels queued work, rejects leases and never resets outstanding native slots", async () => {
  const pending: ((blob: Blob) => void)[] = [];
  const download = vi.fn(
    () =>
      new Promise<Blob>((done) => {
        pending.push(done);
      }),
  );
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:new");
  const cache = new MediaUrlCache(download, undefined, undefined, { concurrent: 1, queued: 2 });
  const results = Promise.allSettled([cache.acquire("old"), cache.acquire("queued")]);
  cache.clear();
  expect((await results).every((r) => r.status === "rejected")).toBe(true);
  const next = cache.acquire("new");
  expect(download).toHaveBeenCalledTimes(1);
  pending.shift()!(new Blob(["stale"]));
  await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2));
  expect(create).not.toHaveBeenCalled();
  pending.shift()!(new Blob(["new"]));
  expect(await next).toBe("blob:new");
  cache.clear();
});

test("abandoning a queue releases its slot and a surviving consumer still receives shared media", async () => {
  const pending: ((blob: Blob) => void)[] = [];
  const download = vi.fn(
    () =>
      new Promise<Blob>((done) => {
        pending.push(done);
      }),
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:shared");
  const cache = new MediaUrlCache(download, undefined, undefined, { concurrent: 1, queued: 1 });
  const a = new AbortController(),
    b = new AbortController(),
    c = new AbortController();
  const first = cache.acquire("shared", a.signal);
  const second = cache.acquire("shared", b.signal);
  const queued = cache.acquire("abandoned", c.signal);
  const failures = Promise.allSettled([first, queued]);
  a.abort();
  c.abort();
  pending.shift()!(new Blob(["shared"]));
  expect(await second).toBe("blob:shared");
  expect((await failures).every((r) => r.status === "rejected")).toBe(true);
  expect(download).toHaveBeenCalledTimes(1);
  cache.clear();
});

test("private previews coalesce native downloads and cannot reappear after an access-loss clear", async () => {
  let finish!: (response: { status: number; body: string; mime: string }) => void;
  const transport = vi.fn(
    () =>
      new Promise<{ status: number; body: string; mime: string }>((done) => {
        finish = done;
      }),
  );
  const create = vi.spyOn(URL, "createObjectURL");
  const client = new StudioClient("http://localhost:3100", transport);
  client.token = "session";
  const url = client.base + "/v1/media/11111111-1111-4111-8111-111111111111";
  const results = Promise.allSettled([client.privateMedia(url), client.privateMedia(url)]);
  expect(transport).toHaveBeenCalledTimes(1);
  client.clearBlobs();
  finish({ status: 200, body: btoa("image"), mime: "image/webp" });
  expect((await results).every((r) => r.status === "rejected")).toBe(true);
  await Promise.resolve();
  expect(create).not.toHaveBeenCalled();
});

test("private cached media cannot cross a token change even before another request emits state", async () => {
  let serial = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:${++serial}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const transport = vi.fn().mockResolvedValue({ status: 200, body: btoa("image"), mime: "image/webp" });
  const client = new StudioClient("http://localhost:3100", transport);
  const url = client.base + "/v1/media/11111111-1111-4111-8111-111111111111";
  client.token = "first";
  const first = await client.privateMedia(url);
  client.token = "second";
  const second = await client.privateMedia(url);
  expect(second).not.toBe(first);
  expect(revoke).toHaveBeenCalledWith(first);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1]![4]).toBe("second");
  client.clearBlobs();
});
