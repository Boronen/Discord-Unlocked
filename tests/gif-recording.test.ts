// @vitest-environment jsdom
import { vi, it, expect, afterEach } from "vitest";
import { recordProfileGif } from "../packages/plugin/gif-recording.js";
const capture = vi.hoisted(() => ({ width: 450, height: 600, snapshot: vi.fn(), close: vi.fn() }));
vi.mock("../packages/plugin/profile-export.js", () => ({ createProfileCapture: () => capture }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
function setup() {
  vi.useFakeTimers();
  capture.snapshot.mockResolvedValue({ svg: "<svg/>" });
  return {
    begin: vi.fn(async () => "recording"),
    frame: vi.fn(async () => {}),
    finish: vi.fn(async () => true),
    cancel: vi.fn(async () => {}),
  };
}
it("records bounded incremental frames with monotonic timestamps and cleans up", async () => {
  const native = setup();
  const result = recordProfileGif(
    document.body,
    async () => "",
    native,
    new AbortController().signal,
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(4200);
  expect(await result).toBe(true);
  expect(native.frame.mock.calls.length).toBe(32);
  expect(native.finish).toHaveBeenCalledWith("recording", 4000);
  expect(capture.close).toHaveBeenCalledOnce();
  expect(native.cancel).not.toHaveBeenCalled();
});
it("cancels a pending recording and never finalizes the file", async () => {
  const native = setup(),
    controller = new AbortController();
  const result = recordProfileGif(document.body, async () => "", native, controller.signal, vi.fn());
  const rejected = expect(result).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(150);
  controller.abort();
  await rejected;
  expect(native.finish).not.toHaveBeenCalled();
  expect(native.cancel).toHaveBeenCalledWith("recording");
  expect(capture.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it("cleans up after a failed native frame and save-dialog cancellation", async () => {
  const native = setup();
  native.frame.mockRejectedValueOnce(new Error("Render failed."));
  await expect(
    recordProfileGif(document.body, async () => "", native, new AbortController().signal, vi.fn()),
  ).rejects.toThrow("Render failed.");
  expect(native.cancel).toHaveBeenCalledWith("recording");
  expect(native.finish).not.toHaveBeenCalled();
  native.begin.mockResolvedValueOnce(null as any);
  expect(
    await recordProfileGif(document.body, async () => "", native, new AbortController().signal, vi.fn()),
  ).toBe(false);
  expect(capture.close).toHaveBeenCalledTimes(2);
});
