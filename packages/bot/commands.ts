import { SlashCommandBuilder } from "discord.js";
export const commands = [
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Profile Studio: manage your custom profile")
    .addSubcommand((cmd) =>
      cmd
        .setName("confirm")
        .setDescription("Confirm one owner publication of an exact draft")
        .addStringOption((o) =>
          o.setName("code").setDescription("One-time confirmation code from the editor").setRequired(true),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName("connect")
        .setDescription("Pair the plugin with this account")
        .addStringOption((option) =>
          option.setName("code").setDescription("The one-time code shown in the plugin").setRequired(true),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName("upload")
        .setDescription("Upload an avatar, banner, effect or sound")
        .addStringOption((option) =>
          option
            .setName("slot")
            .setDescription("Profile layer")
            .setRequired(true)
            .addChoices(
              { name: "Avatar", value: "avatar" },
              { name: "Avatar decoration", value: "decoration" },
              { name: "Banner", value: "banner" },
              { name: "Profile effect", value: "effect" },
              { name: "Profile sound (3–5 sec)", value: "audio" },
            ),
        )
        .addAttachmentOption((option) =>
          option
            .setName("file")
            .setDescription("PNG/APNG, GIF, WebP or MP3/WAV/OGG, up to 15 MiB")
            .setRequired(true),
        ),
    )
    .addSubcommand((cmd) =>
      cmd.setName("status").setDescription("View your submission status and recent uploads"),
    ),
  new SlashCommandBuilder()
    .setName("profile-mod")
    .setDescription("Profile Studio moderation (moderator role required)")
    .addSubcommand((cmd) =>
      cmd
        .setName("inspect")
        .setDescription("Inspect a submitted revision")
        .addStringOption((o) => o.setName("revision").setDescription("Revision ID").setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName("restore")
        .setDescription("Restore a previously approved revision")
        .addStringOption((o) => o.setName("revision").setDescription("Revision ID").setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName("revoke")
        .setDescription("Revoke a published profile")
        .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName("revoke-media")
        .setDescription("Revoke a media asset")
        .addStringOption((o) => o.setName("asset").setDescription("Asset ID").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)),
    ),
].map((command) => command.toJSON());
