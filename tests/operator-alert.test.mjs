import test from "node:test";
import assert from "node:assert/strict";
import { webhookUrl, notification, deliver } from "../scripts/operator-alert-lib.mjs";

test("webhooks reject alternate origins, credentials, query strings and redirects", async () => {
  for (const url of [
    "http://discord.com/api/webhooks/123/abc",
    "https://discord.com.evil/api/webhooks/123/abc",
    "https://discord.com/api/webhooks/123/abc?x=1",
    "https://user@discord.com/api/webhooks/123/abc",
  ])
    assert.throws(() => webhookUrl(url));
  let options;
  await deliver("https://discord.com/api/webhooks/123/fixture", "Test", async (_, init) => {
    options = init;
    return { ok: true };
  });
  assert.equal(options.redirect, "error");
  assert.deepEqual(JSON.parse(options.body).allowed_mentions, { parse: [] });
  await assert.rejects(
    deliver("https://discord.com/api/webhooks/123/fixture", "Test", async () => ({ ok: false })),
  );
});

test("alert state suppresses repeats and sends recovery only after failure", () => {
  assert.equal(notification(null, false, 100), null);
  assert.equal(notification(null, true, 100), "failure");
  assert.equal(notification({ failed: true, sentAt: 100 }, true, 200), null);
  assert.equal(notification({ failed: true, sentAt: 100 }, true, 3600100), "failure");
  assert.equal(notification({ failed: true, sentAt: 100 }, false, 200), "recovery");
  assert.equal(notification({ failed: false, sentAt: 100 }, false, 200), null);
});
