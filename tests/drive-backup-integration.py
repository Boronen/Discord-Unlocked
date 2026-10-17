"""Linux-only CLI exercise with fake Docker/Drive commands and disposable fixture data."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

TOOL = r'''#!/usr/bin/python3
import json, os, pathlib, shutil, sys
args = sys.argv[1:]
if pathlib.Path(sys.argv[0]).name == "docker":
    if "ps" in args:
        print("api\nbot\nworker")
    elif "pg_dump" in args:
        sys.stdout.buffer.write(b"synthetic database fixture")
    elif "tar" in args:
        sys.stdout.buffer.write(b"synthetic archive fixture")
    elif "cat" in args:
        print(json.dumps({"kind":"user","hash":"a"*64,"at":"2026-01-01T00:00:00.000Z"}))
    sys.exit(0)
commands = {"about","size","lsjson","cat","mkdir","copyto","copy","check","deletefile","rmdir"}
i = next(i for i,x in enumerate(args) if x in commands)
command, values = args[i], args[i+1:]
root = pathlib.Path(os.environ["FIXTURE_CLOUD"]).resolve()
def path(value):
    if value.startswith("fixture:"):
        p = (root / value.split(":",1)[1]).resolve()
        if not p.is_relative_to(root): raise ValueError("escaped fixture")
        return p
    return pathlib.Path(value)
if command == "about":
    print(json.dumps({"free":15*1024**3,"total":15*1024**3}))
elif command == "size":
    print(json.dumps({"bytes":sum(p.stat().st_size for p in path(values[0]).rglob("*") if p.is_file())}))
elif command == "lsjson":
    entries = list(path(values[0]).iterdir())
    if "--files-only" in values: entries = [p for p in entries if p.is_file()]
    if "--dirs-only" in values: entries = [p for p in entries if p.is_dir()]
    print(json.dumps([{"Name":p.name,"Path":p.name,"IsDir":p.is_dir(),"Size":p.stat().st_size} for p in entries]))
elif command == "cat":
    sys.stdout.buffer.write(path(values[0]).read_bytes())
elif command == "mkdir":
    path(values[0]).mkdir(parents=True,exist_ok=True)
elif command == "copyto":
    if path(values[1]).name == os.environ.get("FIXTURE_FAIL_COPY"):
        print("private-fixture-provider-credential",file=sys.stderr)
        sys.exit(3)
    if "--immutable" in values and path(values[1]).exists(): sys.exit(4)
    path(values[1]).parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(path(values[0]),path(values[1]))
elif command == "copy":
    source,dest = path(values[0]),path(values[1])
    dest.mkdir(parents=True,exist_ok=True)
    for p in source.iterdir(): shutil.copyfile(p,dest/p.name)
elif command == "check":
    source,dest = path(values[0]),path(values[1])
    for p in source.iterdir():
        if p.read_bytes() != (dest/p.name).read_bytes(): sys.exit(5)
elif command == "deletefile":
    path(values[0]).unlink()
elif command == "rmdir":
    path(values[0]).rmdir()
'''


def main():
    source = Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix="ps-drive-integration-") as directory:
        work = Path(directory)
        (work / "scripts").mkdir()
        for name in ("drive-backup.mjs", "drive-backup-lib.mjs", "backup-secure.mjs", "backup-crypto.mjs"):
            shutil.copyfile(source / "scripts" / name, work / "scripts" / name)
        (work / "bin").mkdir()
        tool = work / "bin" / "tool.py"
        tool.write_text(TOOL)
        tool.chmod(0o700)
        for name in ("docker", "rclone"):
            (work / "bin" / name).symlink_to(tool)
        (work / "secrets").mkdir(mode=0o700)
        import base64
        (work / "secrets" / "backup.key").write_text(base64.b64encode(os.urandom(32)).decode())
        (work / "secrets" / "rclone.conf").write_text("fixture only")
        cloud = work / "cloud" / "backups"
        cloud.mkdir(parents=True)
        env = {**os.environ, "PATH":str(work / "bin")+":"+os.environ["PATH"],
               "FIXTURE_CLOUD":str(work / "cloud"), "DRIVE_BACKUP_ROOT":"fixture:backups",
               "OFFSITE_BACKUP_ID":str(uuid.uuid4()), "DRIVE_OAUTH_PRODUCTION":"true"}
        node = shutil.which("node")
        assert node

        def run(mode, *args, extra=None, succeeds=True):
            result = subprocess.run([node,"scripts/drive-backup.mjs",mode,*args],cwd=work,
                                    env={**env,**(extra or {})},capture_output=True,text=True,timeout=60)
            assert (result.returncode == 0) == succeeds, (mode,result.stdout,result.stderr)
            assert "private-fixture-provider-credential" not in result.stdout + result.stderr
            return result

        for mode in ("init","daily","journal","journal","status"):
            run(mode)
        run("fetch-journal",str(work / "first.psb"))
        # Fail after replacing the inactive slot's ciphertext, before its manifest commits.
        run("journal",extra={"FIXTURE_FAIL_COPY":"slot0.json"},succeeds=False)
        run("status")
        run("fetch-journal",str(work / "fallback.psb"))
        assert (work / "first.psb").read_bytes() == (work / "fallback.psb").read_bytes()
        # Changed destination markers cannot silently redirect future backups.
        marker = cloud / "destination.json"
        value = json.loads(marker.read_text())
        value["id"] = str(uuid.uuid4())
        marker.write_text(json.dumps(value))
        run("status",succeeds=False)
        print("Drive CLI integration passed: snapshot/journal/status, interrupted-slot recovery, destination fencing, provider-error redaction.")


if __name__ == "__main__":
    main()
