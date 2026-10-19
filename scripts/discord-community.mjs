import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(resolve("package.json"));
const { REST, Routes, PermissionFlagsBits: P } = require("discord.js");
const bits = (...values) => values.reduce((a, b) => a | b, 0n);
const writing = bits(
  P.SendMessages,
  P.SendMessagesInThreads,
  P.CreatePublicThreads,
  P.CreatePrivateThreads,
  P.AttachFiles,
  P.EmbedLinks,
);
const memberChat = bits(
  P.ViewChannel,
  P.ReadMessageHistory,
  P.SendMessages,
  P.AddReactions,
  P.EmbedLinks,
  P.AttachFiles,
  P.UseApplicationCommands,
);
const botChat = memberChat;

/** Complete overwrites intentionally replace inherited grants on managed channels. */
export function channelPermissions(kind, ids) {
  const overwrite = (id, allow, deny = 0n, type = 0) => ({
    id,
    type,
    allow: allow.toString(),
    deny: deny.toString(),
  });
  const everyoneDeny =
    kind === "information"
      ? writing
      : kind === "application"
        ? bits(
            P.AttachFiles,
            P.EmbedLinks,
            P.CreatePublicThreads,
            P.CreatePrivateThreads,
            P.SendMessagesInThreads,
          )
        : P.ViewChannel;
  const result = [
    overwrite(
      ids.guild,
      ["information", "application"].includes(kind)
        ? bits(P.ViewChannel, P.ReadMessageHistory, kind === "application" ? P.SendMessages : 0n)
        : 0n,
      everyoneDeny,
    ),
    overwrite(ids.bot, botChat, 0n, 1),
  ];
  if (kind === "member" || kind === "voice")
    result.push(overwrite(ids.beta, kind === "voice" ? bits(memberChat, P.Connect, P.Speak) : memberChat));
  if (kind === "review") result.push(overwrite(ids.mod, memberChat));
  // Supporter deliberately grants neither beta admission nor staff-channel access.
  return result;
}

/** Preserve harmless legacy extra mass-mention denials when access is already correct. */
export function sameAccess(existing = [], desired) {
  const normalize = (list) =>
    list
      .map((o) => ({
        id: o.id,
        type: o.type,
        allow: BigInt(o.allow).toString(),
        deny: (BigInt(o.deny) & ~P.MentionEveryone).toString(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalize(existing)) === JSON.stringify(normalize(desired));
}

function accessPatch(existing, desired) {
  return existing && sameAccess(existing.permission_overwrites, desired)
    ? {}
    : { permission_overwrites: desired };
}

export const categories = ["Start Here", "Community", "Studio", "Staff", "Lounge"];
export const channels = [
  {
    name: "welcome",
    category: "Start Here",
    access: "information",
    topic: "Discord Unlocked · Start here, then request beta access.",
  },
  {
    name: "rules",
    category: "Start Here",
    access: "information",
    topic: "Adults-only invited beta · Respect privacy and other creators.",
  },
  {
    name: "get-started",
    category: "Start Here",
    access: "information",
    topic: "Install the Windows client, pair your account and submit your first design.",
  },
  {
    name: "announcements",
    category: "Start Here",
    access: "information",
    topic: "Official releases and service updates. No automatic notification pings.",
  },
  {
    name: "contributing",
    category: "Start Here",
    access: "information",
    topic: "Code, design, ideas, testing and documentation · Supporter recognition.",
  },
  {
    name: "beta-access",
    category: "Start Here",
    access: "application",
    topic: "Request access here. Owner approval is manual; never post personal documents or credentials.",
  },
  {
    name: "general",
    category: "Community",
    access: "member",
    topic: "Community conversation for admitted beta members.",
  },
  {
    name: "profile-showcase",
    category: "Community",
    access: "member",
    topic: "Share your own profile designs. Sharing here is not profile approval.",
  },
  {
    name: "ideas",
    category: "Community",
    access: "member",
    topic: "Suggest a useful improvement and explain who it helps.",
  },
  {
    name: "bug-reports",
    category: "Community",
    access: "member",
    topic: "Reproduction steps, expected result and sanitized screenshots. Security reports go privately.",
  },
  {
    name: "help",
    category: "Community",
    access: "member",
    topic: "Installation and everyday support. Personal data requests belong in the private support mailbox.",
  },
  {
    name: "studio-commands",
    category: "Studio",
    access: "member",
    topic: "Use /profile connect, /profile upload and /profile status. Bot responses are private.",
  },
  {
    name: "profile-moderation",
    category: "Staff",
    access: "review",
    topic: "Private immutable profile review · Owner, profile moderators and DcU only.",
  },
  {
    name: "beta-moderation",
    category: "Staff",
    access: "owner",
    topic: "Owner-only admission and Supporter decisions. Keep request records minimal.",
  },
  {
    name: "profile-studio-alerts",
    category: "Staff",
    access: "owner",
    topic: "Owner-only operational failure/recovery alerts. Never paste tokens, keys or raw exports.",
  },
];

export function communityMessages() {
  const docs = "https://boronen.github.io/Discord-Unlocked/";
  const release = "https://github.com/Boronen/Discord-Unlocked/releases";
  return {
    welcome:
      "## Welcome to Discord Unlocked\nA community project for expressive Discord profiles. Start with **rules**, follow **get-started**, then request access in **beta-access**.\n\nThis is an invited **18+ beta**. Installing the plugin does not grant access. Admission is manual; the current community has no automatic or paid entry.\n\n[Documentation](" +
      docs +
      ") · [Downloads](" +
      release +
      ") · https://discord.gg/S42hjgbcCk",
    rules:
      "## Community rules\n1. Be respectful. No harassment, spam, impersonation or unsolicited promotion.\n2. This invited beta is for adults (18+) only. Do not post birth dates or identity documents.\n3. Share only content you may use. Respect creators and other members' copying permissions.\n4. Never post passwords, tokens, pairing codes, backup keys or someone else's personal information.\n5. Profile changes require approval. Server access and Supporter recognition do not bypass moderation.\n6. This is an independent hobby project, not endorsed by Discord. Client modifications carry Discord account-policy risk.\n\nFor privacy requests or sensitive reports: **boronengames.support@gmail.com**. Read the [privacy notice](" +
      docs +
      "PRIVACY.html).",
    "get-started":
      "## Your first profile\n1. Read the rules and request admission in **beta-access**. The owner assigns **Beta Tester** after approval.\n2. Download **ProfileStudio-Windows-c40bfaba7d6b538a.zip** and **SHA256SUMS.txt** from [Releases](" +
      release +
      "). The automatic Source code archives are not the Windows installer.\n3. Verify the checksum, extract the ZIP, fully quit Discord and run **Install.cmd** as your normal Windows user. Git and Node are not required.\n4. Enable **ProfileStudio** and set API URL to **https://profilestudio.taile85078.ts.net**.\n5. Start pairing in the editor, then use **/profile connect** in **studio-commands**. Never post your code as a normal message.\n6. Save your design and submit it for review. Your previous approved appearance stays visible until approval.\n\n[Full installation guide](" +
      docs +
      "INSTALL-WINDOWS.html) · [User guide](" +
      docs +
      "USER-GUIDE.html)",
    announcements:
      "## Releases and service updates\nOfficial packages: " +
      release +
      "\nDocumentation: " +
      docs +
      "\n\nThe current release is a **beta**. Capacity testing beyond the accepted small-group checks is deferred; public downloads do not open community admission automatically. Service interruptions are possible on the self-hosted server.",
    contributing:
      "## Help shape Discord Unlocked\nUseful code, design, ideas, reproducible bug reports, testing, documentation and other accepted help can earn **Supporter** recognition. Explain your contribution in **ideas** or **bug-reports**, or submit a GitHub contribution.\n\nThe owner alone awards the role manually. There is no payment, automatic score, minimum code requirement or guaranteed award. Recognition is lasting; stopping contributions does not automatically remove it.\n\nSupporter enables **20 presets and 20 collections** instead of five each, plus custom HEX tints. Everyone retains **100 MiB** of media and the editor features. It grants no staff powers, automatic beta access or review bypass.\n\n[Contribution policy](" +
      docs +
      "CONTRIBUTING.html) · https://github.com/Boronen/Discord-Unlocked",
    "beta-access":
      "## Request beta access\nRead **rules** and **get-started**, then post a short request confirming that you are **18+**, have read the rules and want to join the beta. Do not provide a birth date, identity document, email address, pairing code or other private information here.\n\nThis channel is visible to visitors. The owner reviews requests and assigns **Beta Tester** manually. If admission is paused, a request does not guarantee a place. Privacy requests go to **boronengames.support@gmail.com** instead.",
  };
}

export async function inventory(rest, guild) {
  const me = await rest.get(Routes.user());
  const server = await rest.get(Routes.guild(guild));
  const roles = await rest.get(Routes.guildRoles(guild));
  const listed = await rest.get(Routes.guildChannels(guild));
  const bot = await rest.get(Routes.guildMember(guild, me.id));
  return { server, roles, channels: listed, bot };
}

function matching(list, predicate, label) {
  const found = list.filter(predicate);
  if (found.length > 1) throw new Error(`Ambiguous ${label}; resolve duplicates before setup.`);
  return found[0];
}

export function validateSetup(snapshot, env) {
  if (snapshot.server.id !== env.GUILD_ID || snapshot.server.owner_id !== env.OWNER_ID)
    throw new Error("Configured server/owner does not match Discord; no setup permitted.");
  for (const [key, list] of [
    ["MODERATOR_ROLE_ID", snapshot.roles],
    ["BETA_ROLE_ID", snapshot.roles],
    ["MODERATION_CHANNEL_ID", snapshot.channels],
  ])
    if (!env[key] || !list.some((x) => x.id === env[key])) throw new Error(`Missing configured ${key}.`);
  if (env.SUPPORTER_ROLE_ID && !snapshot.roles.some((r) => r.id === env.SUPPORTER_ROLE_ID))
    throw new Error("Configured Supporter role is missing; no replacement will be created silently.");
  for (const role of snapshot.roles)
    if (BigInt(role.permissions) & P.Administrator)
      throw new Error("An Administrator role bypasses private channels. Review it before setup.");
  const mine = snapshot.roles.filter((r) => r.id === env.GUILD_ID || snapshot.bot.roles.includes(r.id));
  const permissions = mine.reduce((n, r) => n | BigInt(r.permissions), 0n);
  const required = bits(P.ManageChannels, P.ManageRoles);
  const highest = Math.max(...mine.map((r) => r.position));
  for (const id of [env.MODERATOR_ROLE_ID, env.BETA_ROLE_ID, env.SUPPORTER_ROLE_ID].filter(Boolean)) {
    const role = snapshot.roles.find((r) => r.id === id);
    if (role.managed || role.position >= highest)
      throw new Error("Move the DcU bot role above managed community roles.");
  }
  if (!(permissions & P.Administrator) && (permissions & required) !== required)
    throw new Error(
      "Temporarily enable Manage Channels and Manage Roles for DcU; Administrator is unnecessary.",
    );
}

async function main() {
  const env = process.env;
  if (!env.DISCORD_BOT_TOKEN || !env.GUILD_ID) throw new Error("Load the existing bot environment locally.");
  const rest = new REST({ version: "10", retries: 2 }).setToken(env.DISCORD_BOT_TOKEN);
  const before = await inventory(rest, env.GUILD_ID);
  const apply = process.argv.includes("--apply");
  const statePath = resolve("secrets/discord-community-state.json");
  let state;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    state = { guild: env.GUILD_ID, categories: {}, channels: {}, messages: {} };
  }
  if (state.guild !== env.GUILD_ID) throw new Error("Community state belongs to a different server.");
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: "plan",
          guild: before.server.name,
          categories,
          channels: channels.map((c) => ({ name: c.name, access: c.access })),
          roles: ["Profile Moderator", "Beta Tester", "Supporter"],
          noDeletion: true,
          messageChannels: Object.keys(communityMessages()),
        },
        null,
        2,
      ),
    );
    return;
  }
  validateSetup(before, env);
  const reason = "Owner-requested Discord Unlocked community setup";
  const backup = resolve(
    "diagnostics/discord-community",
    new Date().toISOString().replaceAll(":", "-") + ".json",
  );
  await mkdir(join(backup, ".."), { recursive: true, mode: 0o700 });
  await writeFile(backup, JSON.stringify(before, null, 2), { mode: 0o600, flag: "wx" });
  const save = () => writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  const ids = {
    guild: env.GUILD_ID,
    bot: before.bot.user.id,
    beta: env.BETA_ROLE_ID,
    mod: env.MODERATOR_ROLE_ID,
  };

  // Remove mass mentions at the baseline, rather than denying the bot's own channel permission.
  const everyone = before.roles.find((r) => r.id === env.GUILD_ID);
  if (BigInt(everyone.permissions) & P.MentionEveryone)
    await rest.patch(Routes.guildRole(env.GUILD_ID, env.GUILD_ID), {
      body: { permissions: (BigInt(everyone.permissions) & ~P.MentionEveryone).toString() },
      reason,
    });

  // Seal existing sensitive channels before any reorganization or public welcome posts.
  for (const spec of channels.filter((c) => ["review", "owner"].includes(c.access))) {
    const existing =
      spec.name === "profile-moderation"
        ? before.channels.find((c) => c.id === env.MODERATION_CHANNEL_ID)
        : matching(before.channels, (c) => c.type === 0 && c.name === spec.name, spec.name);
    if (existing && !sameAccess(existing.permission_overwrites, channelPermissions(spec.access, ids)))
      await rest.patch(Routes.channel(existing.id), {
        body: { permission_overwrites: channelPermissions(spec.access, ids) },
        reason,
      });
  }
  let supporter = env.SUPPORTER_ROLE_ID
    ? before.roles.find((r) => r.id === env.SUPPORTER_ROLE_ID)
    : matching(before.roles, (r) => !r.managed && r.name.toLowerCase() === "supporter", "Supporter role");
  if (supporter && BigInt(supporter.permissions) !== 0n)
    throw new Error("Existing Supporter has server privileges; review it before changing recognition.");
  if (!supporter)
    supporter = await rest.post(Routes.guildRoles(env.GUILD_ID), {
      body: { name: "Supporter", permissions: "0", color: 0xe7b76b, hoist: true, mentionable: false },
      reason,
    });
  state.supporterRoleId = supporter.id;
  await save();
  for (const [id, name, color] of [
    [ids.mod, "Profile Moderator", 0x8fa2f4],
    [ids.beta, "Beta Tester", 0x65c9b6],
    [supporter.id, "Supporter", 0xe7b76b],
  ])
    await rest.patch(Routes.guildRole(env.GUILD_ID, id), {
      body: { name, color, hoist: true, mentionable: false },
      reason,
    });

  for (const [position, name] of categories.entries()) {
    let category = before.channels.find((c) => c.id === state.categories[name]);
    category ??= matching(
      before.channels,
      (c) =>
        c.type === 4 &&
        (c.name === name ||
          (name === "Community" && c.name === "Text Channels") ||
          (name === "Lounge" && c.name === "Voice Channels")),
      name,
    );
    const kind = name === "Start Here" ? "information" : name === "Staff" ? "owner" : "member";
    const body = { name, position, ...accessPatch(category, channelPermissions(kind, ids)) };
    category = category
      ? await rest.patch(Routes.channel(category.id), { body, reason })
      : await rest.post(Routes.guildChannels(env.GUILD_ID), { body: { ...body, type: 4 }, reason });
    state.categories[name] = category.id;
    await save();
  }
  for (const spec of channels) {
    let channel = before.channels.find((c) => c.id === state.channels[spec.name]);
    channel ??=
      spec.name === "profile-moderation"
        ? before.channels.find((c) => c.id === env.MODERATION_CHANNEL_ID)
        : matching(before.channels, (c) => c.type === 0 && c.name === spec.name, spec.name);
    const body = {
      name: spec.name,
      parent_id: state.categories[spec.category],
      topic: spec.topic,
      rate_limit_per_user: spec.access === "application" ? 30 : 0,
      ...accessPatch(channel, channelPermissions(spec.access, ids)),
    };
    if (channel) {
      channel = await rest.patch(Routes.channel(channel.id), { body, reason });
    } else {
      // Create with final explicit access first, then move under its category.
      // Inherited read-only category denies must not constrain creation of the request channel.
      const { parent_id, ...initial } = body;
      channel = await rest.post(Routes.guildChannels(env.GUILD_ID), {
        body: { ...initial, type: 0 },
        reason,
      });
      state.channels[spec.name] = channel.id;
      await save();
      channel = await rest.patch(Routes.channel(channel.id), { body: { parent_id }, reason });
    }
    state.channels[spec.name] = channel.id;
    await save();
  }
  // Keep the original voice channel and its messages/identity; restrict it to beta members.
  for (const voice of before.channels.filter((c) => c.type === 2 && c.name === "General"))
    await rest.patch(Routes.channel(voice.id), {
      body: { parent_id: state.categories.Lounge, ...accessPatch(voice, channelPermissions("voice", ids)) },
      reason,
    });
  for (const [name, content] of Object.entries(communityMessages())) {
    const channel = state.channels[name];
    const body = { content, allowed_mentions: { parse: [] } };
    let updated = false;
    if (state.messages[name]) {
      try {
        await rest.patch(Routes.channelMessage(channel, state.messages[name]), { body });
        updated = true;
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
    if (!updated) state.messages[name] = (await rest.post(Routes.channelMessages(channel), { body })).id;
    await save();
  }
  console.log(
    JSON.stringify({
      applied: true,
      guild: before.server.name,
      categories: Object.keys(state.categories).length,
      channels: Object.keys(state.channels).length,
      supporterRoleId: state.supporterRoleId,
      preservedModerationChannel: env.MODERATION_CHANNEL_ID,
      snapshot: backup,
      temporaryPermissionsMustBeRemoved: true,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    // Discord errors can include request bodies: never print token-bearing objects or headers.
    console.error(
      error.status
        ? `Discord setup request failed (HTTP ${error.status}, code ${error.code ?? "unknown"}, ${error.method ?? "request"} ${error.url ? new URL(error.url).pathname : "unknown route"}). Rerun after correcting access; saved state avoids duplicate channels/posts.`
        : error.message,
    );
    process.exitCode = 1;
  });
