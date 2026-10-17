import { test } from "node:test";
import assert from "node:assert/strict";
import { drillFailure } from "../scripts/drill-process.mjs";

test("restore diagnostics identify the failing stage without leaking restored data", () => {
  const privateValue = "private-profile-fixture";
  const error = drillFailure(
    "rehearse candidate migrations",
    1,
    null,
    `error: duplicate entry ${privateValue}\n query: INSERT '${privateValue}'\n code: '23505'`,
  );
  assert.match(error.message, /rehearse candidate migrations/);
  assert.match(error.message, /SQLSTATE 23505/);
  assert.equal(error.message.includes(privateValue), false);
  assert.equal(error.message.includes("INSERT"), false);
});

test("restore diagnostics distinguish resource and Docker failures without echoing paths", () => {
  assert.match(
    drillFailure("restore encrypted media", 1, null, "tar: private-name: No space left on device").message,
    /filesystem is full/,
  );
  assert.match(
    drillFailure("start isolated database", 125, null, "Cannot connect to the Docker daemon at secret-path")
      .message,
    /Docker daemon unavailable/,
  );
  assert.match(drillFailure("apply candidate recovery fences", 137, null, "").message, /process was killed/);
  assert.match(
    drillFailure("restore encrypted database", 1, null, "", true).message,
    /input stream did not finish/,
  );
  assert.equal(
    drillFailure(
      "restore encrypted media",
      1,
      null,
      "tar: private-name: No space left on device",
    ).message.includes("private-name"),
    false,
  );
});

test("restore diagnostics identify unreadable package configuration without leaking its contents", () => {
  const message = drillFailure(
    "rehearse candidate migrations",
    1,
    null,
    "Error: Invalid package config /app/package.json. Permission denied.\ncode: 'ERR_INVALID_PACKAGE_CONFIG'\nprivate manifest fixture",
  ).message;
  assert.match(message, /ERR_INVALID_PACKAGE_CONFIG; permission denied/);
  assert.equal(message.includes("private manifest fixture"), false);
});
