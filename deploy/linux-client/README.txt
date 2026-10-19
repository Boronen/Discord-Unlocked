Discord Unlocked / ProfileStudio - experimental Linux x86-64 participant package

This package is prepared for Fedora x86-64 + Discord Flatpak evaluation. A real Fedora Discord
acceptance test is still required; headless/package checks are not desktop testing.
It is not an RPM, a Flatpak application or a replacement for Discord.

Requirements: Linux x86-64, Python 3.9+, Discord Flatpak (com.discordapp.Discord),
the flatpak command and internet for the pinned
official Vencord installer. Git, Node.js, Docker and a separate Tailscale client
are not required. An unlocked GNOME Keyring or KWallet is needed to remember
pairing and encrypted local drafts. basic_text/unavailable stores are refused;
without a protected keyring you must pair again after restarting Discord.

1. Verify the outer ZIP using its published Linux SHA-256 checksum, then extract it.
2. In a terminal inside ProfileStudio-Linux, run: python3 Setup.py verify
3. Fully quit Discord, including the tray process.
4. Run: sh Install.sh (it selects Discord Flatpak, preferring its per-user updater layout)
5. Open Discord and enable ProfileStudio. Set the API URL to:
   https://profilestudio.taile85078.ts.net
6. Join https://discord.gg/S42hjgbcCk, read rules and request Beta Tester in
   beta-access (18+, manually approved). Start pairing in the plugin and run the
   one-time /profile connect command in studio-commands; never post it as a message.

Launch Discord Flatpak once before installation so its per-user files exist.
The default checks the user/system Flatpak installation and explicitly targets it;
it does not silently choose a different native Discord installation. For an advanced
custom location use --location /absolute/path/to/Discord. Snap is unsupported.
Flatpak/SELinux desktop compatibility still needs a real Fedora acceptance test.
Only the custom build's dist directory is added to the per-user sandbox filesystem
permissions, read-only; no broad home-directory access is requested. Review existing
overrides with flatpak override --user --show com.discordapp.Discord. Uninstall leaves
existing overrides/settings intact rather than resetting unrelated sandbox choices.

Start setup as your normal user, never sudo sh Install.sh. If an explicitly selected
system-wide Discord installation requires root privileges, review the location and
use sh Install.sh --system [--location /absolute/path]. Only the checksum-verified
official Vencord installer is elevated; no package manager or chmod -R workaround
is run. Do not disable SELinux or grant broad home-filesystem access to fix errors.

Uninstall: fully quit Discord and run sh Uninstall.sh with the same location/system
options used for installation. Local settings/build files remain. After a Discord
update the custom patch may need reinstalling. Do not install an ordinary upstream
Vencord update over this custom build.

The package includes the pinned Vencord/plugin corresponding source and licences.
Vencord commit: 32c90633ce6a95d7e56c95479efbb431bacf1eac
Client modifications carry Discord account-policy risk. This independent community
project is not endorsed by Discord. Access still requires community admission.

Documentation: https://boronen.github.io/Discord-Unlocked/
Support/privacy: boronengames.support@gmail.com
