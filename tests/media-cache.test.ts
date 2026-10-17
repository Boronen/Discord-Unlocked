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
