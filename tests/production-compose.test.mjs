import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { productionComposeEnv } from "../scripts/production-compose.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function fixture(t) {
  const app = mkdtempSync(join(tmpdir(), "ps-compose-"));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  mkdirSync(join(app, "secrets"));
  mkdirSync(join(app, "deploy"));
  writeFileSync(join(app, "secrets", "privacy-notice.json"), '{"draft":true}');
  writeFileSync(join(app, "deploy", "privacy-notice.compose.example.yml"), "services: {}\n");
  const base = [join(app, "compose.yml"), join(app, "deploy", "production.yml")];
  const override = join(app, "deploy", "privacy-notice.compose.example.yml");
  const enable = (content = "enabled\n") =>
    writeFileSync(join(app, "secrets", "privacy-notice.enabled"), content);
  return { app, base, override, enable };
}

test("an unapproved notice file never changes existing development or timer configuration", (t) => {
  const { app, base } = fixture(t);
  const original = { COMPOSE_FILE: "custom.yml", OTHER: "preserved" };
  assert.deepEqual(productionComposeEnv(app, original), original);
  assert.deepEqual(original, { COMPOSE_FILE: "custom.yml", OTHER: "preserved" });
  assert.deepEqual(productionComposeEnv(app, {}), {});
  assert.equal(productionComposeEnv(app, original, true).COMPOSE_FILE, base.join(delimiter));
});

test("explicit activation preserves the same API override for inherited timer and update paths", (t) => {
  const { app, base, override, enable } = fixture(t);
  enable();
  const expected = [...base, override].join(delimiter);
  const timers = { COMPOSE_FILE: base.join(delimiter), OTHER: "preserved" };
  const resolved = productionComposeEnv(app, timers);
  assert.equal(resolved.COMPOSE_FILE, expected);
  assert.equal(resolved.OTHER, "preserved");
  assert.equal(timers.COMPOSE_FILE, base.join(delimiter));
  assert.equal(productionComposeEnv(app, {}, true).COMPOSE_FILE, expected);
  assert.equal(productionComposeEnv(app, resolved).COMPOSE_FILE, expected);
  assert.equal(
    productionComposeEnv(app, { COMPOSE_FILE: ["compose.yml", "deploy/production.yml"].join(delimiter) })
      .COMPOSE_FILE,
    expected,
  );
});

test("activation refuses unsupported or reordered Compose file sets without modifying the caller", (t) => {
  const { app, base, enable } = fixture(t);
  enable();
  for (const list of [[base[0]], [...base].reverse(), [...base, "unreviewed.yml"], [...base, ""]]) {
    const env = { COMPOSE_FILE: list.join(delimiter) };
    assert.throws(() => productionComposeEnv(app, env), /incompatible/);
    assert.equal(env.COMPOSE_FILE, list.join(delimiter));
  }
});

test("a malformed marker, missing notice or missing override fails closed before Compose", (t) => {
  for (const failure of ["marker", "notice", "override", "empty", "oversized"]) {
    const { app, enable, override } = fixture(t);
    enable(failure === "marker" ? "pending approval" : "enabled");
    const notice = join(app, "secrets", "privacy-notice.json");
    if (failure === "notice") rmSync(notice);
    if (failure === "override") rmSync(override);
    if (failure === "empty") writeFileSync(notice, "");
    if (failure === "oversized") writeFileSync(notice, "x".repeat(32769));
    assert.throws(() => productionComposeEnv(app, {}, true), /activation is invalid/);
  }
});

test("activation refuses linked notice files", { skip: process.platform === "win32" }, (t) => {
  const { app, enable } = fixture(t);
  enable();
  const notice = join(app, "secrets", "privacy-notice.json");
  const target = join(app, "other.json");
  writeFileSync(target, "{}");
  rmSync(notice);
  symlinkSync(target, notice);
  assert.throws(() => productionComposeEnv(app, {}, true), /activation is invalid/);
});

test(
  "Docker Compose resolves the real notice override only on the API without a daemon or live project",
  { skip: process.env.TEST_DOCKER_COMPOSE !== "1" },
  (t) => {
    const { app, override, enable } = fixture(t);
    writeFileSync(
      join(app, "compose.yml"),
      "services:\n  api:\n    image: synthetic:local\n  worker:\n    image: synthetic:local\n",
    );
    writeFileSync(join(app, "deploy", "production.yml"), "services: {}\n");
    writeFileSync(
      override,
      readFileSync(new URL("../deploy/privacy-notice.compose.example.yml", import.meta.url)),
    );
    const config = (env) =>
      JSON.parse(
        execFileSync("docker", ["compose", "config", "--format", "json"], {
          cwd: app,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    assert.equal(config(productionComposeEnv(app, process.env, true)).services.api.volumes, undefined);
    enable();
    const resolved = config(productionComposeEnv(app, process.env, true));
    assert.equal(
      resolved.services.api.environment.PRIVACY_NOTICE_FILE,
      "/run/profile-studio/privacy-notice.json",
    );
    const volume = resolved.services.api.volumes[0];
    assert.equal(volume.source, join(app, "secrets", "privacy-notice.json"));
    assert.equal(volume.target, "/run/profile-studio/privacy-notice.json");
    assert.equal(volume.read_only, true);
    assert.equal(resolved.services.worker.volumes, undefined);
  },
);
