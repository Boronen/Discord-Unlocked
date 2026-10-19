# Release notes and Discord announcements

The owner writes English patch notes for every update in [Patch notes](PATCH-NOTES.md). Keep unfinished work under `Unreleased`. For a release, add an exact version heading such as `## v0.1.0-beta.2`, describing changes, fixes, supported platforms and known limitations. A release section must fit a Discord message including its title and download link. Do not publish private account data or claim unperformed tests.

## Publish an update

1. Finish the relevant [acceptance checks](ACCEPTANCE.md). Update the notes to describe the actual release, not the original plan.
2. Use the exact Markdown section below the version heading in the GitHub release body. Additional installation links may follow it. Publish the matching verified downloads and checksums.
3. Complete deployment and health checks for any server changes before announcing availability. The announcement command verifies the public GitHub release, notes and presence of assets; it does not attest a live server deployment or verify artifact checksums.
4. On the operator's host, from the project directory, preview the message:

   ```sh
   node scripts/announce-update.mjs v0.1.0-beta.2
   ```

5. Send the reviewed message through the existing DcU bot:

   ```sh
   node scripts/announce-update.mjs v0.1.0-beta.2 --apply
   ```

The command reads `secrets/bot.env`, using the existing `DISCORD_BOT_TOKEN` and `GUILD_ID`. It uses the saved `announcements` channel from `secrets/discord-community-state.json`, or an explicit `UPDATE_CHANNEL_ID` from the local environment. It rejects channels outside the configured guild. Only View Channel, Send Messages and (for reconciliation) Read Message History are needed; no role/channel management or Administrator permission is required. Never pass credentials on the command line or store them in GitHub.

This is a final release step, not a bot startup announcement or a polling service. Restarting the bot cannot announce an unfinished update. Include the command in each reviewed release runbook after deployment checks. It does not create a channel, ping members, change permissions, or post historical releases automatically.

## Delivery receipts and interrupted sends

`secrets/update-announcements/` contains private, durable receipts. Back up and retain them with the host configuration. The receipt records the guild/channel, release tag, content hash and Discord message ID, not the bot token or message history. An exclusive claim prevents concurrent sends. A successful rerun skips the same release; changing its notes/destination requires review instead of silently posting again.

Discord's [message API](https://github.com/discord/discord-api-docs/blob/main/developers/resources/message.mdx#create-message) also checks a deterministic nonce for recent duplicate requests. Its short deduplication window is insufficient on its own, so the local receipt remains authoritative.

If a request times out or the process crashes, the receipt stays pending. The command deliberately blocks automatic retransmission. Check the channel; if the exact message exists, copy its Discord message ID and reconcile:

```sh
node scripts/announce-update.mjs v0.1.0-beta.2 --apply --confirm-message MESSAGE_ID
```

Reconciliation fetches only that message and checks the bot author and exact content. It sends nothing. If no message exists, investigate the failed request before an operator manually resolves the pending receipt. Never delete pending receipts to retry blindly. Deleting a published message does not cause an automatic replacement. Loss of receipts requires manual reconciliation before announcing old tags.
