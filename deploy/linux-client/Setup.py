#!/usr/bin/env python3
"""Install the checked custom build through a pinned official Vencord installer."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import urllib.request
import uuid

INSTALLER_URL = "https://github.com/Vencord/Installer/releases/download/v1.4.2/VencordInstallerCli-linux"
INSTALLER_SHA256 = "52642c8521a866ad241c10337144a4f513672c54b9c86a8169954785054c815d"
REQUIRED = {"dist/patcher.js", "dist/preload.js", "dist/renderer.js", "dist/renderer.css",
            "Vencord-source.zip", "LICENSE", "gifenc-LICENSE.txt", "README.txt",
            "Install.sh", "Uninstall.sh", "Setup.py"}
FLATPAK_APP = "com.discordapp.Discord"


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def regular_child(root, relative):
    if not re.fullmatch(r"(?:dist/[A-Za-z0-9._-]+|Vencord-source\.zip|LICENSE|gifenc-LICENSE\.txt|README\.txt|Install\.sh|Uninstall\.sh|Setup\.py)", relative):
        raise ValueError("Invalid package path")
    file = root / relative
    if any(p.is_symlink() for p in [file, *file.parents] if p == root or root in p.parents):
        raise ValueError("Package links are not supported")
    if not file.is_file():
        raise ValueError("Missing package file: " + relative)
    return file


def verify(root):
    if (root / "manifest.json").is_symlink():
        raise ValueError("Manifest links are not supported")
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("version") != 1 or manifest.get("platform") != "linux-x64":
        raise ValueError("Unsupported package manifest")
    if not re.fullmatch(r"[a-f0-9]{16}", manifest.get("buildId", "")):
        raise ValueError("Invalid build identifier")
    if manifest.get("updaterDisabled") is not True:
        raise ValueError("The package must disable automatic upstream updates")
    entries = manifest.get("files", [])
    names = [entry["path"] for entry in entries]
    if len(names) != len(set(names)) or not REQUIRED.issubset(names):
        raise ValueError("Incomplete or duplicate package manifest")
    for entry in entries:
        if digest(regular_child(root, entry["path"])) != entry["sha256"]:
            raise ValueError("Package checksum failed: " + entry["path"])
    return manifest


def owned_directory(path):
    if not path.is_absolute():
        raise ValueError("Data/cache directories must be absolute")
    # Refuse redirection of files inside directories managed by this installer.
    if path.is_symlink():
        raise ValueError("Installation/cache directories must not be links")
    path.mkdir(parents=True, exist_ok=True)
    if path.stat().st_uid != os.getuid():
        raise ValueError("Installation/cache directory belongs to another user")
    return path


def discord_running():
    for proc in Path("/proc").glob("[0-9]*"):
        try:
            if proc.stat().st_uid == os.getuid() and (proc / "comm").read_text().strip().lower() in {"discord", "discordcanary", "discordptb"}:
                return True
        except (OSError, UnicodeError):
            continue
    return False


def flatpak_location(home, run=subprocess.run):
    """Prefer Discord's writable per-user updater layout, then its actual deployment."""
    installed = []
    for scope in ["--user", "--system"]:
        result = run(["flatpak", "info", scope, "--show-location", FLATPAK_APP],
                     capture_output=True, text=True, check=False)
        if result.returncode == 0:
            installed.append(scope)
    if not installed:
        raise ValueError("Discord Flatpak was not found. Install com.discordapp.Discord and launch it once")
    local = home / ".var/app" / FLATPAK_APP / "config/discord"
    if local.is_dir():
        for version in local.glob("app-*"):
            resources = version / "resources"
            if (resources / "app.asar").is_file() or (resources / "_app.asar").is_file():
                return local
    if "--user" in installed:
        return home / ".local/share/flatpak/app" / FLATPAK_APP
    return Path("/var/lib/flatpak/app") / FLATPAK_APP


def resources_directory(location):
    versions = [p / "resources" for p in location.glob("app-*") if (p / "resources").is_dir()]
    if versions:
        return max(versions, key=str)
    if (location / "resources").is_dir():
        return location / "resources"
    if location.name == FLATPAK_APP:
        resources = location / "current/active/files/discord/resources"
        if resources.is_dir():
            return resources
    raise ValueError("Discord resources were not found at the selected location; launch Discord once and retry")


def official_installer(cache):
    executable = cache / "VencordInstallerCli-linux-v1.4.2"
    if executable.is_symlink():
        raise ValueError("Installer links are not supported")
    if not executable.exists():
        temporary = executable.with_suffix(".download")
        try:
            with urllib.request.urlopen(INSTALLER_URL, timeout=60) as response:
                if not response.url.startswith("https://"):
                    raise ValueError("Installer download must stay on HTTPS")
                with temporary.open("xb") as output:
                    shutil.copyfileobj(response, output)
            if digest(temporary) != INSTALLER_SHA256:
                raise ValueError("Official installer checksum mismatch")
            temporary.replace(executable)
        finally:
            temporary.unlink(missing_ok=True)
    if not executable.is_file() or digest(executable) != INSTALLER_SHA256:
        raise ValueError("Official installer checksum mismatch; nothing was executed")
    executable.chmod(0o700)
    return executable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "uninstall", "verify"])
    parser.add_argument("--location", help="Explicit Discord installation directory (not an arbitrary command)")
    parser.add_argument("--system", action="store_true", help="Run only the verified official installer through sudo")
    args = parser.parse_args()
    if sys.platform != "linux" or platform.machine() not in {"x86_64", "amd64"}:
        raise ValueError("This experimental package requires Linux x86-64")
    if os.getuid() == 0:
        raise ValueError("Run as your normal desktop user. Use --system only if the selected Discord install requires sudo")
    root = Path(__file__).resolve().parent
    manifest = verify(root)
    print("Package integrity verified: " + manifest["buildId"])
    if args.action == "verify":
        return
    if discord_running():
        raise ValueError("Fully quit Discord, including its tray process, before continuing")
    if args.location:
        location = Path(args.location)
        if not location.is_absolute() or not location.is_dir() or "snap" in location.parts:
            raise ValueError("Use an existing absolute Discord directory; Snap is unsupported")
    else:
        location = flatpak_location(Path.home())
    target = ["--location", str(location)]
    resources = resources_directory(location)
    original = resources / ("_app.asar" if (resources / "_app.asar").is_file() else "app.asar")
    original_hash = digest(original)
    base = owned_directory(Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))) / "discord-unlocked")
    client = owned_directory(base / ("client-" + manifest["buildId"]))
    owned_directory(client / "dist")
    if args.action == "install":
        for entry in manifest["files"]:
            source = regular_child(root, entry["path"])
            destination = client / entry["path"]
            if destination.is_symlink():
                raise ValueError("Installed files must not be links")
            if destination.exists() and digest(destination) != entry["sha256"]:
                raise ValueError("Existing build files differ; do not overwrite an unknown installation")
            if not destination.exists():
                temporary = destination.with_name(destination.name + "." + uuid.uuid4().hex + ".partial")
                try:
                    with source.open("rb") as src, temporary.open("xb") as dst:
                        shutil.copyfileobj(src, dst)
                    if digest(temporary) != entry["sha256"]:
                        raise ValueError("Copied file checksum failed")
                    temporary.replace(destination)
                finally:
                    temporary.unlink(missing_ok=True)
            if digest(destination) != entry["sha256"]:
                raise ValueError("Installed file verification failed; Discord has not been patched")
    cache = owned_directory(Path(os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache"))) / "discord-unlocked")
    executable = official_installer(cache)
    operation = "--install" if args.action == "install" else "--uninstall"
    env = dict(os.environ, VENCORD_USER_DATA_DIR=str(client), VENCORD_DEV_INSTALL="1")
    command = [str(executable), operation, *target]
    if args.system:
        command = ["sudo", "env", "VENCORD_USER_DATA_DIR=" + str(client), "VENCORD_DEV_INSTALL=1", *command]
    print("Running the checksum-verified official installer. Automatic upstream updates stay disabled.")
    subprocess.run(command, env=env, check=True)
    if args.action == "install":
        patch = resources / "app.asar"
        if not patch.is_file() or patch.stat().st_size > 2 * 1024 * 1024 or str(client / "dist/patcher.js").encode() not in patch.read_bytes():
            raise ValueError("The official installer did not activate this custom build; installation is not accepted")
        if digest(resources / "_app.asar") != original_hash:
            raise ValueError("The original Discord archive was not preserved as expected")
    elif digest(resources / "app.asar") != original_hash:
        raise ValueError("The original Discord archive was not restored as expected")
    if args.action == "install" and FLATPAK_APP in location.parts:
        # Limit the added sandbox access to the public build assets, not the user's home.
        subprocess.run(["flatpak", "override", "--user", "--filesystem=" + str(client / "dist") + ":ro", FLATPAK_APP], check=True)
    if args.action == "install":
        print("Open Discord, enable ProfileStudio and use https://profilestudio.taile85078.ts.net")
        print("Join https://discord.gg/S42hjgbcCk, request Beta Tester, then pair through the bot.")
        print("Linux secret persistence needs an unlocked GNOME Keyring or KWallet; insecure basic_text storage is refused.")
    else:
        print("Discord unpatched. Existing local settings and build files were retained.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print("Setup failed: " + str(error), file=sys.stderr)
        sys.exit(1)
