import { afterEach, expect, test, vi } from "vitest";
import { downloadAttachment } from "../packages/server/media.js";
import { mediaFailureMessage } from "../packages/server/media.js";
import { displayMediaError } from "../packages/server/media-errors.js";

afterEach(() => vi.unstubAllGlobals());

test("displays older system-generated upload errors in English", () => {
  expect(
    displayMediaError("A média nem dekódolható vagy túllépte a feldolgozási keretet. Tölts fel másik fájlt."),
  ).toContain("could not be decoded");
  expect(displayMediaError(null)).toBeNull();
  expect(displayMediaError("Upload an MP3, WAV or OGG audio file.")).toBe(
    "Upload an MP3, WAV or OGG audio file.",
  );
});

test("reports full worker scratch storage separately from invalid media", () => {
  expect(mediaFailureMessage(new Error("wbuffer_write: No space left on device"))).toContain(
    "temporary storage",
  );
  expect(mediaFailureMessage(new Error("unsupported image format"))).toContain("could not be decoded");
});

test.each(["attachments", "ephemeral-attachments"])(
  "downloads Discord %s while preserving the signed URL and forbidding redirects",
  async (route) => {
    const url = `https://cdn.discordapp.com/${route}/123/456/avatar.gif?ex=abc&is=def&hm=signature`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([71, 73, 70])));
    vi.stubGlobal("fetch", fetchMock);
    expect(await downloadAttachment(url)).toEqual(Buffer.from("GIF"));
    expect(fetchMock).toHaveBeenCalledWith(url, {
      redirect: "error",
      signal: expect.any(AbortSignal),
    });
  },
);

test.each([
  "https://cdn.discordapp.com.evil.example/ephemeral-attachments/a",
  "https://evil.example/ephemeral-attachments/a",
  "https://cdn.discordapp.com/avatars/a",
  "https://cdn.discordapp.com/ephemeral-attachments-evil/a",
  "http://cdn.discordapp.com/ephemeral-attachments/a",
  "https://user:password@cdn.discordapp.com/ephemeral-attachments/a",
  "https://cdn.discordapp.com:8443/ephemeral-attachments/a",
])("rejects unsupported attachment URL %s before making a request", async (url) => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(downloadAttachment(url)).rejects.toMatchObject({ code: "INVALID_ATTACHMENT" });
  expect(fetchMock).not.toHaveBeenCalled();
});
