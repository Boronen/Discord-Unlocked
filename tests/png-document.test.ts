import { expect, test } from "vitest";
import { pngDocument } from "../packages/plugin/png-document.js";

test("large inline artwork is served in the response body, never in the navigation URL", async () => {
  const svg = `<svg><!--${"a".repeat(3 * 1024 * 1024)}--></svg>`;
  const document = pngDocument(svg);
  expect(document.url.length).toBeLessThan(100);
  expect(document.url).not.toContain("data:");
  const response = document.respond({ url: document.url, method: "GET" });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  const html = await response.text();
  const payload = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html)![1]!;
  expect(Buffer.from(payload, "base64").toString()).toBe(svg);
});

test("only the private document and inline images are allowed; other resources cannot escape", () => {
  const document = pngDocument("<svg/>");
  const request = { url: document.url, method: "GET", resourceType: "mainFrame" };
  expect(document.allows(request)).toBe(true);
  expect(document.allows({ ...request, resourceType: "subFrame" })).toBe(false);
  expect(document.allows({ ...request, method: "POST" })).toBe(false);
  expect(document.allows({ ...request, url: document.url + "?extra" })).toBe(false);
  expect(document.allows({ ...request, url: "https://example.com/" })).toBe(false);
  expect(document.allows({ ...request, url: "file:///private.txt" })).toBe(false);
  expect(document.allows({ ...request, url: "data:text/html,hello" })).toBe(false);
  expect(document.allows({ ...request, url: "data:image/png;base64,AA==", resourceType: "image" })).toBe(
    true,
  );
  expect(document.allows({ ...request, resourceType: "script" })).toBe(false);
  expect(document.respond({ ...request, url: "https://example.com/" }).status).toBe(403);
  expect(document.respond({ ...request, method: "POST" }).status).toBe(403);
  expect(document.respond({ ...request, url: pngDocument("<svg/>").url }).status).toBe(403);
});
