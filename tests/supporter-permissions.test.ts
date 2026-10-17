import { afterEach, expect, test, vi } from "vitest";
import { discordPermissions } from "../packages/server/permissions.js";
import type { Config } from "../packages/server/config.js";
afterEach(() => vi.unstubAllGlobals());
test("Discord supporter role is checked freshly for writes, moderator is not a substitute", async () => {
  const config = {
    OWNER_ID: "100000000000000001",
    BETA_ROLE_ID: "100000000000000002",
    SUPPORTER_ROLE_ID: "100000000000000003",
    MODERATOR_ROLE_ID: "100000000000000004",
    GUILD_ID: "100000000000000005",
    DISCORD_BOT_TOKEN: "fixture",
  } as Config;
  let roles = [config.BETA_ROLE_ID, config.SUPPORTER_ROLE_ID];
  const request = vi.fn(
    async () =>
      new Response(JSON.stringify({ roles }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", request);
  const permissions = discordPermissions(config);
  expect(await permissions.canUseCustomTint!("100000000000000006")).toBe(true);
  roles = [config.BETA_ROLE_ID, config.MODERATOR_ROLE_ID];
  expect(await permissions.canUseCustomTint!("100000000000000006", false)).toBe(true);
  expect(await permissions.canUseCustomTint!("100000000000000006", true)).toBe(false);
  expect(await permissions.canUseCustomTint!(config.OWNER_ID)).toBe(true);
  const noRole = discordPermissions({ ...config, SUPPORTER_ROLE_ID: undefined });
  expect(await noRole.canUseCustomTint!("100000000000000006")).toBe(false);
  request.mockImplementation(async () => new Response("", { status: 503 }));
  await expect(permissions.canUseCustomTint!("100000000000000006", true)).rejects.toMatchObject({
    code: "DISCORD_UNAVAILABLE",
  });
});
