import { beforeAll, afterAll, afterEach, expect, test, vi } from "vitest";
import { setup, token, OWNER, BOB, ALICE } from "./helpers.js";
import { createApp } from "../packages/server/app.js";
import { FileStore } from "../packages/server/media.js";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudioClient } from "../packages/plugin/client.js";
let context: Awaited<ReturnType<typeof setup>>,
  app: Awaited<ReturnType<typeof createApp>>,
  session: string,
  owner: string;
beforeAll(async () => {
  context = await setup();
  const files = new FileStore(await mkdtemp(join(tmpdir(), "profile-music-")));
  await files.init();
  app = await createApp(context.service, files);
  session = await token(context.service, BOB);
  owner = await token(context.service, OWNER);
});
afterAll(async () => {
  await app.close();
  await context.raw.close();
});
afterEach(() => vi.unstubAllGlobals());
test("resolves a provider song without fetching arbitrary user URLs or returning embed HTML", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        title: "Favorite Song",
        author_name: "Artist",
        thumbnail_url: "https://i.scdn.co/image/cover",
        html: "<script>bad</script>",
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const url = "https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ";
  const response = await app.inject({
    url: `/v1/music/resolve?url=${encodeURIComponent(url)}`,
    headers: { authorization: `Bearer ${session}` },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    url,
    title: "Favorite Song",
    artist: "Artist",
    artwork: "https://i.scdn.co/image/cover",
  });
  expect(fetch.mock.calls[0]?.[0]).toContain("https://open.spotify.com/oembed?");
  const rejected = await app.inject({
    url: "/v1/music/resolve?url=https://127.0.0.1/private",
    headers: { authorization: `Bearer ${session}` },
  });
  expect(rejected.statusCode).toBe(400);
  expect(fetch).toHaveBeenCalledTimes(1);
});
test("imports catalogue batches only as owner and validates the batch before mutation", async () => {
  const item = {
    id: "catalogue-batch",
    kind: "effect",
    name: "Effect",
    imageUrl: "https://cdn.discordapp.com/effect.png",
    staticUrl: "https://cdn.discordapp.com/effect.png",
    discordAsset: null,
    layers: [],
  };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/admin/catalog/batch",
        headers: { authorization: `Bearer ${session}` },
        payload: [item],
      })
    ).statusCode,
  ).toBe(403);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/admin/catalog/batch",
        headers: { authorization: `Bearer ${owner}` },
        payload: [item, { ...item, id: "invalid", imageUrl: "https://evil.example/x" }],
      })
    ).statusCode,
  ).toBe(400);
  expect(await context.service.catalog()).toHaveLength(0);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/admin/catalog/batch",
        headers: { authorization: `Bearer ${owner}` },
        payload: [item],
      })
    ).statusCode,
  ).toBe(200);
  expect(await context.service.catalog()).toHaveLength(1);
});
test("valid use renews a remembered session to ninety days while logout revokes it", async () => {
  const value = await token(context.service, ALICE);
  await context.service.authenticate(value);
  const rows = await context.db.query(
    "SELECT expires_at>now()+interval '89 days' AS renewed FROM sessions WHERE user_id=$1",
    [ALICE],
  );
  expect(rows[0]?.renewed).toBe(true);
  await context.service.logout(value);
  await expect(context.service.authenticate(value)).rejects.toMatchObject({ status: 401 });
});

test("the client retrieves every catalog page beyond one thousand items", async () => {
  const item = {
    kind: "decoration",
    name: "Unowned shop item",
    imageUrl: "https://cdn.discordapp.com/a.png",
    staticUrl: "https://cdn.discordapp.com/a.png",
    discordAsset: "a_asset",
    layers: [],
  };
  await context.db.query(
    "INSERT INTO catalog(id,kind,item) SELECT 'page-'||lpad(n::text,4,'0'),'decoration',$1::jsonb||jsonb_build_object('id','page-'||lpad(n::text,4,'0')) FROM generate_series(1,1005) n",
    [JSON.stringify(item)],
  );
  let pages = 0;
  const paired = await token(context.service);
  const api = new StudioClient("http://localhost:3100", async (_base, path) => {
    pages++;
    const response = await app.inject({ url: path, headers: { authorization: `Bearer ${paired}` } });
    return { status: response.statusCode, body: response.body };
  });
  try {
    const result = await api.catalog();
    expect(pages).toBe(5);
    expect(result.filter((item) => item.id.startsWith("page-"))).toHaveLength(1005);
    expect(result.at(-1)?.id).toBe("page-1005");
  } finally {
    await context.db.query("DELETE FROM catalog WHERE id LIKE 'page-%'");
  }
});
