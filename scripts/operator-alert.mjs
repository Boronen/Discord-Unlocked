import { spawn } from "node:child_process";
import { readFile, writeFile, rename } from "node:fs/promises";
import { deliver, notification } from "./operator-alert-lib.mjs";

const jobs = {
  backup: ["scripts/drive-backup.mjs", "daily"],
  journal: ["scripts/drive-backup.mjs", "journal"],
  monitor: ["scripts/monitor.mjs"],
};
const [mode, job] = process.argv.slice(2);
const directory = "/etc/profile-studio-backup";
try {
  if (mode === "test") {
    await deliver(
      await readFile(`${directory}/discord-webhook`, "utf8"),
      "Profile Studio: operator alert delivery test succeeded. No user data is included.",
    );
    console.log("Discord test notification delivered. Confirm it appeared in your private channel.");
  } else {
    if (mode !== "run" || !jobs[job]) throw new Error("Unknown operator job.");
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, jobs[job], { stdio: "inherit" });
      child.once("error", () => resolve(1));
      child.once("exit", (value) => resolve(value ?? 1));
    });
    const statePath = `${directory}/alert-${job}.json`;
    let previous;
    try {
      previous = JSON.parse(await readFile(statePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error("Alert state cannot be read.");
    }
    const now = Date.now();
    const kind = notification(previous, code !== 0, now);
    if (kind) {
      await deliver(
        await readFile(`${directory}/discord-webhook`, "utf8"),
        kind === "failure"
          ? `Profile Studio: ${job} check failed. Check the operator service logs on the server.`
          : `Profile Studio: ${job} check recovered.`,
      );
      const temporary = `${statePath}.tmp`;
      await writeFile(temporary, JSON.stringify({ failed: code !== 0, sentAt: now }), { mode: 0o600 });
      await rename(temporary, statePath);
    }
    process.exitCode = code;
  }
} catch {
  // Never print fetch errors: these can contain the credential-bearing webhook URL.
  console.error("Operator job or Discord notification failed. Check local configuration and service status.");
  process.exitCode = 1;
}
