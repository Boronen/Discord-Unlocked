PROFILE STUDIO - WINDOWS COMMUNITY BETA

No Git, Node.js, pnpm, Docker or Tailscale installation is needed.
Requires Windows desktop Discord Stable and internet access.

1. Extract the entire ZIP to a normal folder. Do not run from inside the ZIP.
2. Fully quit Discord, including its icon beside the Windows clock.
3. Double-click Install.cmd. Run normally, NOT as administrator.
4. Wait for the official Vencord installer to report success.
5. Open Discord. Settings > Vencord > Plugins > enable ProfileStudio.
6. Open ProfileStudio settings and set API URL to:
   https://profilestudio.taile85078.ts.net
7. Join the community Discord server and ask the operator for its beta role.
8. Start pairing in the plugin editor, use /profile connect with the code
   in the server, then return to the editor.

Install.cmd uses Windows PowerShell with an execution-policy override for
that process only. It does not change your machine's execution policy.
It verifies package checksums, copies the custom client to your own
LocalAppData\ProfileStudio folder and downloads the official Vencord CLI
installer v1.4.2 from GitHub. Its published SHA-256 is checked before use.
The downloaded EXE is not bundled or modified by Profile Studio.

The script checks for a running Discord process; it does not force-close
your apps. No Discord token or administrator password is requested.
Installation does not enable the plugin or grant server access automatically.

Keep the extracted package for repair and removal. The installed build is
retained under LocalAppData\ProfileStudio even if you move the extracted ZIP.
After Discord updates, close Discord and run Install.cmd again if needed.
To remove Vencord from Discord Stable, close Discord and run Uninstall.cmd.
Uninstall removes the Vencord patch, including other Vencord plugins; it
preserves existing settings and files. You can install standard Vencord
again afterward if desired.

Automatic upstream Vencord updates are disabled in this custom build so
they cannot replace ProfileStudio. Obtain tested updates from the operator.
This also means security updates must be packaged and distributed promptly.

Client modifications may violate Discord's rules. Account sanctions cannot
be ruled out. This package is not affiliated with Discord or Vencord.
Windows warnings about an unsigned script can occur. Inspect the scripts
or ask your operator; do not disable antivirus or other protection.

SOURCE AND LICENSE

Vencord and Profile Studio are distributed under GPL-3.0-or-later; see LICENSE.
Vencord-source.zip contains the pinned Vencord source, ProfileStudio source,
dependency lockfile and build instructions. Dependency notices are preserved
in dist/*.LEGAL.txt and upstream source. Source commit and build metadata
are in manifest.json. No operator secrets, sessions or user media are bundled.
The bundled GIF encoder is gifenc 1.0.3 under MIT; see gifenc-LICENSE.txt.

Vencord: https://github.com/Vendicated/Vencord
Installer: https://github.com/Vencord/Installer/releases/tag/v1.4.2
The installer is fetched separately from its publisher at installation time.
Plugin support: your community operator.
