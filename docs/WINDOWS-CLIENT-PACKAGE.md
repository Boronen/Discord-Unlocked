# Prebuilt Windows participant package

Run from the project root as the operator:

```powershell
node scripts/plugin.mjs sync
Set-Location .vendor/Vencord
node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --standalone --disable-updater
Set-Location ../..
node scripts/package-windows.mjs
node --test tests/windows-package.test.mjs
```

Distribute `dist/windows/ProfileStudio-Windows.zip` and its SHA-256 checksum. Participants extract it and run `Install.cmd` normally after fully quitting Discord Stable. They need no development runtime. Follow `deploy/windows-client/README.txt` for the English end-user instructions.

For an operator's local installation test, extract that exact, checksum-verified ZIP into a **fresh directory** and run its setup. The packager writes the ZIP; it does not refresh a previously extracted `dist/windows/ProfileStudio-Windows/` directory. Verify the extracted manifest's build ID and the installed runtime hashes against the current ZIP, rather than an old build log or folder.

The package includes only the four desktop runtime assets and their notices/maps, the setup scripts, documentation, GPL license and corresponding Vencord-plus-plugin source archive. Packaging checks the pinned commit, a clean upstream checkout, plugin synchronization, a disabled upstream updater, archive round-trip integrity, forbidden paths, token patterns and local env/key secret matches. Source and outer ZIP are scanned separately. These checks do not replace a full repository/history/container audit before a GitHub release.

Setup uses the official upstream development-install environment variables. It downloads the official installer v1.4.2 from its fixed versioned GitHub URL and checks its publisher SHA-256 before execution. The binary is not redistributed inside this package. Checksums detect corruption; they do not authenticate an untrusted sender. Obtain the package and checksum from a trusted operator.

The runtime is copied into a versioned folder under the participant's LocalAppData. Existing Vencord settings are preserved; plugin enablement, API URL and bot pairing remain explicit. Installation and uninstallation apply to Discord Stable. Uninstallation removes the Vencord patch as a whole and retains local files and settings.

Automated verification exercises Windows PowerShell package checks and corruption rejection without patching the operator's Discord. A fresh participant Windows installation still needs a real end-to-end test, including installer success, Discord restart, ProfileStudio enablement, safeStorage pairing and shared profile rendering.

Custom builds disable the upstream updater to avoid replacing the plugin. The operator must review upstream security fixes, test upgrades and distribute new packages promptly. Replace the pinned installer checksum only after independently checking the publisher's release metadata. Never work around a checksum mismatch or tell participants to disable antivirus.
