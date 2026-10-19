# Discord community setup

[Join Discord Unlocked](https://discord.gg/S42hjgbcCk). Read `rules` and request admission in `beta-access`. The owner manually assigns **Beta Tester** to invited adults (18+); neither the invite nor a public client download grants access automatically. Never post birth dates, identity documents, pairing codes or credentials in the application channel.

## Channel layout

- **Start Here:** welcome, rules, get-started, announcements and contributing are readable by visitors and writable by the owner/bot. The separate beta-access channel accepts short requests, with a 30-second slowmode and attachments/embeds disabled. Requests there are visible to other visitors; personal requests belong in the support mailbox.
- **Community:** general, profile-showcase, ideas, bug-reports and help are for Beta Tester members.
- **Studio:** studio-commands is for admitted members using the existing `/profile` commands. Pairing/status/upload responses are ephemeral; never paste codes or credentials as normal messages.
- **Staff:** profile-moderation is visible to the owner, configured Profile Moderator role and bot. beta-moderation and profile-studio-alerts are restricted to the owner and bot. The configured moderation/alert channel IDs and existing messages are retained.
- **Lounge:** the existing General voice channel is preserved and restricted to beta members.

## Roles and Supporter

**Beta Tester** is the existing admission role, retaining its configured ID. **Profile Moderator** is the existing profile-review role, retaining its ID; it does not grant Administrator, member admission or Supporter-award powers. The server owner retains those decisions. The DcU bot keeps its existing managed role and application identity.

**Supporter** is a manually awarded recognition for accepted code, design, ideas, reproducible bug reports, testing, documentation or other useful help. The owner alone decides; no payment, automatic scoring or guaranteed award is involved. Stopping contributions does not automatically remove recognition. The role has no server management permissions and does not grant beta admission or staff-channel visibility.

The existing application entitlement provides 20 saved presets and 20 collections instead of five, plus custom HEX tints. Everyone retains the same 100 MiB media quota. Removal preserves existing content under the documented limits. See [the contribution policy](CONTRIBUTING.md).

## Operator-run setup

The setup uses the existing bot's supported Discord API. It does not request a Discord user token, read message history, assign members to roles, delete channels/messages or migrate the application database.

1. Use the deployment's current `secrets/bot.env`; never put a token on the command line or into a public issue. The configured guild, owner, beta/moderator roles and moderation channel must already be correct.
2. Temporarily grant **Manage Channels** and **Manage Roles** to DcU, and keep its role above Beta Tester, Profile Moderator and Supporter. Do not grant Administrator. Existing Administrator roles must be reviewed because they bypass channel privacy.
3. From the project root, inspect the plan:

   ```bash
   node --env-file=secrets/bot.env scripts/discord-community.mjs
   ```

4. Apply the reviewed layout:

   ```bash
   node --env-file=secrets/bot.env scripts/discord-community.mjs --apply
   ```

5. Add the returned Supporter role ID as `SUPPORTER_ROLE_ID` in **both** `secrets/api.env` and `secrets/bot.env`. Use the existing reviewed production Compose resolver/file set and recreate the API and bot to load the changed environment; this is a separate deployment operation, not a database migration. Preserve the notice override and retain an environment rollback copy privately.
6. Remove the two temporary management permissions from DcU, then check visibility using a visitor, Beta Tester and Profile Moderator account. Supporter alone must not see beta or staff channels.

The tool seals existing sensitive channels before reorganizing them. New/updated channels get complete explicit permission overwrites; unrelated channels and roles are left alone. Existing admission/moderation role IDs are reused. State in `secrets/discord-community-state.json` tracks created IDs and the bot's own welcome-message IDs so retries update them instead of creating duplicates. It sends no mass mentions. The baseline @everyone role loses Mention Everyone; other baseline permissions are retained. Harmless existing extra mention-denials are preserved rather than rewritten. Do not delete this state just to rerun setup.

Before applying, a private snapshot of role/channel metadata is saved under `diagnostics/discord-community/`. It contains no message history or token. If an API operation fails, correct the missing permission and rerun using saved state; there is no automatic destructive rollback. For manual recovery, use the snapshot to restore layout selectively. Do not blindly restore historical permissions that exposed staff channels. Never publish snapshots or secret environment backups.

## Verification

Check the actual server after setup: visitors can read onboarding and request admission but cannot browse beta/staff channels; beta members can use community/Studio channels; profile moderators can review profiles but cannot see the owner-only admission/alert channels. The owner sees all channels. Confirm bot moderation and existing alert webhooks still reach their original IDs. The unit-tested permission matrix complements this live verification; it does not replace a real-account check.

Discord documents [role hierarchy and permission overwrites](https://docs.discord.com/developers/topics/permissions). Channel ordering does not itself enforce privacy; Administrator bypasses channel restrictions.
