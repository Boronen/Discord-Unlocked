import { expect, test } from "vitest";
import { DEFAULT_CONFIG, assetIds } from "../packages/plugin/model.js";
import {
  normalizeStudio,
  resolveScene,
  newLayer,
  legacyConfig,
  applyViewerOverride,
  configDiff,
} from "../packages/plugin/studio-model.js";
import { profileV2Schema } from "../packages/shared/studio-schema.js";
import { DraftHistory } from "../packages/plugin/draft-history.js";
import { AutomationController, matchRule } from "../packages/plugin/automation.js";
import { colorProposals, nearestBasic } from "../packages/plugin/color-proposals.js";
import { TINT_PALETTE } from "../packages/plugin/tint.js";
import { readViewerOverride, writeViewerOverride } from "../packages/plugin/viewer-overrides.js";
const asset = "11111111-1111-4111-8111-111111111111";
test("legacy effects, songs and colors migrate without changing the original object", () => {
  const old = {
    ...structuredClone(DEFAULT_CONFIG),
    effect: { source: "media" as const, id: asset },
    colors: ["#ffffff", "#000000"] as [string, string],
  };
  const v2 = normalizeStudio(old);
  expect(v2.studio.base.layers[0]?.assetId).toBe(asset);
  expect(v2.studio.small).toEqual({});
  expect(old).not.toHaveProperty("studio");
  expect(legacyConfig(v2).effect).toEqual(old.effect);
  expect(profileV2Schema.safeParse(v2).success).toBe(true);
});
test("view overrides and layer media references remain independent, with panel limits", () => {
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [{ ...newLayer("media"), assetId: asset }];
  c.studio.base.blocks = Array.from({ length: 8 }, (_, i) => ({
    id: `b${i}`,
    kind: "text" as const,
    title: "Panel",
    text: "Text",
    links: [],
    visible: true,
  }));
  c.studio.full.layers = [];
  expect(resolveScene(c, "small").blocks).toHaveLength(3);
  expect(resolveScene(c, "full").blocks).toHaveLength(8);
  expect(resolveScene(c, "full").layers).toHaveLength(0);
  expect(assetIds(c)).toEqual([asset]);
});
test("schema refuses excessive layers, executable links, duplicate IDs and oversized text", () => {
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = Array.from({ length: 4 }, () => newLayer());
  expect(profileV2Schema.safeParse(c).success).toBe(false);
  c.studio.base.layers = [];
  c.studio.base.blocks = [
    {
      id: "link",
      kind: "links",
      title: "Links",
      text: "",
      links: [{ label: "Unsafe", url: "javascript:alert(1)" }],
      visible: true,
    },
  ];
  expect(profileV2Schema.safeParse(c).success).toBe(false);
  c.studio.base.blocks[0]!.links = [];
  c.studio.base.blocks[0]!.text = "x".repeat(1001);
  expect(profileV2Schema.safeParse(c).success).toBe(false);
  c.studio.base.blocks[0]!.text = "Safe";
  expect(profileV2Schema.safeParse(c).success).toBe(true);
  c.studio.base.blocks.push(c.studio.base.blocks[0]!);
  expect(profileV2Schema.safeParse(c).success).toBe(false);
});
test("undo coalesces one drag, retains 100 independent steps and invalidates redo after an edit", () => {
  const h = new DraftHistory(DEFAULT_CONFIG);
  h.begin();
  for (let i = 0; i < 20; i++) h.push({ ...DEFAULT_CONFIG, audio: String(i) }, "drag", i * 100);
  h.end();
  expect(h.past).toHaveLength(1);
  expect(h.undo().audio).toBeNull();
  expect(h.redo().audio).toBe("19");
  for (let i = 0; i < 110; i++) {
    h.begin();
    h.push({ ...DEFAULT_CONFIG, audio: String(i) });
    h.end();
  }
  expect(h.past).toHaveLength(100);
  h.undo();
  h.push(DEFAULT_CONFIG, "new");
  expect(h.future).toHaveLength(0);
});
test("automation waits for stable priority, renews one target and releases when unmatched", async () => {
  let now = 1000;
  const calls: (string | null)[] = [];
  const controller = new AutomationController(
    async (id) => {
      calls.push(id);
    },
    () => now,
  );
  const rules = [
    {
      id: asset,
      kind: "game" as const,
      applicationId: "123456789012345678",
      presetId: "game",
      enabled: true,
    },
    { id: "music", kind: "music" as const, applicationId: "", presetId: "song", enabled: true },
  ];
  const presence = { status: "online", music: true, games: ["123456789012345678"] };
  expect(matchRule(rules, presence)).toBe("game");
  await controller.tick(true, 1, rules, presence);
  now += 19999;
  await controller.tick(true, 1, rules, presence);
  expect(calls).toEqual([]);
  now++;
  await controller.tick(true, 1, rules, presence);
  expect(calls).toEqual(["game"]);
  now += 30000;
  await controller.tick(true, 1, rules, presence);
  expect(calls).toEqual(["game", "game"]);
  const empty = { status: "offline", music: false, games: [] };
  await controller.tick(true, 1, rules, empty);
  now += 20000;
  await controller.tick(true, 1, rules, empty);
  expect(calls.at(-1)).toBeNull();
});
test("viewer changes are account scoped and never mutate the owner profile", () => {
  const c = normalizeStudio(DEFAULT_CONFIG);
  c.studio.base.layers = [newLayer()];
  c.decoration = { source: "media", id: asset };
  const value = writeViewerOverride("{}", "viewer", "owner", { effects: false, decoration: false });
  const result = applyViewerOverride(c, readViewerOverride(value, "viewer", "owner"));
  expect(result.studio!.base.layers).toHaveLength(0);
  expect(result.decoration).toBeNull();
  expect(c.decoration).not.toBeNull();
  expect(readViewerOverride(value, "different", "owner")).toEqual({});
});
test("three generated proposals differ and map every ordinary tint to the shared palette", () => {
  const proposals = colorProposals({ background: "#1e2840", accent: "#b32663", text: "#ffffff" });
  expect(new Set(proposals.map((p) => p.primary)).size).toBe(3);
  for (const p of proposals) expect(TINT_PALETTE.some((c) => c.color === nearestBasic(p.accent))).toBe(true);
});
test("moderation diff sees nested layer transformations and full profile overrides", () => {
  const c = normalizeStudio(DEFAULT_CONFIG),
    next = normalizeStudio(c);
  next.studio.full.layers = [newLayer()];
  expect(configDiff(c, next)).toContain("studio.full.layers");
});
