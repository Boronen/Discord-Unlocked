import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Interaction,
} from "discord.js";
import { setTimeout } from "node:timers/promises";
import { runtime } from "../server/runtime.js";
import { downloadAttachment, enqueueMedia } from "../server/media.js";
import { mediaSlotSchema, uuid } from "../shared/schema.js";
import { AppError, invariant } from "../server/errors.js";
import { commands } from "./commands.js";
import { moderationMessage } from "./moderation.js";
import { AccountLimits } from "../server/limits.js";
import { hash } from "../server/service.js";
const context = await runtime("bot");
const { config, service, files } = context;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: "10" }).setToken(config.DISCORD_BOT_TOKEN);
const limits = new AccountLimits();
let downloading = false;
async function receiveAttachment(actor: string, url: string) {
  await service.permissions.member(actor, true);
  limits.check(actor, "upload", 10);
  invariant(!downloading, 429, "UPLOAD_BUSY", "Another file is being downloaded. Try again shortly.");
  downloading = true;
  try {
    return await downloadAttachment(url);
  } finally {
    downloading = false;
  }
}
await rest.put(Routes.applicationGuildCommands(config.DISCORD_APPLICATION_ID, config.GUILD_ID), {
  body: commands,
});

async function handle(interaction: Interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit()) return;
  invariant(
    interaction.guildId === config.GUILD_ID,
    403,
    "WRONG_GUILD",
    "Use this command in the community server.",
  );
  const actor = interaction.user.id;
  limits.check(actor, "command", 30);
  if (interaction.isChatInputCommand()) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const command = interaction.options.getSubcommand();
    if (interaction.commandName === "profile") {
      if (command === "connect") {
        await service.connect(interaction.options.getString("code", true), actor);
        await interaction.editReply("Account paired. Return to the plugin editor.");
      } else if (command === "confirm") {
        await service.confirmPublish(actor, interaction.options.getString("code", true));
        await interaction.editReply(
          "This exact draft is confirmed for one publication. Return to the editor and publish within five minutes.",
        );
      } else if (command === "upload") {
        const attachment = interaction.options.getAttachment("file", true);
        invariant(
          attachment.size <= 15 * 1024 * 1024,
          413,
          "FILE_SIZE",
          "Files must be no larger than 15 MiB.",
        );
        const asset = await enqueueMedia(
          service,
          files,
          actor,
          mediaSlotSchema.parse(interaction.options.getString("slot", true)),
          await receiveAttachment(actor, attachment.url),
          attachment.name,
        );
        await interaction.editReply(
          `Your file is queued for processing. Refresh files in the editor to see it.
Asset ID: \`${asset.id}\``,
        );
      } else {
        const state = await service.editor(actor);
        const latest = state.revisions[0];
        await interaction.editReply(
          `Published revision: ${state.published?.revisionId ?? "None yet"}
Latest submission: ${latest ? `${latest.id} — ${latest.status}${latest.reason ? ` (${latest.reason})` : ""}` : "None yet"}
Files: ${
            state.assets
              .slice(0, 5)
              .map((a) => `${a.slot}: ${a.status}${a.error ? ` — ${a.error}` : ""}`)
              .join("; ") || "None yet"
          }`,
        );
      }
      return;
    }
    await service.permissions.moderator(actor);
    if (command === "inspect") {
      const id = uuid.parse(interaction.options.getString("revision", true));
      await interaction.editReply(await moderationMessage(service, files, id));
    } else if (command === "restore") {
      await service.restore(actor, uuid.parse(interaction.options.getString("revision", true)));
      await interaction.editReply("Approved revision restored.");
    } else if (command === "revoke") {
      await service.revokeProfile(
        actor,
        interaction.options.getUser("user", true).id,
        interaction.options.getString("reason", true),
      );
      await interaction.editReply("Profile revoked. It will disappear for plugin users within 30 seconds.");
    } else if (command === "revoke-media") {
      await service.revokeMedia(
        actor,
        uuid.parse(interaction.options.getString("asset", true)),
        interaction.options.getString("reason", true),
      );
      await interaction.editReply("Media and the published profile using it have been revoked.");
    }
    return;
  }
  if (!interaction.customId.startsWith("ps:")) return;
  await service.permissions.moderator(actor);
  const [, action, rawId] = interaction.customId.split(":");
  const id = uuid.parse(rawId);
  if (interaction.isButton() && action === "reject") {
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`ps:reason:${id}`)
        .setTitle("Reject profile")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Reason for the submitter")
              .setStyle(TextInputStyle.Paragraph)
              .setMinLength(1)
              .setMaxLength(1000)
              .setRequired(true),
          ),
        ),
    );
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reject = interaction.isModalSubmit() && action === "reason";
  invariant(reject || action === "approve", 400, "BAD_ACTION", "Unknown action.");
  await service.decide(
    actor,
    id,
    reject ? "reject" : "approve",
    reject ? interaction.fields.getTextInputValue("reason") : undefined,
  );
  await interaction.editReply(
    reject ? "Revision rejected. Your reason has been saved." : "Revision approved and published.",
  );
  if (interaction.isButton()) await interaction.message.edit({ components: [] }).catch(() => {});
}
client.on("interactionCreate", (interaction) => {
  void handle(interaction).catch(async (error) => {
    const message =
      error instanceof AppError ? error.message : "The action failed. Check your input and try again.";
    console.error("Bot interaction failed:", error instanceof AppError ? error.code : "INTERNAL");
    if (!interaction.isRepliable()) return;
    if (interaction.replied || interaction.deferred) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
  });
});
let stopping = false;
client.once("clientReady", () => console.log("Profile Studio bot started."));
await client.login(config.DISCORD_BOT_TOKEN);
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});
while (!stopping) {
  try {
    const [expired] = await service.db.query(
      "SELECT id FROM moderation_messages WHERE erase=true OR created_at<now()-interval '30 days' ORDER BY created_at LIMIT 1",
    );
    if (expired) {
      const channel = await client.channels.fetch(config.MODERATION_CHANNEL_ID);
      invariant(
        channel?.isTextBased() && "messages" in channel,
        503,
        "CHANNEL_UNAVAILABLE",
        "The moderation channel is unavailable.",
      );
      await channel.messages.delete(expired.id).catch((error) => {
        if (error.code !== 10008) throw error;
      });
      await service.db.query("DELETE FROM moderation_messages WHERE id=$1", [expired.id]);
      continue;
    }
    const job = await service.db.transaction(async (tx) => {
      const [row] = await tx.query(
        "SELECT * FROM outbox WHERE delivered_at IS NULL AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
      );
      if (row)
        await tx.query(
          "UPDATE outbox SET lease_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=$1",
          [row.id],
        );
      return row;
    });
    if (!job) {
      await setTimeout(1500);
      continue;
    }
    if (job.kind === "moderation") {
      const channel = await client.channels.fetch(config.MODERATION_CHANNEL_ID);
      invariant(channel?.isSendable(), 503, "CHANNEL_UNAVAILABLE", "The moderation channel is unavailable.");
      const message = await channel.send({
        ...(await moderationMessage(service, files, job.payload.revisionId)),
        nonce: job.id.replaceAll("-", "").slice(0, 24),
        enforceNonce: true,
      });
      const [owner] = await service.db.query(
        "SELECT u.id,u.deleted_at FROM users u JOIN revisions r ON r.user_id=u.id WHERE r.id=$1",
        [job.payload.revisionId],
      );
      await service.db.query(
        "INSERT INTO moderation_messages(id,owner_hash,revision_id,erase) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [
          message.id,
          hash(owner?.id ?? job.payload.userId ?? "deleted"),
          job.payload.revisionId,
          !owner || !!owner.deleted_at,
        ],
      );
    } else if (job.kind === "style_moderation") {
      const [share] = await service.db.query(
        "SELECT sh.id FROM studio_shares sh JOIN users u ON u.id=sh.owner_id WHERE sh.id=$1 AND sh.status='pending' AND u.deleted_at IS NULL",
        [job.payload.shareId],
      );
      if (share) {
        const channel = await client.channels.fetch(config.MODERATION_CHANNEL_ID);
        invariant(
          channel?.isSendable(),
          503,
          "CHANNEL_UNAVAILABLE",
          "The moderation channel is unavailable.",
        );
        const message = await channel.send({
          content: `A shared style is awaiting separate review. Open Profile Studio → Review.\nSubmission: ${share.id}`,
          allowedMentions: { parse: [] },
          nonce: job.id.replaceAll("-", "").slice(0, 24),
          enforceNonce: true,
        });
        await service.db.query(
          "INSERT INTO moderation_messages(id,owner_hash) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [message.id, hash(job.payload.userId)],
        );
      }
    }
    // Decision is always visible in /profile status; DMs are best effort.
    else {
      const user = await client.users.fetch(job.payload.userId);
      await user
        .send({
          content:
            job.kind === "published"
              ? "Your Profile Studio profile has been approved and published."
              : `Your profile revision was rejected: ${job.payload.reason ?? "Check your submission status."}`,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }
    await service.db.query("UPDATE outbox SET delivered_at=now(),lease_until=null WHERE id=$1", [job.id]);
  } catch {
    console.error("Retrying the bot notification queue.");
    await setTimeout(3000);
  }
}
client.destroy();
await context.close();
