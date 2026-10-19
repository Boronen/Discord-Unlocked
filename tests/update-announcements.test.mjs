import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { announceUpdate, releaseNotes, verifyRelease } from "../scripts/announce-update.mjs";

const guild = "100000000000000001",
  channel = "100000000000000002",
  bot = "100000000000000003";
const messageId = "100000000000000004",
  tag = "v0.1.0-beta.2";
const markdown = `# Patch notes\n\n## Unreleased\n\nWork in progress.\n\n## ${tag}\n\n### Fixed\n\n- Visible banner layers.\n`;

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), "studio-update-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const posts = [];
  const { content } = releaseNotes(markdown, tag);
  const rest = {
    get: async (route) => {
      if (route === `/channels/${channel}`) return { guild_id: options.guild ?? guild, type: 0 };
      if (route === "/users/@me") return { id: bot };
      if (route === `/channels/${channel}/messages/${messageId}`)
        return { id: messageId, author: { id: options.author ?? bot }, content };
      throw new Error("Unexpected route");
    },
    post: async (route, request) => {
      posts.push({ route, ...request.body });
      if (options.fail) throw new Error("Ambiguous network failure");
      return { id: messageId };
    },
  };
  return { rest, directory, guild, channel, tag, content, posts };
}

test("release notes require an exact released tag, bound length and matching public release", () => {
  const { notes } = releaseNotes(markdown, tag);
  assert.equal(notes, "### Fixed\n\n- Visible banner layers.");
  assert.throws(() => releaseNotes(markdown, "../../elsewhere"));
  assert.throws(() => releaseNotes(markdown, "v9.0.0"));
  assert.throws(() => releaseNotes(`## ${tag}`, tag));
  assert.throws(() => releaseNotes(`## ${tag}\nUNRELEASED\n`, tag));
  assert.throws(() => releaseNotes(`## ${tag}\n${"a".repeat(2000)}`, tag));
  const release = {
    tag_name: tag,
    draft: false,
    published_at: "2026-10-19T00:00:00Z",
    html_url: `https://github.com/Boronen/Discord-Unlocked/releases/tag/${tag}`,
    assets: [{ id: 1 }],
    body: `${notes}\n\nInstall instructions`,
  };
  assert.doesNotThrow(() => verifyRelease(release, tag, notes));
  for (const patch of [{ draft: true }, { assets: [] }, { body: "Different notes" }, { tag_name: "v1.0.0" }])
    assert.throws(() => verifyRelease({ ...release, ...patch }, tag, notes));
});

test("a confirmed send has a durable receipt and cannot ping or repost on rerun", async (t) => {
  const f = await fixture(t);
  assert.equal((await announceUpdate(f)).sent, true);
  assert.deepEqual(await announceUpdate(f), { sent: false, messageId });
  assert.equal(f.posts.length, 1);
  assert.deepEqual(f.posts[0].allowed_mentions, { parse: [] });
  assert.equal(f.posts[0].enforce_nonce, true);
  assert.equal(f.posts[0].nonce.length, 25);
  const receipt = JSON.parse(await readFile(join(f.directory, `${guild}-${tag}.json`), "utf8"));
  assert.equal(receipt.status, "sent");
  assert.equal(receipt.messageId, messageId);
  await assert.rejects(announceUpdate({ ...f, content: "Edited release" }), /different announcement/);
});

test("concurrent senders post at most once", async (t) => {
  const f = await fixture(t);
  await Promise.allSettled([announceUpdate(f), announceUpdate(f)]);
  assert.equal(f.posts.length, 1);
});

test("an interrupted request stays pending and can be reconciled without another post", async (t) => {
  const f = await fixture(t, { fail: true });
  await assert.rejects(announceUpdate(f), /Ambiguous/);
  await assert.rejects(announceUpdate(f), /uncertain/);
  assert.equal(f.posts.length, 1);
  assert.deepEqual(await announceUpdate({ ...f, confirmMessage: messageId }), {
    sent: false,
    messageId,
    reconciled: true,
  });
  assert.equal(f.posts.length, 1);
  assert.equal((await announceUpdate(f)).sent, false);
});

test("wrong guild and a different message author cannot be used for publication/recovery", async (t) => {
  const otherGuild = await fixture(t, { guild: "100000000000000099" });
  await assert.rejects(announceUpdate(otherGuild), /this community/);
  assert.equal(otherGuild.posts.length, 0);
  const f = await fixture(t, { fail: true, author: "100000000000000099" });
  await assert.rejects(announceUpdate(f));
  await assert.rejects(announceUpdate({ ...f, confirmMessage: messageId }), /exact release announcement/);
  assert.equal(f.posts.length, 1);
});

test("reconciliation cannot create a fresh delivery claim", async (t) => {
  const f = await fixture(t);
  await assert.rejects(announceUpdate({ ...f, confirmMessage: messageId }), /no pending announcement/);
  assert.equal(f.posts.length, 0);
  assert.equal((await announceUpdate(f)).sent, true);
});
