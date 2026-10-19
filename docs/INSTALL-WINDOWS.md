# Profile Studio: Windows client installation

Use Windows Discord Stable. Vencord client modifications carry Discord account-policy risk.

## Recommended: prebuilt participant package (no Git or Node)

Get the `ProfileStudio-Windows-<build>.zip` asset and `SHA256SUMS.txt` from the [official GitHub Releases](https://github.com/Boronen/Discord-Unlocked/releases), or obtain the matching package from your trusted operator. The automatically generated GitHub source archives are for developers, not the Windows installer. Extract it, fully quit Discord including the tray process, then run `Install.cmd` as your normal Windows user. Follow its checked installer prompts and restart Discord. Do not disable antivirus or bypass a checksum failure. Enable **ProfileStudio**, configure the operator's API origin, read its privacy notice and pair with the bot. See [Getting started](USER-GUIDE.md) for the complete workflow and [Windows package details](WINDOWS-CLIENT-PACKAGE.md) for provenance and checks.

Participants need no Git, Node, Docker, server source or bot token when using this package. The sections below are the **optional source-build path for developers**, not prerequisites for the prebuilt ZIP.

## Optional source build: prerequisites

- Discord for Windows: https://discord.com/download
- Node.js 24 LTS, Windows x64 installer: https://nodejs.org/en/download
- Git for Windows: https://git-scm.com/downloads/win
- The `profile-studio-userplugin.zip` supplied by your community operator.

Keep the default Node.js and Git PATH options. Open a new PowerShell window after installing them. You do not need Docker, a database, a bot token, or the server source package.

## Build the client

Save the ZIP in your Windows Downloads folder under its original filename. Run the following commands in PowerShell **one at a time**. Stop if any command fails. These instructions create a new `ProfileStudioClient` directory in your home folder; if it already exists, keep its contents and ask the operator for update instructions.

```powershell
node --version
git --version
npm.cmd install --global pnpm@11.9.0
git clone https://github.com/Vendicated/Vencord.git "$HOME\ProfileStudioClient"
Set-Location "$HOME\ProfileStudioClient"
git checkout 32c90633ce6a95d7e56c95479efbb431bacf1eac
New-Item -ItemType Directory -Path src\userplugins -Force
Expand-Archive -LiteralPath "$HOME\Downloads\profile-studio-userplugin.zip" -DestinationPath "$HOME\ProfileStudioClient\src\userplugins"
pnpm.cmd install --frozen-lockfile
pnpm.cmd build --standalone
```

The plugin entry point must now be `src\userplugins\profileStudio\index.tsx`. The ZIP also includes this guide and the plugin license; leave them in place. Retain the entire client directory after installation because the custom build is loaded from it. Do not use a different Vencord commit without compatibility testing.

## Install into Discord

Fully quit Discord, including its system-tray icon. From the same PowerShell window and client directory, run:

```powershell
node scripts/runInstaller.mjs -- --install --branch stable
```

Wait for a successful installation before reopening Discord. A build alone does not patch Discord. If an elevation prompt appears, verify it belongs to the Vencord installer. Do not use a normal Vencord release installer afterward: it can replace the custom build.

## Connect to the community

1. Open Discord Settings, Vencord, Plugins. Find and enable **ProfileStudio**. Restart Discord if prompted.
2. Open the ProfileStudio settings and set **API URL** to `https://profilestudio.taile85078.ts.net`.
3. Join the operator's Discord community and ask for its beta role. Installing the plugin alone does not grant access.
4. Start pairing in the plugin editor. Use `/profile connect` with the one-time code in the community server, then return to the editor.
5. Open another participant's profile to view their approved appearance. Changes you submit remain private until approved.

Neither Tailscale nor Music Presence is required to view custom profiles. Music Presence is optional for publishing your own music activity. Keep the community API URL configured; the default localhost address is only for the operator's development setup.

## Troubleshooting and updates

- No Vencord settings: verify the installer reported success and fully restart Discord.
- Vencord exists but ProfileStudio is missing: check the entry-point path above, rebuild, and rerun the installer from this client directory.
- PowerShell blocks pnpm/npm scripts: use the `.cmd` commands shown above; do not change your system execution policy.
- Pairing or access fails: verify the community API URL, guild membership and beta role with the operator. Never send Discord tokens, pairing codes, or saved sessions to another person.
- After a Discord update, the custom patch may need reinstalling. After a plugin update, replace the `profileStudio` source folder, rebuild and rerun the installer. Keep Vencord pinned until the operator provides a tested upgrade.

Upstream custom-plugin documentation: https://docs.vencord.dev/installing/custom-plugins/
