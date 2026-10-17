import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { readFile } from "node:fs/promises";
import { assetIds } from "../plugin/model.js";
import type { ProfileService } from "../server/service.js";
import type { FileStore } from "../server/media.js";
import { invariant } from "../server/errors.js";
import { configDiff } from "../plugin/studio-model.js";
export async function moderationMessage(service: ProfileService, files: FileStore, revisionId: string) {
  const [row] = await service.db.query("SELECT * FROM revisions WHERE id=$1", [revisionId]);
  invariant(row, 404, "NOT_FOUND", "Revision not found.");
  const revision = service.revision(row);
  const [baseline] = revision.baselineRevisionId
    ? await service.db.query("SELECT config FROM revisions WHERE id=$1", [revision.baselineRevisionId])
    : [];
  const changes = configDiff(baseline?.config ?? null, revision.config);
  const embed = new EmbedBuilder()
    .setTitle("Profile awaiting review")
    .setDescription(
      `User: <@${revision.userId}>
Revision: \`${revision.id}\`
Status: ${revision.status}
Changes: ${(changes.join(", ") || "No changes").slice(0, 2500)}`,
    )
    .setFooter({ text: "Animated comparison: Profile Studio → Review → submitted snapshot." })
    .setColor(0x5865f2)
    .addFields(
      { name: "Profile colors", value: revision.config.colors?.join(" / ") ?? "Original Discord colors" },
      { name: "Music card", value: `${revision.config.music.mode} / ${revision.config.music.preset}` },
    );
  const attachments: AttachmentBuilder[] = [];
  if (revision.config.favoriteSong)
    embed.addFields({
      name: "Favorite song",
      value: `${revision.config.favoriteSong.title}\n${revision.config.favoriteSong.artist}\n${revision.config.favoriteSong.url}`,
    });
  const ids = assetIds(revision.config);
  const assets = ids.length
    ? await service.db.query("SELECT * FROM media WHERE id=ANY($1::uuid[]) AND status='ready'", [ids])
    : [];
  for (const asset of assets) {
    // Bot embeds cannot send Authorization headers; attach private previews directly.
    const key = asset.slot === "audio" ? asset.output_key : asset.preview_key;
    if (!key || attachments.length >= 10) continue;
    const name = `${asset.slot}-${asset.id.slice(0, 8)}.${asset.slot === "audio" ? "ogg" : "png"}`;
    attachments.push(new AttachmentBuilder(await readFile(files.path(key)), { name }));
    if (asset.slot === "banner") embed.setImage(`attachment://${name}`);
    if (asset.slot === "avatar") embed.setThumbnail(`attachment://${name}`);
  }
  for (const selection of [
    revision.config.decoration,
    revision.config.effect,
    revision.config.nameplate ? { source: "discord", id: revision.config.nameplate } : null,
  ]) {
    if (selection?.source !== "discord") continue;
    const [item] = await service.db.query("SELECT item FROM catalog WHERE id=$1", [selection.id]);
    if (item)
      embed.addFields({
        name:
          item.item.kind === "effect"
            ? "Discord profile effect"
            : item.item.kind === "nameplate"
              ? "Discord nameplate"
              : "Discord decoration",
        value: `${item.item.name}\n${item.item.staticUrl}`,
      });
  }
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ps:approve:${revisionId}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success)
      .setDisabled(revision.status !== "pending"),
    new ButtonBuilder()
      .setCustomId(`ps:reject:${revisionId}`)
      .setLabel("Reject")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(revision.status !== "pending"),
  );
  return {
    embeds: [embed],
    files: attachments,
    components: revision.config.configVersion === 2 ? [] : [buttons],
    allowedMentions: { parse: [] as [] },
  };
}
