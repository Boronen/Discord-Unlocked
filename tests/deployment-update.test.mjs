import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const candidate = "sha256:" + "a".repeat(64);
const previous = "sha256:" + "b".repeat(64);
const linuxOnly = { skip: process.platform !== "linux" };
async function deployment(scenario) {
  const directory = await mkdtemp(join(tmpdir(), "ps-update-test-"));
  try {
    const bin = join(directory, "bin"),
      deploy = join(directory, "deploy"),
      log = join(directory, "commands.jsonl");
    await mkdir(bin);
    await mkdir(deploy);
    const source = await readFile(
      process.env.DEPLOYMENT_UPDATE_SCRIPT ?? new URL("../deploy/update-studio-v2.sh", import.meta.url),
      "utf8",
    );
    const envFile = join(directory, "empty-backup.env");
    await writeFile(envFile, "", { mode: 0o600 });
    await writeFile(
      join(deploy, "update.sh"),
      source
        .replaceAll("/usr/local/bin/node", `'${bin}/node'`)
        .replaceAll("/etc/profile-studio-backup/backup.env", envFile),
    );
    const mock = `#!/usr/local/bin/node
import {appendFileSync, readFileSync} from 'node:fs';
import {basename} from 'node:path';
const name=basename(process.argv[1]), a=process.argv.slice(2), log=process.env.MOCK_LOG;
const before=(()=>{try{return readFileSync(log,'utf8')}catch{return ''}})();
appendFileSync(log,JSON.stringify([name,...a])+'\\n');
if(name==='id') console.log('0');
if(name==='curl') console.log('{"ok":true}');
if(name==='node' && a.includes('scripts/restore-drill.mjs') && process.env.MOCK_SCENARIO==='drill-fails') process.exit(17);
if(name==='docker') {
  if(a[0]==='image' && a[1]==='inspect') console.log(process.env.MOCK_SCENARIO==='tag-changes' && before.includes('scripts/restore-drill.mjs') ? 'sha256:'+'c'.repeat(64) : '${candidate}');
  if(a[0]==='inspect') console.log(a.includes('{{.Image}}') ? '${previous}' : 'running');
  if(a[0]==='compose' && a[1]==='ps') console.log('fixture-'+a.at(-1));
}
`;
    for (const name of ["id", "curl", "node", "docker"])
      await writeFile(join(bin, name), mock, { mode: 0o755 });
    let status = 0,
      failure = "";
    try {
      execFileSync("sh", [join(deploy, "update.sh"), "--use-built-image", candidate], {
        env: { ...process.env, PATH: bin + ":" + process.env.PATH, MOCK_LOG: log, MOCK_SCENARIO: scenario },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      status = error.status;
      failure = error.stderr?.toString() ?? "";
    }
    return { status, failure, commands: (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse) };
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + "ps-update-test-"));
    await rm(directory, { recursive: true, force: true });
  }
}

test(
  "reusing an immutable image skips build while retaining all deployment gates and the running rollback image",
  linuxOnly,
  async () => {
    const { status, commands, failure } = await deployment("success");
    assert.equal(status, 0, failure + JSON.stringify(commands));
    assert.equal(
      commands.some((c) => c.includes("build")),
      false,
    );
    assert.ok(
      commands.some((c) => c[0] === "docker" && c[1] === "image" && c[2] === "tag" && c[3] === previous),
    );
    const index = (value) => commands.findIndex((c) => c.includes(value));
    assert.ok(index("scripts/backup-secure.mjs") < index("scripts/security-scan.mjs"));
    assert.ok(index("scripts/security-scan.mjs") < index("scripts/restore-drill.mjs"));
    assert.ok(index("scripts/restore-drill.mjs") < index("stop"));
    assert.ok(index("stop") < index("migrate"));
    assert.ok(index("migrate") < index("up"));
  },
);

for (const scenario of ["drill-fails", "tag-changes"])
  test(`deployment leaves live services untouched when ${scenario}`, linuxOnly, async () => {
    const { status, commands } = await deployment(scenario);
    assert.notEqual(status, 0);
    assert.ok(commands.some((c) => c.includes("scripts/restore-drill.mjs")));
    assert.equal(
      commands.some((c) => c[0] === "docker" && ["stop", "migrate", "up"].some((v) => c.includes(v))),
      false,
    );
  });
