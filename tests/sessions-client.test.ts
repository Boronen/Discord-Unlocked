import { expect, test, vi } from "vitest";
import { StudioClient, diagnosticOrigin, type SessionStorage } from "../packages/plugin/client.js";
const id = "100000000000000001",
  token = "a".repeat(43),
  base = "http://localhost:3100";
test("diagnostics never expose credentials, query parameters or URL fragments", () => {
  expect(diagnosticOrigin("https://name:password@example.com/path?key=private#private")).toBe(
    "https://example.com",
  );
  expect(diagnosticOrigin("invalid")).toBe("Invalid API URL");
});
function storage(): SessionStorage {
  return {
    load: vi.fn().mockResolvedValue(token),
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}
test("restores a saved session after client restart and removes it on logout", async () => {
  const persisted = storage();
  const transport = vi.fn().mockResolvedValue({ status: 200, body: JSON.stringify({ userId: id }) });
  const client = new StudioClient(base, transport, persisted);
  expect(await client.restore(id)).toBe(true);
  expect(client.token).toBe(token);
  expect(persisted.load).toHaveBeenCalledWith(id, base);
  await client.logout();
  expect(persisted.remove).toHaveBeenCalledWith(id, base);
  expect(client.token).toBeUndefined();
});
test("sign-out immediately removes viewer access while remote revocation is pending", async () => {
  let complete!: (value: any) => void;
  const persisted = storage(),
    transport = vi.fn(async (_base: string, path: string) =>
      path === "/v1/auth/logout"
        ? new Promise<any>((resolve) => {
            complete = resolve;
          })
        : { status: 200, body: JSON.stringify({ userId: id }) },
    );
  const client = new StudioClient(base, transport, persisted);
  await client.restore(id);
  const signingOut = client.logout();
  expect(client.token).toBeUndefined();
  expect(client.canView).toBe(false);
  expect(await client.restore(id)).toBe(false);
  complete({ status: 200, body: "{}" });
  await signingOut;
  expect(persisted.remove).toHaveBeenCalledWith(id, base);
});
test("deletes expired sessions, but keeps saved credentials during an outage", async () => {
  const persisted = storage();
  let expired = false;
  const client = new StudioClient(
    base,
    async () => ({ status: expired ? 401 : 503, body: JSON.stringify({ message: "unavailable" }) }),
    persisted,
  );
  await expect(client.restore(id)).rejects.toThrow("unavailable");
  expect(persisted.remove).not.toHaveBeenCalled();
  client.disconnect();
  expired = true;
  expect(await client.restore(id)).toBe(false);
  expect(persisted.remove).toHaveBeenCalledWith(id, base);
});
test("a late restored account cannot replace a newly selected account", async () => {
  let load!: (token: string) => void;
  const persisted = storage();
  persisted.load = vi.fn(
    () =>
      new Promise<string | null>((resolve) => {
        load = resolve;
      }),
  );
  const transport = vi.fn();
  const client = new StudioClient(base, transport, persisted);
  const restoring = client.restore(id);
  client.disconnect();
  load(token);
  expect(await restoring).toBe(false);
  expect(client.token).toBeUndefined();
  expect(transport).not.toHaveBeenCalled();
});
test("pairing persists only the current account and still completes if local encryption fails", async () => {
  const persisted = storage();
  persisted.save = vi.fn().mockRejectedValue(new Error("encrypted store unavailable"));
  const client = new StudioClient(
    base,
    async (_b, path) => ({
      status: 200,
      body: JSON.stringify(
        path.endsWith("pair")
          ? { id: "pair", code: "code", pollSecret: "secret", expiresIn: 300 }
          : { ready: true, token, userId: id },
      ),
    }),
    persisted,
  );
  await client.pair(id);
  expect(await client.poll("pair", "secret")).toBe(true);
  expect(client.token).toBe(token);
  expect(client.persistenceError).toContain("encrypted storage");
  expect(persisted.save).toHaveBeenCalledWith(id, base, token);
});
test("profile reads wait for restore and authentication is retained for privacy after beta access is lost", async () => {
  let finish!: (value: string) => void;
  const persisted = storage();
  persisted.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const transport = vi.fn(async (_base: string, path: string) => ({
    status: 200,
    body: JSON.stringify(path === "/v1/me" ? { userId: id } : { profiles: {} }),
  }));
  const client = new StudioClient(base, transport, persisted),
    restoring = client.restore(id);
  await client.profiles([id]);
  expect(transport).not.toHaveBeenCalled();
  finish(token);
  await restoring;
  expect(client.canView).toBe(true);
  await client.profiles([id]);
  expect(transport.mock.calls.at(-1)?.[1]).toContain("/v1/profiles");
  transport.mockResolvedValueOnce({
    status: 403,
    body: JSON.stringify({ code: "BETA_ROLE_REQUIRED", message: "Beta role required." }),
  });
  await expect(client.profiles([id])).rejects.toMatchObject({ status: 403 });
  expect(client.canView).toBe(false);
  expect(client.token).toBe(token);
  await client.exportData();
  expect(transport.mock.calls.at(-1)?.[1]).toBe("/v1/privacy/export");
});
