"""Linux installer validation tests; no real Discord or privileged process invoked."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("linux_setup", Path(__file__).resolve().parents[1] / "deploy/linux-client/Setup.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class InstallerTests(unittest.TestCase):
    def fixture(self, root):
        entries = []
        for name in sorted(setup.REQUIRED):
            file = root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(b"synthetic")
            entries.append({"path": name, "sha256": hashlib.sha256(b"synthetic").hexdigest()})
        manifest = {"version": 1, "platform": "linux-x64", "buildId": "a" * 16, "updaterDisabled": True, "files": entries}
        (root / "manifest.json").write_text(json.dumps(manifest))
        return manifest

    def test_complete_package_and_tampering(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.fixture(root)
            self.assertEqual(setup.verify(root)["platform"], "linux-x64")
            (root / "dist/patcher.js").write_text("altered")
            with self.assertRaisesRegex(ValueError, "checksum"):
                setup.verify(root)

    def test_paths_links_and_missing_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = self.fixture(root)
            manifest["files"].append({"path": "../outside", "sha256": "0" * 64})
            (root / "manifest.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "Invalid package path"):
                setup.verify(root)
            self.fixture(root)
            file = root / "dist/patcher.js"
            file.unlink()
            file.symlink_to(root / "LICENSE")
            with self.assertRaisesRegex(ValueError, "links"):
                setup.verify(root)

    def test_manifest_requires_complete_unique_files_and_disabled_updater(self):
        for change in [lambda m: m.update(updaterDisabled=False),
                       lambda m: m["files"].pop(),
                       lambda m: m["files"].append(m["files"][0])]:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                m = self.fixture(root)
                change(m)
                (root / "manifest.json").write_text(json.dumps(m))
                with self.assertRaises(ValueError):
                    setup.verify(root)

    def test_flatpak_targets_user_updater_before_deployment(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            local = home / ".var/app/com.discordapp.Discord/config/discord"
            resources = local / "app-1.0.0/resources"
            resources.mkdir(parents=True)
            (resources / "app.asar").write_text("synthetic")
            def installed(command, **kwargs):
                return types.SimpleNamespace(returncode=0, stdout="synthetic")
            self.assertEqual(setup.flatpak_location(home, installed), local)

    def test_absent_flatpak_fails_instead_of_selecting_native_discord(self):
        def absent(command, **kwargs):
            return types.SimpleNamespace(returncode=1, stdout="")
        with self.assertRaisesRegex(ValueError, "Flatpak was not found"):
            setup.flatpak_location(Path("/synthetic-home"), absent)

    def test_cached_installer_is_never_executed_on_hash_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = Path(tmp)
            (cache / "VencordInstallerCli-linux-v1.4.2").write_text("untrusted")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                setup.official_installer(cache)

    def test_resources_match_upstream_updater_layout_selection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for version in ["app-1.0.1", "app-1.0.2"]:
                (root / version / "resources").mkdir(parents=True)
            self.assertEqual(setup.resources_directory(root), root / "app-1.0.2/resources")


if __name__ == "__main__":
    unittest.main()
