import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    let failure = "";
    child.stderr.on("data", (chunk) => (failure += chunk));
    if (input) child.stdin.end(input);
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              `Docker security migration step failed: ${args.slice(0, 3).join(" ")} (${code}). ${failure
                .split(/\r?\n/)
                .filter((line) => /ERROR:|FATAL:/.test(line))
                .join(" ")
                .replace(/PASSWORD\s+'[^']*'/gi, "PASSWORD '[redacted]'")} Services remain closed.`,
            ),
          ),
    );
  });
}
const bootstrap = await readFile("secrets/bootstrap.sql", "utf8");
await run(["compose", "stop", "api", "bot", "worker"]);
try {
  await run(
    ["compose", "exec", "-T", "db", "psql", "-U", "profile", "-d", "profile", "-v", "ON_ERROR_STOP=1", "-q"],
    bootstrap,
  );
} catch {
  await run(
    ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", "profile", "-v", "ON_ERROR_STOP=1", "-q"],
    bootstrap,
  );
}
await run(["compose", "up", "-d", "db"]);
await run(["compose", "run", "--rm", "-T", "migrate"]);
await run(["compose", "create", "api"]);
const legacy = await run(["volume", "ls", "--format", "{{.Name}}"]);
if (legacy.split(/\r?\n/).includes("profile-studio_media")) {
  const copy = `const fs=require('node:fs/promises');(async()=>{for(const [from,to] of [['processed','/final'],['quarantine','/input']])for(const name of await fs.readdir('/legacy/'+from)){if(!/^[0-9a-f-]{36}\\.[a-z0-9]+$/.test(name))continue;const source='/legacy/'+from+'/'+name;if(!(await fs.lstat(source)).isFile())continue;await fs.copyFile(source,to+'/'+name,require('node:fs').constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='EEXIST')throw e;});}})().catch(()=>process.exit(1));`;
  await run([
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "-v",
    "profile-studio_media:/legacy:ro",
    "-v",
    "profile-studio_media_final:/final",
    "-v",
    "profile-studio_media_input:/input",
    "profile-studio:local",
    "node",
    "-e",
    copy,
  ]);
}
await run(["compose", "up", "-d", "api", "bot", "worker"]);
console.log(
  "Security migration complete. Legacy media retained pending operator cleanup approval; public launch stays gated.",
);
