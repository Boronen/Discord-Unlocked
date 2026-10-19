import { test } from "node:test";
import assert from "node:assert/strict";
import { PermissionFlagsBits as P } from "discord.js";
import {
  channelPermissions,
  communityMessages,
  validateSetup,
  sameAccess,
} from "../scripts/discord-community.mjs";

const ids = { guild: "guild", bot: "bot", beta: "beta", mod: "mod" };
function canView(kind, roles) {
  const overrides = channelPermissions(kind, ids);
  let permissions = P.ViewChannel | P.SendMessages;
  const everyone = overrides.find((o) => o.id === ids.guild);
  permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  const matching = overrides.filter((o) => o.type === 0 && roles.includes(o.id));
  for (const item of matching) permissions &= ~BigInt(item.deny);
  for (const item of matching) permissions |= BigInt(item.allow);
  return !!(permissions & P.ViewChannel);
}
test("visitors and supporters cannot see beta/staff channels; moderators only see profile reviews", () => {
  for (const kind of ["owner", "review", "member", "voice"]) {
    assert.equal(canView(kind, []), false);
    assert.equal(canView(kind, ["supporter"]), false);
  }
  assert.equal(canView("member", [ids.beta]), true);
  assert.equal(canView("review", [ids.beta]), false);
  assert.equal(canView("review", [ids.mod]), true);
  assert.equal(canView("owner", [ids.mod, ids.beta]), false);
  assert.equal(canView("information", []), true);
  assert.equal(canView("application", []), true);
});
test("read-only welcome blocks messages and thread bypass; no permission grants Administrator", () => {
  const everyone = channelPermissions("information", ids)[0];
  for (const bit of [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.SendMessagesInThreads])
    assert.ok(BigInt(everyone.deny) & bit);
  for (const kind of ["information", "application", "member", "owner", "review", "voice"])
    for (const overwrite of channelPermissions(kind, ids))
      assert.equal(BigInt(overwrite.allow) & P.Administrator, 0n);
});
test("setup refuses wrong owner, missing configured roles, inadequate rights and unsafe role hierarchy", () => {
  const env = {
    GUILD_ID: "guild",
    OWNER_ID: "owner",
    MODERATOR_ROLE_ID: "mod",
    BETA_ROLE_ID: "beta",
    MODERATION_CHANNEL_ID: "review",
  };
  const fixture = {
    server: { id: "guild", owner_id: "owner" },
    bot: { roles: ["bot-role"] },
    channels: [{ id: "review" }],
    roles: [
      { id: "guild", position: 0, permissions: "0" },
      {
        id: "bot-role",
        position: 3,
        managed: true,
        permissions: (P.ManageChannels | P.ManageRoles).toString(),
      },
      { id: "mod", position: 2, permissions: "0" },
      { id: "beta", position: 1, permissions: "0" },
    ],
  };
  assert.doesNotThrow(() => validateSetup(fixture, env));
  assert.throws(() => validateSetup(fixture, { ...env, OWNER_ID: "someone-else" }));
  assert.throws(() => validateSetup(fixture, { ...env, BETA_ROLE_ID: "missing" }));
  const denied = structuredClone(fixture);
  denied.roles[1].permissions = "0";
  assert.throws(() => validateSetup(denied, env), /Temporarily/);
  const hierarchy = structuredClone(fixture);
  hierarchy.roles[2].position = 4;
  assert.throws(() => validateSetup(hierarchy, env), /above/);
  const admin = structuredClone(fixture);
  admin.roles[2].permissions = P.Administrator.toString();
  assert.throws(() => validateSetup(admin, env), /Administrator/);
});
test("welcome messages are bounded, explain manual admission and never require credentials", () => {
  for (const content of Object.values(communityMessages())) assert.ok(content.length <= 2000);
  assert.match(communityMessages()["beta-access"], /owner reviews requests/);
  assert.match(communityMessages().contributing, /no payment/);
});

test("retries retain legacy mention denials without ignoring access changes or extra grants", () => {
  const desired = channelPermissions("review", ids);
  const legacy = structuredClone(desired);
  for (const o of legacy) o.deny = (BigInt(o.deny) | P.MentionEveryone).toString();
  assert.equal(sameAccess(legacy.reverse(), desired), true);
  const exposed = structuredClone(legacy);
  const everyone = exposed.find((o) => o.id === ids.guild);
  everyone.deny = (BigInt(everyone.deny) & ~P.ViewChannel).toString();
  assert.equal(sameAccess(exposed, desired), false);
  const extraGrant = structuredClone(desired);
  extraGrant[0].allow = (BigInt(extraGrant[0].allow) | P.MentionEveryone).toString();
  assert.equal(sameAccess(extraGrant, desired), false);
});
