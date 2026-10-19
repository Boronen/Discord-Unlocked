import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const repository = "Boronen/Discord-Unlocked";
const snowflake = /^\d{17,20}$/;
const tagPattern = /^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;

/** The same reviewed Markdown section is used on Pages, GitHub and Discord. */
export function releaseNotes(markdown, tag) {
  if (!tagPattern.test(tag)) throw new Error("Use an explicit release tag, for example v0.1.0-beta.2.");
  const section = markdown.split(/^## /m).find((part) => part.split(/\r?\n/, 1)[0].trim() === tag);
  const notes = section?.includes("\n") ? section.slice(section.indexOf("\n") + 1).trim() : undefined;
  if (!notes || /\bUNRELEASED\b/i.test(notes))
    throw new Error("Reviewed release notes are missing or unreleased.");
  const url = `https://github.com/${repository}/releases/tag/${tag}`;
  const content = `**Discord Unlocked ${tag}**\n\n${notes}\n\nDownload and full release: ${url}`;
  if (content.length > 2000) throw new Error("Keep the Discord release summary within 2,000 characters.");
  return { notes, content, url };
}

export function verifyRelease(release, tag, notes) {
  if (
    release.tag_name !== tag ||
    release.draft ||
    !release.published_at ||
    release.html_url !== `https://github.com/${repository}/releases/tag/${tag}` ||
    !release.assets?.length ||
    !release.body?.includes(notes)
  )
    throw new Error("Publish the matching reviewed notes and downloadable release before announcing it.");
}

/** Claim before sending: an ambiguous network failure must never trigger a second post. */
export async function announceUpdate({ rest, guild, channel, tag, content, directory, confirmMessage }) {
  if (!tagPattern.test(tag) || !snowflake.test(guild) || !snowflake.test(channel))
    throw new Error("A valid release tag, guild and announcements channel are required.");
  const destination = await rest.get(`/channels/${channel}`);
  if (destination.guild_id !== guild || ![0, 5].includes(destination.type))
    throw new Error("The configured destination must be a text/announcement channel in this community.");
  const bot = await rest.get("/users/@me");
  const hash = createHash("sha256").update(content).digest("hex");
  const identity = { guild, channel, tag, hash };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${guild}-${tag}.json`);
  if (confirmMessage) {
    try {
      await readFile(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") throw new Error("There is no pending announcement to reconcile.");
      throw error;
    }
  }
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let previous;
    try {
      previous = JSON.parse(await readFile(path, "utf8"));
    } catch {
      throw new Error("The announcement receipt is incomplete; reconcile it before retrying.");
    }
    if (Object.entries(identity).some(([key, value]) => previous[key] !== value))
      throw new Error("The release already has a different announcement receipt; do not overwrite it.");
    if (previous.status === "sent") return { sent: false, messageId: previous.messageId };
    if (!confirmMessage || !snowflake.test(confirmMessage))
      throw new Error(
        "Delivery is uncertain. Check the channel and reconcile with --confirm-message ID; no automatic resend.",
      );
    const message = await rest.get(`/channels/${channel}/messages/${confirmMessage}`);
    if (message.author?.id !== bot.id || message.content !== content)
      throw new Error("The reconciliation message must be this bot's exact release announcement.");
    // An exclusive reconciliation claim prevents concurrent receipt writers.
    const lock = await open(`${path}.reconcile`, "wx", 0o600);
    try {
      const receipt = await open(path, "r+");
      try {
        await receipt.truncate(0);
        await receipt.writeFile(JSON.stringify({ ...identity, status: "sent", messageId: message.id }));
        await receipt.sync();
      } finally {
        await receipt.close();
      }
    } finally {
      await lock.close();
    }
    return { sent: false, messageId: message.id, reconciled: true };
  }
  try {
    await handle.writeFile(JSON.stringify({ ...identity, status: "pending" }));
    await handle.sync();
    if (confirmMessage) throw new Error("There is no pending announcement to reconcile.");
    const message = await rest.post(`/channels/${channel}/messages`, {
      body: {
        content,
        allowed_mentions: { parse: [] },
        nonce: createHash("sha256").update(`${guild}:${tag}`).digest("hex").slice(0, 25),
        enforce_nonce: true,
      },
    });
    if (!snowflake.test(message.id)) throw new Error("Discord returned no valid message receipt.");
    await handle.truncate(0);
    await handle.write(JSON.stringify({ ...identity, status: "sent", messageId: message.id }), 0, "utf8");
    await handle.sync();
    return { sent: true, messageId: message.id };
  } finally {
    await handle.close();
  }
}

async function main() {
  const [tag, ...flags] = process.argv.slice(2);
  const confirmIndex = flags.indexOf("--confirm-message");
  const confirmMessage = confirmIndex < 0 ? undefined : flags[confirmIndex + 1];
  const allowed = new Set(["--apply", "--confirm-message", ...(confirmMessage ? [confirmMessage] : [])]);
  if (
    flags.some((flag) => !allowed.has(flag)) ||
    (confirmIndex >= 0 && !snowflake.test(confirmMessage ?? ""))
  )
    throw new Error("Usage: node scripts/announce-update.mjs TAG [--apply] [--confirm-message ID]");
  const { notes, content } = releaseNotes(await readFile("docs/PATCH-NOTES.md", "utf8"), tag);
  if (!flags.includes("--apply")) {
    console.log(content);
    return;
  }
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Discord-Unlocked-release" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("The public GitHub release could not be verified.");
  verifyRelease(await response.json(), tag, notes);
  const { config } = await import("dotenv");
  config({ path: "secrets/bot.env", quiet: true });
  const { REST } = await import("discord.js");
  const env = process.env;
  if (!env.DISCORD_BOT_TOKEN)
    throw new Error("Load the bot environment locally; never pass a token on the command line.");
  let channel = env.UPDATE_CHANNEL_ID;
  if (!channel) {
    const state = JSON.parse(await readFile("secrets/discord-community-state.json", "utf8"));
    if (state.guild !== env.GUILD_ID) throw new Error("The saved community belongs to a different guild.");
    channel = state.channels?.announcements;
  }
  const result = await announceUpdate({
    rest: new REST({ version: "10", retries: 0 }).setToken(env.DISCORD_BOT_TOKEN),
    guild: env.GUILD_ID,
    channel,
    tag,
    content,
    confirmMessage,
    directory: resolve("secrets/update-announcements"),
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(() => {
    // REST errors may contain headers or request data; keep credentials out of logs.
    console.error(
      "Release announcement failed. Check release notes, destination permissions and the local receipt. An uncertain send requires manual reconciliation; never delete the receipt to retry blindly.",
    );
    process.exitCode = 1;
  });
