import { afterEach, expect, test } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../packages/server/app.js";
import { loadPrivacyNotice, privacyNotice } from "../packages/server/privacy-notice.js";
import { FileStore } from "../packages/server/media.js";
import { setup } from "./helpers.js";
import { StudioClient } from "../packages/plugin/client.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
const deployment = {
  updatedAt: "2026-10-18",
  operator: { name: "Test operator", email: "privacy@example.com", country: "Test jurisdiction" },
  legalBasis: "A reviewed test basis.",
  providers: [{ name: "Test provider", purpose: "Encrypted backups", location: "Verified test location" }],
  rights: "Contact the operator for verified rights requests.",
};

test("public notice needs no session and cannot open adjacent own-data routes", async () => {
  const context = await setup();
  cleanups.push(() => context.raw.close());
  const app = await createApp(
    context.service,
    new FileStore("unused-notice-test"),
    false,
    false,
    true,
    privacyNotice(deployment),
  );
  cleanups.unshift(() => app.close());
  const result = await app.inject({ method: "GET", url: "/v1/privacy/notice" });
  expect(result.statusCode).toBe(200);
  expect(result.headers["cache-control"]).toBe("no-store");
  expect(result.json()).toMatchObject({ configured: true, operator: deployment.operator });
  expect(result.body).not.toMatch(/DATABASE_URL|token_hash|storage_key|userId/);
  for (const [method, url, payload] of [
    ["GET", "/v1/privacy/export", undefined],
    ["GET", "/v1/privacy/media/00000000-0000-4000-8000-000000000000", undefined],
    ["DELETE", "/v1/privacy/account", { confirmation: "DELETE MY ACCOUNT" }],
    ["GET", "/v1/profiles?ids=100000000000000002", undefined],
  ] as const)
    expect((await app.inject({ method, url, payload })).statusCode).toBe(401);
});

test("notice is explicitly incomplete by default; unknown/private and placeholder fields are rejected", () => {
  expect(privacyNotice()).toMatchObject({
    configured: false,
    operator: null,
    legalBasis: null,
    providers: [],
  });
  expect(() => privacyNotice({ ...deployment, token: "private" })).toThrow();
  expect(() =>
    privacyNotice({ ...deployment, operator: { ...deployment.operator, name: "REPLACE operator" } }),
  ).toThrow();
});

test("configured file is bounded, strictly parsed and failures reveal no file content/path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ps-notice-")),
    file = join(dir, "notice.json");
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await writeFile(file, JSON.stringify(deployment));
  expect((await loadPrivacyNotice(file)).configured).toBe(true);
  await writeFile(file, "sensitive-fake-content".repeat(3000));
  await expect(loadPrivacyNotice(file)).rejects.toThrow(
    /^The public privacy notice is invalid or unreadable\./,
  );
  await expect(loadPrivacyNotice(dir)).rejects.toThrow(
    /^The public privacy notice is invalid or unreadable\./,
  );
});

test("client fetches public notice without sending the remembered token or clearing the session on an old server", async () => {
  const calls: unknown[][] = [];
  const client = new StudioClient("https://example.com", async (...args) => {
    calls.push(args);
    return { status: 404, body: "{}" };
  });
  client.token = "private-session";
  await expect(client.privacyNotice()).rejects.toThrow("privacy notice is unavailable");
  expect(calls[0]![4]).toBeUndefined();
  expect(client.token).toBe("private-session");
});
