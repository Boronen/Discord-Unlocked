# Patch notes

Every update has an English, user-facing change summary here. Published release sections are also used in GitHub releases and the community bot's announcements. A change listed under Unreleased is still in development.

## Unreleased

No further release is scheduled. Prepared version notes below do not establish availability: download only from a published GitHub release.

## v0.1.0-beta.2

### Added

- Compose your banner from up to three uploaded images, with independent order, position, size, rotation, opacity and manual tint.
- Choose Follow music colors separately for each banner and profile-effect layer. Existing banners keep their original colors until you change the option.
- Shared English patch notes and duplicate-protected release announcements from DcU, with download links and no automatic pings.

### Compatibility

- Updated Windows Discord Stable package; the pinned Vencord version is unchanged. Update the self-hosted API before the client to enable banner controls. No database table migration is required.
- A matching experimental Fedora x64 Discord Flatpak package includes the beta.2 editor and banner controls. Use its separate Linux checksums and manifest; Windows downloads are unchanged.

### Known limitations

- The operator reports Fedora pairing and profile display working. The new Linux build's banner/export behavior and protected-keyring restart persistence still need dedicated desktop acceptance.
- Five-person load testing remains deferred. This release does not establish additional tested capacity.

## v0.1.0-beta.1

### Available

- Self-hosted Profile Studio editor, profile previews, moderated appearances and saved presets.
- Music artwork backgrounds, adaptive colors, effect layers and complete profile PNG/GIF export.
- Windows installation package and an experimental Fedora x64 Discord Flatpak package.
- English installation, privacy, server operation and community contribution guides.

### Known limitations

- Fedora Flatpak has not completed real desktop acceptance; an API connection failure is being investigated.
- Five-person load testing is deferred. This beta does not establish a tested capacity of fifty simultaneous users.
- Discord updates can require compatible Vencord/plugin updates. This is an independent community project.
