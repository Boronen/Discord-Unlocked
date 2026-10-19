# Experimental Fedora Linux client

This client package targets **Fedora x86-64 with Discord Flatpak** (`com.discordapp.Discord`). It contains the same pinned standalone Vencord/plugin build and corresponding source. It is an experimental client package, not an RPM or a replacement Flatpak. A real Fedora desktop/pairing/animation/export acceptance pass is still required. Headless installer and integrity checks do not establish desktop compatibility or SELinux behavior.

## Requirements

- Fedora x86-64, Python 3.9+ and the `flatpak` command.
- Discord Flatpak installed and launched at least once. Check it with `flatpak info com.discordapp.Discord`.
- Internet access for a fixed-version, checksum-verified official Vencord CLI installer.
- An unlocked GNOME Keyring or KWallet for remembered pairing and local draft recovery. The Linux client refuses Electron's `basic_text`/unknown storage backend; if protected storage is unavailable, it does not persist session secrets or draft backups. Pairing can work for the current session, but restarting may require pairing again. Do not use `--password-store=basic` as a workaround.

Git, Node.js, Docker and a separate Tailscale client are not needed by participants. Community access remains manually approved and separate from installation.

## Install

1. Download the **ProfileStudio-Linux-x64-&lt;build&gt;.zip** asset and **Linux-SHA256SUMS.txt** from [GitHub Releases](https://github.com/Boronen/Discord-Unlocked/releases). Check the outer archive against the published checksum before extracting. GitHub's automatic Source code archives are not installers.
2. Extract the ZIP and open a terminal inside `ProfileStudio-Linux`.
3. Verify the inner files:

   ```bash
   python3 Setup.py verify
   ```

4. Fully quit Discord, including its tray process. Then run as your normal desktop user:

   ```bash
   sh Install.sh
   ```

5. Restart Discord and enable **ProfileStudio**. Set the API origin to `https://profilestudio.taile85078.ts.net` and read the operator's privacy notice.
6. [Join Discord Unlocked](https://discord.gg/S42hjgbcCk), read `rules`, request **Beta Tester** in `beta-access` (18+, owner-approved), then pair with the bot using `studio-commands`. Never post pairing codes as ordinary messages. See [the user guide](USER-GUIDE.md).

The installer selects Discord Flatpak explicitly, preferring its writable per-user updater layout, then the standard user/system Flatpak deployment. It does not silently select an unrelated native Discord. A nonstandard Flatpak installation location may require operator assistance.

If the selected system-wide application files are read-only, inspect the reported target before explicitly choosing:

```bash
sh Install.sh --system
```

This elevates **only** the checksum-verified official installer with `sudo`; do not run the entire setup as root. No package-manager operation or recursive permission change is performed. An advanced explicit target is available through `--location /absolute/Discord/directory`. Snap is unsupported.

Only the custom build's `dist` directory is added to the per-user Flatpak filesystem permissions, read-only. Review existing overrides with `flatpak override --user --show com.discordapp.Discord`. Do not disable SELinux, the sandbox or grant broad home access to conceal a failed install. Report the sanitized error for diagnosis.

## Update and uninstall

Quit Discord before running a new, independently checked package. Builds live under `${XDG_DATA_HOME:-$HOME/.local/share}/discord-unlocked/client-<build>`. Unknown/tampered existing build files are not overwritten. The fixed official installer is cached under `${XDG_CACHE_HOME:-$HOME/.cache}/discord-unlocked` and is verified before every execution. These directories contain build/installer files, not unencrypted session credentials.

Run `sh Uninstall.sh` with the same `--system`/`--location` options used at installation. The installer verifies that Discord's original archive was restored. Local settings/build files and unrelated Flatpak overrides are retained; no broad override reset is run. A Discord update can require reapplying the patch. Automatic upstream Vencord updating is disabled for this custom build.

## Operator packaging and checks

Synchronize/typecheck the current plugin against the pinned Vencord checkout. From that checkout build using:

```bash
node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --standalone --disable-updater
```

From the project root run `node scripts/package-linux.mjs`. The package includes a hashed manifest, Linux setup, GPL/third-party notices and corresponding Vencord-plus-plugin source. The packager checks the pinned upstream revision, synchronized plugin, disabled updater, archive scan and round-trip integrity. `python3 tests/linux-installer.test.py` exercises corruption/link/path guards and target selection without touching real Discord. Typechecking and session-storage tests protect the keyring policy.

Before claiming Fedora acceptance, test actual Flatpak install/uninstall, pairing across restart, locked/missing keyring, profile/media visibility, compact/full profiles, animation, audio controls, PNG/GIF export and denied sandbox paths. Do not label these passed based on fixture tests alone.

References: [Vencord custom builds](https://docs.vencord.dev/installing/) and [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
